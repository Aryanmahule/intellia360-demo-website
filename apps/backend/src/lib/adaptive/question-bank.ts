/**
 * Read-only view of the question bank for adaptive features.
 *
 * The bank (src/data/daily-questions.json) is the one the daily and practice
 * quizzes already draw from. Each question carries the metadata adaptation
 * needs — `topic` (used here as the skill id), `difficulty`, `hint`,
 * `explanation` — so nothing about a question is inferred.
 *
 * A grade's pool is its own questions plus the cross-grade "all" bucket,
 * exactly as the existing quizzes define it.
 *
 * `getQuestion` also answers for lesson test questions (ids "lt.…"), which
 * are not in the bank: they are rebuilt from their id (src/lib/lesson-test),
 * so sessions, grading, mastery and the mistakes list treat them like bank
 * questions. They are never in a grade's pool.
 */
import rawBank from "@/data/daily-questions.json";
import type { DailyQuestion } from "@/lib/streak/questions";
import { parseDifficulty, type Difficulty } from "@/lib/adaptive/config";
import { skillLabel } from "@/lib/adaptive/skill-map";
import { isGeneratedQuestionId } from "@/lib/lesson-test/core";
import { generatedQuestion } from "@/lib/lesson-test/families";

export interface BankQuestion {
  id: string;
  grade: string;
  skill: string;
  difficulty: Difficulty | null;
  questionText: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  hint: string;
  explanation: string;
}

function normalise(q: DailyQuestion): BankQuestion {
  return {
    id: q.id,
    grade: q.grade,
    skill: typeof q.topic === "string" && q.topic.trim() ? q.topic.trim() : "general",
    difficulty: parseDifficulty(q.difficulty),
    questionText: q.questionText,
    options: q.options,
    hint: q.hint ?? "",
    explanation: q.explanation ?? "",
  };
}

const BANK: BankQuestion[] = (rawBank as DailyQuestion[]).map(normalise);
const BY_ID = new Map(BANK.map((q) => [q.id, q]));

export function getQuestion(id: string): BankQuestion | null {
  const banked = BY_ID.get(id);
  if (banked) return banked;
  if (!isGeneratedQuestionId(id)) return null;

  const q = generatedQuestion(id);
  if (!q) return null;
  return {
    id: q.id,
    grade: "all",
    skill: q.skill,
    difficulty: q.difficulty,
    questionText: q.questionText,
    options: q.options,
    hint: q.hint,
    explanation: q.explanation,
  };
}

/** Same scoping rule as the daily and practice quizzes. */
export function questionPool(grade: string, bank: BankQuestion[] = BANK): BankQuestion[] {
  return bank.filter((q) => q.grade === grade || q.grade === "all");
}

/** Skills the student can actually be assessed on in this grade, in first-seen order. */
export function poolSkills(grade: string, bank: BankQuestion[] = BANK): string[] {
  return [...new Set(questionPool(grade, bank).map((q) => q.skill))];
}

export function correctOptionId(question: BankQuestion): string | null {
  return question.options.find((o) => o.isCorrect)?.id ?? null;
}

/** Coverage of a skill in a grade's pool — surfaced so the UI never overstates adaptivity. */
export function skillCoverage(grade: string, skill: string, bank: BankQuestion[] = BANK) {
  const questions = questionPool(grade, bank).filter((q) => q.skill === skill);
  return {
    skill,
    label: skillLabel(skill),
    total: questions.length,
    easy: questions.filter((q) => q.difficulty === "easy").length,
    medium: questions.filter((q) => q.difficulty === "medium").length,
    hard: questions.filter((q) => q.difficulty === "hard").length,
    unlabelled: questions.filter((q) => q.difficulty === null).length,
  };
}
