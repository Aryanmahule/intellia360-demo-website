/**
 * Lesson tests — the "Test" module of the student lesson screen.
 *
 * Each lesson gets a test written for its own topic (see topics.ts): eight
 * questions, or ten for a chapter's "Test Series" lesson. Every serve draws
 * fresh questions, because each one is written from a new random seed; the
 * quiz session pins the question ids, and grading rebuilds each question from
 * its id (core.ts), so answers are checked server-side as for every other quiz.
 *
 * Quiz ids are `test-<lessonId>`.
 */
import crypto from "crypto";
import { createRng, writeQuestion, type GeneratedQuestion } from "@/lib/lesson-test/core";
import { FAMILIES } from "@/lib/lesson-test/families";
import { planLessonTest, type LessonPlan, type LessonTopic } from "@/lib/lesson-test/topics";
import type { PublicQuiz } from "@/lib/student/practice-quiz";
import type { LessonTestSummary } from "@intellia360/shared/types/api/lesson-resources";

const PREFIX = "test-";

export const LESSON_TEST_SIZE = 8;
export const TEST_SERIES_SIZE = 10;
/** Fewer distinct questions than this and the lesson has no test. */
export const MIN_TEST_SIZE = 5;
/** More than the practice quiz's 60: a test is not a race, and young pupils read slowly. */
export const SECONDS_PER_QUESTION = 90;
/** "Which decimal is the greatest?" may appear twice, with different options — never more. */
const MAX_SAME_STEM = 2;

export function lessonTestQuizId(lessonId: string): string {
  return `${PREFIX}${lessonId}`;
}

export function isLessonTestQuizId(quizId: string): boolean {
  return quizId.startsWith(PREFIX) && quizId.length > PREFIX.length;
}

export function lessonIdFromTestQuizId(quizId: string): string | null {
  return isLessonTestQuizId(quizId) ? quizId.slice(PREFIX.length) : null;
}

function testSize(plan: LessonPlan): number {
  return plan.testSeries ? TEST_SERIES_SIZE : LESSON_TEST_SIZE;
}

/** What the lesson screen shows before a test starts, or null when no test fits the lesson. */
export function summarizeLessonTest(lessonId: string, topic: LessonTopic): LessonTestSummary | null {
  const plan = planLessonTest(topic);
  if (plan.picks.length === 0) return null;
  const questionCount = testSize(plan);
  return {
    quizId: lessonTestQuizId(lessonId),
    questionCount,
    durationSeconds: questionCount * SECONDS_PER_QUESTION,
    covers: plan.covers,
    chapterTest: plan.testSeries,
  };
}

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export interface BuiltLessonTest {
  quiz: PublicQuiz;
  questionIds: string[];
}

/**
 * Writes a fresh test for the lesson. `nextSeed` is injectable so tests can
 * reproduce a build; in production every seed is random.
 */
export function buildLessonTest(
  lessonId: string,
  topic: LessonTopic,
  nextSeed: () => number = () => crypto.randomInt(0, 0xffffffff)
): BuiltLessonTest | null {
  const plan = planLessonTest(topic);
  if (plan.picks.length === 0) return null;

  const size = testSize(plan);
  // Rotate through the lesson's families from a random starting order, so a
  // test covers each of them and two tests don't open the same way.
  const picks = createRng(nextSeed()).shuffle(plan.picks);
  const questions: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  const stems = new Map<string, number>();

  for (let attempt = 0; questions.length < size && attempt < size * 8; attempt++) {
    const pick = picks[(questions.length + attempt) % picks.length];
    const q = writeQuestion(FAMILIES, pick.family, pick.params, nextSeed());
    if (!q || q.options.length < 2) continue;
    // The same question twice is a repeat; the same wording with other numbers in the options is not.
    const key = `${q.questionText}\n${q.options.map((o) => o.text).sort().join("|")}`;
    const stemCount = stems.get(q.questionText) ?? 0;
    if (seen.has(key) || stemCount >= MAX_SAME_STEM) continue;
    seen.add(key);
    stems.set(q.questionText, stemCount + 1);
    questions.push(q);
  }
  if (questions.length < MIN_TEST_SIZE) return null;

  // Easier questions first, so a test builds confidence before it stretches.
  questions.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);

  return {
    questionIds: questions.map((q) => q.id),
    quiz: {
      id: lessonTestQuizId(lessonId),
      title: plan.testSeries ? topic.title : `${topic.title} — Test`,
      lessonId,
      lessonTitle: topic.title,
      durationSeconds: questions.length * SECONDS_PER_QUESTION,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.questionText,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        hint: q.hint || undefined,
        difficulty: q.difficulty,
      })),
    },
  };
}
