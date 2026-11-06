import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { correctOptionId, getQuestion, questionPool } from "@/lib/adaptive/question-bank";
import {
  createQuizSession,
  submitQuizSession,
  validateAnswers,
  type SessionDb,
} from "@/lib/adaptive/quiz-session";
import { createFakeDb } from "@/lib/adaptive/test-support/fake-db";

const USER = "student-1";
const OTHER = "student-2";
const NOW = new Date("2026-10-18T12:00:00Z");
const QUESTIONS = questionPool("grade3").slice(0, 5).map((q) => q.id);

function rightAnswers(ids = QUESTIONS): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, correctOptionId(getQuestion(id)!)!]));
}

function wrongAnswers(ids = QUESTIONS): Record<string, string> {
  return Object.fromEntries(
    ids.map((id) => [id, getQuestion(id)!.options.find((o) => !o.isCorrect)!.id])
  );
}

let fake: ReturnType<typeof createFakeDb>;
let db: SessionDb;

async function serve(mode: "practice" | "adaptive" = "practice", userId = USER, quizId = "practice-x") {
  return createQuizSession(db, { userId, grade: "grade3", quizId, mode, questionIds: QUESTIONS, now: NOW });
}

function submit(sessionId: string, answers: Record<string, string>, opts: { userId?: string; quizId?: string; now?: Date } = {}) {
  return submitQuizSession(db, {
    userId: opts.userId ?? USER,
    sessionId,
    quizId: opts.quizId ?? "practice-x",
    answers,
    now: opts.now ?? NOW,
  });
}

function profile() {
  return fake.table("studentProfile").find((p) => p.userId === USER)!;
}

function masteryAttempts(): number {
  return fake.table("skillMastery").reduce((sum, r) => sum + (r.attempts as number), 0);
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  fake = createFakeDb();
  db = fake.db as unknown as SessionDb;
  fake.table("studentProfile").push({ id: "p1", userId: USER, xpPoints: 100 });
});

describe("serving", () => {
  it("pins the question ids and an expiry", async () => {
    const s = await serve();
    const row = fake.table("quizSession")[0];
    expect(row.questionIds).toEqual(QUESTIONS);
    expect(row.status).toBe("OPEN");
    expect(s.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("grading", () => {
  it("scores a correct submission, records the attempt, awards XP and updates mastery", async () => {
    const s = await serve();
    const out = await submit(s.id, rightAnswers());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.scorePercent).toBe(100);
    expect(out.result.correctAnswers).toBe(5);
    expect(out.result.xpEarned).toBe(50);
    expect(out.result.alreadySubmitted).toBe(false);
    expect(profile().xpPoints).toBe(150);
    expect(fake.table("quizAttempt")).toHaveLength(1);
    expect(fake.table("quizAttempt")[0]).toMatchObject({ userId: USER, quizId: "practice-x", lessonId: "x", scorePercent: 100 });
    expect(masteryAttempts()).toBe(5);
    expect(out.result.mastery.length).toBeGreaterThan(0);
    // Practice review says which answers were right — never the answer key.
    expect(out.result.review.every((r) => r.correctOptionId === undefined && r.explanation === undefined)).toBe(true);
  });

  it("scores an incorrect submission and records it as evidence", async () => {
    const s = await serve("adaptive", USER, "adaptive");
    const out = await submit(s.id, wrongAnswers(), { quizId: "adaptive" });
    if (!out.ok) throw new Error(out.error.message);
    expect(out.result.scorePercent).toBe(0);
    expect(out.result.xpEarned).toBe(0);
    expect(fake.table("skillMastery").every((r) => r.correct === 0)).toBe(true);
    expect(fake.table("quizAttempt")[0].lessonId).toBe("adaptive-practice");
    // Adaptive review teaches from mistakes.
    for (const r of out.result.review) {
      expect(r.isCorrect).toBe(false);
      expect(r.correctOptionId).toBe(correctOptionId(getQuestion(r.questionId)!));
    }
  });

  it("counts unanswered questions as incorrect", async () => {
    const s = await serve();
    const out = await submit(s.id, rightAnswers(QUESTIONS.slice(0, 2)));
    if (!out.ok) throw new Error(out.error.message);
    expect(out.result.correctAnswers).toBe(2);
    expect(out.result.scorePercent).toBe(40);
    expect(masteryAttempts()).toBe(5);
  });

  it("still grades when the student has no profile row yet", async () => {
    fake.table("studentProfile").length = 0;
    const s = await serve();
    const out = await submit(s.id, rightAnswers());
    expect(out.ok).toBe(true);
  });
});

describe("validation", () => {
  it("rejects an answer to a question the session did not serve", async () => {
    const s = await serve();
    const stray = questionPool("grade5").find((q) => !QUESTIONS.includes(q.id))!.id;
    const out = await submit(s.id, { ...rightAnswers(), [stray]: "a" });
    expect(out).toEqual({ ok: false, error: expect.objectContaining({ status: 400 }) });
    expect(fake.table("quizAttempt")).toHaveLength(0);
    expect(profile().xpPoints).toBe(100);
    expect(fake.table("quizSession")[0].status).toBe("OPEN");
  });

  it("rejects an option the question does not have", async () => {
    const s = await serve();
    const out = await submit(s.id, { [QUESTIONS[0]]: "zz" });
    expect(out).toEqual({ ok: false, error: expect.objectContaining({ status: 400 }) });
  });

  it("validateAnswers accepts an empty submission", () => {
    expect(validateAnswers(QUESTIONS, {})).toBeNull();
  });

  it("hides another student's session", async () => {
    const s = await serve("practice", OTHER);
    const out = await submit(s.id, rightAnswers());
    expect(out).toEqual({ ok: false, error: expect.objectContaining({ status: 404 }) });
    expect(fake.table("quizSession")[0].status).toBe("OPEN");
  });

  it("rejects a quiz id that does not match the session", async () => {
    const s = await serve();
    const out = await submit(s.id, rightAnswers(), { quizId: "practice-other" });
    expect(out).toEqual({ ok: false, error: expect.objectContaining({ status: 400 }) });
  });

  it("refuses an expired session", async () => {
    const s = await serve();
    const out = await submit(s.id, rightAnswers(), { now: new Date(NOW.getTime() + 24 * 3_600_000) });
    expect(out).toEqual({ ok: false, error: expect.objectContaining({ status: 410 }) });
  });
});

describe("idempotency", () => {
  it("replays a retried submission without a second reward", async () => {
    const s = await serve();
    const first = await submit(s.id, rightAnswers());
    const retry = await submit(s.id, wrongAnswers());
    if (!first.ok || !retry.ok) throw new Error("expected success");
    expect(retry.result.alreadySubmitted).toBe(true);
    // The retry gets the original result, not a regrade of the new answers.
    expect(retry.result.scorePercent).toBe(100);
    expect(profile().xpPoints).toBe(150);
    expect(fake.table("quizAttempt")).toHaveLength(1);
    expect(masteryAttempts()).toBe(5);
  });

  it("awards exactly once under concurrent duplicate submissions", async () => {
    const s = await serve();
    const results = await Promise.all([1, 2, 3].map(() => submit(s.id, rightAnswers())));
    expect(results.every((r) => r.ok)).toBe(true);
    const fresh = results.filter((r) => r.ok && !r.result.alreadySubmitted);
    expect(fresh).toHaveLength(1);
    expect(profile().xpPoints).toBe(150);
    expect(fake.table("quizAttempt")).toHaveLength(1);
    expect(masteryAttempts()).toBe(5);
  });

  it("retries when a mastery row changes underneath the transaction", async () => {
    let armed = false;
    let conflicts = 0;
    fake = createFakeDb({
      beforeUpdateMany: (table, draft) => {
        if (table !== "skillMastery" || !armed) return;
        armed = false;
        conflicts++;
        // Another request commits a mastery write between our read and our update.
        for (const rows of [draft.skillMastery ?? [], fake.table("skillMastery")]) {
          rows.forEach((r) => (r.version = (r.version as number) + 1));
        }
      },
    });
    db = fake.db as unknown as SessionDb;
    fake.table("studentProfile").push({ id: "p1", userId: USER, xpPoints: 0 });

    // First quiz creates the mastery rows, so the second takes the update path.
    const seed = await serve();
    await submit(seed.id, rightAnswers());
    const before = fake.transactionCount();

    armed = true;
    const s = await serve();
    const out = await submit(s.id, wrongAnswers());

    expect(out.ok).toBe(true);
    expect(conflicts).toBe(1);
    // The submission, then the mastery transaction: conflicted once, retried once.
    expect(fake.transactionCount() - before).toBe(3);
    // Applied exactly once despite the retry.
    expect(masteryAttempts()).toBe(10);
    expect(fake.table("quizAttempt")).toHaveLength(2);
    expect(profile().xpPoints).toBe(50);
  });
});

describe("isolation from the existing quiz flow", () => {
  it("a failing mastery table never fails the submission, its XP or its attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake = createFakeDb({
      beforeOperation: (table) => {
        if (table === "skillMastery") throw new Error("collection unavailable");
      },
    });
    db = fake.db as unknown as SessionDb;
    fake.table("studentProfile").push({ id: "p1", userId: USER, xpPoints: 100 });

    const s = await serve();
    const out = await submit(s.id, rightAnswers());
    if (!out.ok) throw new Error(out.error.message);
    expect(out.result.scorePercent).toBe(100);
    expect(out.result.mastery).toEqual([]);
    expect(profile().xpPoints).toBe(150);
    expect(fake.table("quizAttempt")).toHaveLength(1);
    expect(fake.table("quizSession")[0].status).toBe("SUBMITTED");

    // And the retry is still a replay, not a second award.
    const retry = await submit(s.id, rightAnswers());
    if (!retry.ok) throw new Error(retry.error.message);
    expect(retry.result.alreadySubmitted).toBe(true);
    expect(profile().xpPoints).toBe(150);
  });
});
