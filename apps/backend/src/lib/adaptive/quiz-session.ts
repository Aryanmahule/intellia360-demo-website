/**
 * Quiz sessions: serve once, grade once.
 *
 * Serving a quiz pins its question ids in a QuizSession row. Submitting:
 *
 *  1. Loads the session for the signed-in student only (someone else's id is
 *     simply "not found").
 *  2. Replays the stored result if it was already submitted — a retry or a
 *     double-click never earns twice.
 *  3. Rejects expired sessions, answers to questions the session did not
 *     serve, and option ids those questions do not have.
 *  4. Grades against the bank's answer key, server-side.
 *  5. In one transaction: claims the session (OPEN → SUBMITTED, conditional, so
 *     only one concurrent request can win), records the QuizAttempt, awards XP,
 *     and stores the result.
 *  6. Then, separately, folds the answers into skill mastery. A failure there
 *     is logged and skipped; it can never undo or fail the submission.
 *
 * XP uses the existing practice formula (score-scaled, max 50). Nothing here
 * accepts a score, an XP amount or a mastery value from the client.
 */
import type { Prisma } from "@prisma/client";
import { ADAPTIVE_CONFIG } from "@/lib/adaptive/config";
import { correctOptionId, getQuestion } from "@/lib/adaptive/question-bank";
import { recordEvidenceSafely, withTransactionRetry, type GradedResponse } from "@/lib/adaptive/store";
import { lessonIdFromQuizId, xpForScore } from "@/lib/student/practice-quiz";
import { lessonIdFromTestQuizId } from "@/lib/lesson-test/lesson-test";
import type {
  QuizReviewItem,
  QuizSubmitResult,
} from "@intellia360/shared/types/api/adaptive-learning";

export type QuizMode = "practice" | "adaptive" | "test";

type Tx = Pick<Prisma.TransactionClient, "quizSession" | "quizAttempt" | "skillMastery" | "studentProfile">;

/** The slice of the Prisma client sessions need — narrow so tests can fake it. */
export interface SessionDb extends Tx {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export async function createQuizSession(
  db: Pick<Prisma.TransactionClient, "quizSession">,
  args: {
    userId: string;
    grade: string;
    quizId: string;
    mode: QuizMode;
    questionIds: string[];
    focusSkill?: string | null;
    targetLevel?: number | null;
    now?: Date;
  }
): Promise<{ id: string; expiresAt: Date }> {
  const now = args.now ?? new Date();
  const expiresAt = new Date(now.getTime() + ADAPTIVE_CONFIG.quiz.sessionTtlMinutes * 60_000);
  const session = await db.quizSession.create({
    data: {
      userId: args.userId,
      grade: args.grade,
      quizId: args.quizId,
      mode: args.mode,
      focusSkill: args.focusSkill ?? null,
      targetLevel: args.targetLevel ?? null,
      questionIds: args.questionIds,
      expiresAt,
      createdAt: now,
    },
    select: { id: true, expiresAt: true },
  });
  return session;
}

export interface SubmitError {
  status: 400 | 404 | 409 | 410;
  message: string;
}

/**
 * Checks every submitted answer refers to a question this session served and
 * to an option that question has. Unanswered questions are allowed (they score
 * as incorrect, as they always have).
 */
export function validateAnswers(questionIds: string[], answers: Record<string, string>): SubmitError | null {
  const served = new Set(questionIds);
  for (const [questionId, optionId] of Object.entries(answers)) {
    if (!served.has(questionId)) {
      return { status: 400, message: "An answer was submitted for a question that is not in this quiz." };
    }
    const question = getQuestion(questionId);
    if (!question) {
      return { status: 409, message: "This quiz is out of date. Please start it again." };
    }
    if (!question.options.some((o) => o.id === optionId)) {
      return { status: 400, message: "An answer was submitted with an option that question does not have." };
    }
  }
  return null;
}

export interface GradedQuestion extends GradedResponse {
  selectedOptionId: string | null;
  correctOptionId: string | null;
  explanation: string;
}

/** Grades against the bank's answer key. Questions missing from the bank are skipped. */
export function gradeQuestions(questionIds: string[], answers: Record<string, string>): GradedQuestion[] {
  const graded: GradedQuestion[] = [];
  for (const id of questionIds) {
    const q = getQuestion(id);
    if (!q) continue;
    const selected = answers[id] ?? null;
    const correct = correctOptionId(q);
    graded.push({
      questionId: id,
      skill: q.skill,
      difficulty: q.difficulty,
      correct: selected !== null && selected === correct,
      selectedOptionId: selected,
      correctOptionId: correct,
      explanation: q.explanation,
    });
  }
  return graded;
}

/**
 * What a student sees after submitting. Adaptive quizzes and lesson tests
 * serve new questions on every attempt and teach from mistakes, so they reveal
 * the explanation and, for misses, the right answer. Practice quizzes serve the
 * same questions on every retry, so — as before — they only say which answers
 * were right.
 */
export function buildReview(mode: QuizMode, graded: GradedQuestion[]): QuizReviewItem[] {
  return graded.map((g) => {
    if (mode === "practice") return { questionId: g.questionId, isCorrect: g.correct };
    return {
      questionId: g.questionId,
      isCorrect: g.correct,
      explanation: g.explanation || undefined,
      ...(g.correct || !g.correctOptionId ? {} : { correctOptionId: g.correctOptionId }),
    };
  });
}

class AlreadySubmitted extends Error {}

function storedResult(value: Prisma.JsonValue | null): QuizSubmitResult | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as QuizSubmitResult) : null;
}

export async function submitQuizSession(
  db: SessionDb,
  args: { userId: string; sessionId: string; quizId: string; answers: Record<string, string>; now?: Date }
): Promise<{ ok: true; result: QuizSubmitResult } | { ok: false; error: SubmitError }> {
  const now = args.now ?? new Date();
  const findSession = () =>
    db.quizSession.findFirst({
      where: { id: args.sessionId, userId: args.userId },
      select: {
        id: true,
        grade: true,
        quizId: true,
        mode: true,
        questionIds: true,
        status: true,
        result: true,
        expiresAt: true,
      },
    });

  const session = await findSession();
  if (!session) return { ok: false, error: { status: 404, message: "That quiz session was not found." } };
  if (session.quizId !== args.quizId) {
    return { ok: false, error: { status: 400, message: "The quiz id does not match this session." } };
  }

  const replay = () => {
    const stored = storedResult(session.result);
    return stored
      ? { ok: true as const, result: { ...stored, alreadySubmitted: true } }
      : { ok: false as const, error: { status: 409 as const, message: "This quiz is already being submitted." } };
  };
  if (session.status !== "OPEN") return replay();

  if (session.expiresAt.getTime() < now.getTime()) {
    return { ok: false, error: { status: 410, message: "This quiz session has expired. Please start the quiz again." } };
  }

  const invalid = validateAnswers(session.questionIds, args.answers);
  if (invalid) return { ok: false, error: invalid };

  const graded = gradeQuestions(session.questionIds, args.answers);
  if (graded.length === 0) {
    return { ok: false, error: { status: 409, message: "This quiz is out of date. Please start it again." } };
  }

  const mode: QuizMode = session.mode === "adaptive" || session.mode === "test" ? session.mode : "practice";
  const correctAnswers = graded.filter((g) => g.correct).length;
  const scorePercent = Math.round((correctAnswers / graded.length) * 100);
  const xpEarned = xpForScore(scorePercent);
  const lessonId =
    mode === "adaptive"
      ? "adaptive-practice"
      : mode === "test"
        ? (lessonIdFromTestQuizId(session.quizId) ?? "lesson-test")
        : (lessonIdFromQuizId(session.quizId) ?? "mixed-practice");

  try {
    const result = await withTransactionRetry(() =>
      db.$transaction(async (tx) => {
        // Claim first: only one request can move this session out of OPEN.
        const claim = await tx.quizSession.updateMany({
          where: { id: session.id, userId: args.userId, status: "OPEN" },
          data: { status: "SUBMITTED", submittedAt: now, answers: args.answers },
        });
        if (claim.count !== 1) throw new AlreadySubmitted();

        await tx.quizAttempt.create({
          data: { userId: args.userId, lessonId, quizId: session.quizId, scorePercent, submittedAt: now },
        });

        // Best-effort like the existing practice route: a student without a
        // profile row still gets a graded result.
        await tx.studentProfile.updateMany({
          where: { userId: args.userId },
          data: { xpPoints: { increment: xpEarned }, lastActiveDate: now },
        });

        const outcome: QuizSubmitResult = {
          quizId: session.quizId,
          lessonId,
          sessionId: session.id,
          mode,
          scorePercent,
          correctAnswers,
          totalQuestions: graded.length,
          xpEarned,
          review: buildReview(mode, graded),
          mastery: [],
          alreadySubmitted: false,
        };

        await tx.quizSession.update({
          where: { id: session.id },
          data: { result: outcome as unknown as Prisma.InputJsonValue },
        });
        return outcome;
      })
    );

    // The submission is committed. Mastery is recorded separately so that a
    // problem in the adaptive tables can never fail it; only the request that
    // won the claim gets here, so evidence lands at most once.
    const mastery = await recordEvidenceSafely(db, {
      userId: args.userId,
      grade: session.grade,
      responses: graded,
      source: mode,
      now,
    });
    if (mastery) {
      result.mastery = mastery;
      try {
        await db.quizSession.update({
          where: { id: session.id },
          data: { result: result as unknown as Prisma.InputJsonValue },
        });
      } catch (err) {
        // A replay would just show no mastery change; the submission stands.
        console.error("[adaptive] could not store mastery on the session result:", err);
      }
    }
    return { ok: true, result };
  } catch (err) {
    if (!(err instanceof AlreadySubmitted)) throw err;
    // Another request won the claim; return what it stored.
    const latest = await findSession();
    const stored = storedResult(latest?.result ?? null);
    return stored
      ? { ok: true, result: { ...stored, alreadySubmitted: true } }
      : { ok: false, error: { status: 409, message: "This quiz is already being submitted." } };
  }
}
