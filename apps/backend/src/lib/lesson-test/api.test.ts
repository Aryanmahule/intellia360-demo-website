/**
 * Lesson tests through the real routes: serving, grading once, the lesson
 * screen's summary and the Learning Path history — against the in-memory fake
 * database, with the session cookie mocked.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/adaptive/test-support/fake-db";
import { correctOptionId, getQuestion } from "@/lib/adaptive/question-bank";

const h = vi.hoisted(() => {
  const state: { current: { db: Record<string, unknown> } | null } = { current: null };
  const db = new Proxy({}, { get: (_t, prop) => (state.current!.db as Record<string | symbol, unknown>)[prop] });
  return { state, db, getSession: vi.fn() };
});

vi.mock("@/lib/auth/session", () => ({ getSession: h.getSession }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET as quizGET } from "@/app/api/student/quiz/[quizId]/route";
import { POST as submitPOST } from "@/app/api/student/quiz/submit/route";
import { GET as resourcesGET } from "@/app/api/student/lesson-resources/route";
import { GET as progressGET } from "@/app/api/student/adaptive-learning/progress/route";

const STUDENT = "user-student";
const LESSON = "counting-numbers-up-to-100";

let fake: ReturnType<typeof createFakeDb>;

function req(path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

interface ServedQuiz {
  id: string;
  lessonId: string;
  mode: string;
  sessionId: string;
  questions: { id: string; options: { id: string; text: string }[] }[];
}

async function serve(lessonId = LESSON, grade = "grade1"): Promise<ServedQuiz> {
  const res = await quizGET(req(`/api/student/quiz/test-${lessonId}?grade=${grade}`), params({ quizId: `test-${lessonId}` }));
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

function answers(quiz: ServedQuiz, right: (i: number) => boolean) {
  return Object.fromEntries(
    quiz.questions.map((q, i) => {
      const key = correctOptionId(getQuestion(q.id)!)!;
      return [q.id, right(i) ? key : q.options.find((o) => o.id !== key)!.id];
    })
  );
}

function submit(quiz: ServedQuiz, given: Record<string, string>) {
  return submitPOST(req("/api/student/quiz/submit", { quizId: quiz.id, sessionId: quiz.sessionId, lessonId: quiz.lessonId, answers: given }));
}

beforeEach(() => {
  fake = createFakeDb();
  h.state.current = fake as unknown as { db: Record<string, unknown> };
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ sub: STUDENT, role: "STUDENT", name: "Test", email: "s@x.test" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake.table("studentProfile").push({ id: "p-student", userId: STUDENT, grade: "grade1", xpPoints: 0, streakDays: 0 });
});

describe("serving a lesson test", () => {
  it("serves the lesson's own questions, without answer keys, pinned in a session", async () => {
    const quiz = await serve();
    expect(quiz.id).toBe(`test-${LESSON}`);
    expect(quiz.mode).toBe("test");
    expect(quiz.questions).toHaveLength(8);
    for (const q of quiz.questions) {
      expect(q.id).toMatch(/^lt\.counting\.100\./);
      for (const o of q.options) expect(o).not.toHaveProperty("isCorrect");
    }
    const session = fake.table("quizSession")[0];
    expect(session).toMatchObject({ userId: STUDENT, grade: "grade1", mode: "test", quizId: `test-${LESSON}` });
    expect(session.questionIds).toEqual(quiz.questions.map((q) => q.id));
  });

  it("finds a lesson file whose id differs from the curriculum's", async () => {
    const quiz = await serve("counting-up-to-100");
    expect(quiz.questions[0].id).toMatch(/^lt\.counting\.100\./);
  });

  it("returns 404 for an unknown lesson or grade", async () => {
    for (const [quizId, grade] of [["test-no-such-lesson", "grade1"], [`test-${LESSON}`, "../etc"]]) {
      const res = await quizGET(req(`/api/student/quiz/${quizId}?grade=${grade}`), params({ quizId }));
      expect(res.status).toBe(404);
    }
  });

  it("needs a signed-in student", async () => {
    h.getSession.mockResolvedValue(null);
    const res = await quizGET(req(`/api/student/quiz/test-${LESSON}?grade=grade1`), params({ quizId: `test-${LESSON}` }));
    expect(res.status).toBe(401);
  });
});

describe("submitting a lesson test", () => {
  it("grades once, shows the right answers and counts towards mastery", async () => {
    const quiz = await serve();
    const res = await submit(quiz, answers(quiz, (i) => i < 6));
    expect(res.status).toBe(201);
    const result = (await res.json()).data;

    expect(result).toMatchObject({ mode: "test", lessonId: LESSON, correctAnswers: 6, totalQuestions: 8, scorePercent: 75 });
    const missed = result.review.filter((r: { isCorrect: boolean }) => !r.isCorrect);
    expect(missed).toHaveLength(2);
    for (const r of missed) {
      expect(r.correctOptionId).toBe(correctOptionId(getQuestion(r.questionId)!));
      expect(r.explanation).toBeTruthy();
    }

    expect(fake.table("quizAttempt")).toEqual([
      expect.objectContaining({ userId: STUDENT, lessonId: LESSON, quizId: `test-${LESSON}`, scorePercent: 75 }),
    ]);
    expect(fake.table("studentProfile")[0].xpPoints).toBe(result.xpEarned);
    const counting = fake.table("skillMastery").find((r) => r.skill === "counting")!;
    expect(counting).toMatchObject({ grade: "grade1", attempts: 8, correct: 6 });
    expect((counting.recent as { s: string }[]).every((e) => e.s === "test")).toBe(true);

    // A retry replays the stored result without a second reward.
    const again = await (await submit(quiz, answers(quiz, () => true))).json();
    expect(again.data).toMatchObject({ alreadySubmitted: true, scorePercent: 75 });
    expect(fake.table("quizAttempt")).toHaveLength(1);
  });

  it("refuses a lesson test without a session", async () => {
    const res = await submitPOST(req("/api/student/quiz/submit", { quizId: `test-${LESSON}`, answers: {} }));
    expect(res.status).toBe(400);
  });

  it("refuses answers to questions the session did not serve", async () => {
    const quiz = await serve();
    const res = await submit(quiz, { "lt.counting.100.00000001": "a" });
    expect(res.status).toBe(400);
  });
});

describe("the lesson screen", () => {
  async function resources(lessonId = LESSON) {
    const res = await resourcesGET(req(`/api/student/lesson-resources?lessonId=${lessonId}&grade=grade1`));
    expect(res.status).toBe(200);
    return (await res.json()).data;
  }

  it("describes the test before it starts, then the student's results", async () => {
    expect((await resources()).test).toEqual({
      available: true,
      quizId: `test-${LESSON}`,
      questionCount: 8,
      durationSeconds: 8 * 90,
      covers: ["Counting"],
      chapterTest: false,
      attempts: 0,
      bestScore: null,
      lastScore: null,
    });

    const first = await serve();
    await submit(first, answers(first, (i) => i < 4));
    const second = await serve();
    await submit(second, answers(second, (i) => i < 2));

    expect((await resources()).test).toMatchObject({ attempts: 2, bestScore: 50, lastScore: 25 });
  });

  it("marks a chapter test series and lists the lessons it covers", async () => {
    const test = (await resources("numbers-and-counting-test-series")).test;
    expect(test).toMatchObject({ available: true, chapterTest: true, questionCount: 10 });
    expect(test.covers).toContain("Ordinal numbers (first, second, third)");
  });

  it("has no test for a lesson it cannot find", async () => {
    expect((await resources("no-such-lesson")).test).toEqual({ available: false });
  });
});

describe("Learning Path", () => {
  it("lists the test in the history and its misses in the mistakes", async () => {
    const quiz = await serve();
    await submit(quiz, answers(quiz, (i) => i !== 0));

    const progress = (await (await progressGET(req("/api/student/adaptive-learning/progress"))).json()).data;
    expect(progress.quizzes[0]).toMatchObject({ kind: "test", title: "Counting numbers up to 100 test", correct: 7, total: 8 });
    expect(progress.mistakes).toEqual([
      expect.objectContaining({ questionId: quiz.questions[0].id, source: "test", skill: "counting" }),
    ]);
  });
});
