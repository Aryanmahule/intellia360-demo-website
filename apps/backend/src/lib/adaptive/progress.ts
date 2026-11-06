/**
 * Learning progress over time — pure and deterministic.
 *
 * Nothing new is stored for this. Mastery history is rebuilt from the evidence
 * each skill row already keeps, and activity and quiz history come from the
 * submitted quiz sessions and daily quiz attempts:
 *
 *  • Mastery at a past moment t — answers given at or after t are removed from
 *    the stored window and subtracted from the lifetime counters, then the
 *    same computeMastery that scores today runs on what is left. Today's point
 *    therefore always equals the overview's number. A row keeps only its last
 *    `windowSize` answers; once older ones have been dropped, mastery before
 *    the oldest stored answer cannot be rebuilt, and the history says so
 *    (`historyFrom`) instead of guessing.
 *
 *  • Activity counts the same server-graded submissions that build mastery:
 *    quiz sessions and the daily quiz. Self-reported scores are not counted.
 *
 *  • Mistakes to review are only taken from quizzes that already showed the
 *    answer on submission (adaptive and daily). Practice quizzes serve the same
 *    questions on every retry, so their answers stay hidden here too.
 *
 * Days are UTC, the boundary the daily quiz and streak already use.
 */
import { ADAPTIVE_CONFIG, difficultyForLevel } from "@/lib/adaptive/config";
import { computeMastery, type EvidenceItem, type MasteryRecord } from "@/lib/adaptive/mastery";
import { correctOptionId, getQuestion } from "@/lib/adaptive/question-bank";
import { planAutoQuiz } from "@/lib/adaptive/quiz-selection";
import { ADAPTIVE_QUIZ_HREF, skillQuizHref, type SkillState } from "@/lib/adaptive/recommendations";
import { skillLabel } from "@/lib/adaptive/skill-map";
import type {
  DailyActivity,
  MasteryHistoryPoint,
  MistakeToReview,
  NextQuizPreview,
  QuizHistoryItem,
  QuizMasteryChange,
  SkillProgress,
} from "@intellia360/shared/types/api/adaptive-learning";

const DAY_MS = 86_400_000;

export const PROGRESS_LIMITS = {
  defaultDays: 30,
  minDays: 7,
  maxDays: 90,
  recentAnswers: 10,
  quizzes: 10,
  mistakes: 5,
} as const;

/* ── Days ─────────────────────────────────────────────────────────────────── */

export function dayKey(date: Date | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** UTC day keys from `days - 1` days before `now` through `now`'s day, oldest first. */
export function dayRange(now: Date, days: number): string[] {
  const today = Date.parse(`${dayKey(now)}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, i) => dayKey(today - (days - 1 - i) * DAY_MS));
}

/** The first instant after a UTC day. */
function endOfDay(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`) + DAY_MS;
}

function timeOf(item: EvidenceItem): number {
  const t = Date.parse(item.at);
  return Number.isNaN(t) ? 0 : t;
}

/* ── Mastery at a past moment ─────────────────────────────────────────────── */

/**
 * The record as it stood just before `t` (ms). Lifetime counters are exact;
 * the window holds the stored answers given before `t`. Returns null when the
 * student had answered by then but none of those answers is still stored.
 */
export function recordBefore(record: MasteryRecord, t: number): MasteryRecord | null {
  const kept = record.recent.filter((i) => timeOf(i) < t);
  const later = record.recent.filter((i) => timeOf(i) >= t);
  const attempts = Math.max(kept.length, record.attempts - later.length);
  const correct = Math.max(
    kept.filter((i) => i.c).length,
    record.correct - later.filter((i) => i.c).length
  );

  if (attempts === 0) {
    return { attempts: 0, correct: 0, recent: [], lastPracticedAt: null, difficultyLevel: record.difficultyLevel };
  }
  if (kept.length === 0) return null;
  return {
    attempts,
    correct,
    recent: kept,
    lastPracticedAt: new Date(timeOf(kept[kept.length - 1])),
    difficultyLevel: record.difficultyLevel,
  };
}

/** The earliest moment this record's mastery can be rebuilt from, or null if all of it can. */
export function rebuildableFrom(record: MasteryRecord): number | null {
  if (record.attempts <= record.recent.length || record.recent.length === 0) return null;
  return timeOf(record.recent[0]);
}

/**
 * Evidence-weighted mean of the assessed skills' scores — the overview's
 * "overall mastery". null when no skill has a score.
 */
export function overallMastery(skills: { score: number | null; evidenceCount: number }[]): number | null {
  let weight = 0;
  let total = 0;
  for (const s of skills) {
    if (s.score === null) continue;
    weight += s.evidenceCount;
    total += s.score * s.evidenceCount;
  }
  return weight > 0 ? Math.round(total / weight) : null;
}

export interface SkillRecord {
  skill: string;
  record: MasteryRecord;
}

/**
 * Overall mastery at the end of each day in `days`. Days before `historyFrom`
 * (where some skill's evidence is no longer stored) are null.
 */
export function buildMasteryHistory(
  skills: SkillRecord[],
  days: string[],
  now: Date
): { points: MasteryHistoryPoint[]; historyFrom: string | null } {
  const limits = skills.map((s) => rebuildableFrom(s.record)).filter((t): t is number => t !== null);
  const firstRebuildable = limits.length ? dayKey(Math.max(...limits)) : null;
  const historyFrom = firstRebuildable && days.length && firstRebuildable > days[0] ? firstRebuildable : null;

  const points = days.map((date) => {
    if (historyFrom && date < historyFrom) return { date, overall: null, assessedSkills: 0 };
    const results = skills
      .map((s) => recordBefore(s.record, endOfDay(date)))
      .filter((r): r is MasteryRecord => r !== null)
      .map((r) => computeMastery(r, now));
    return {
      date,
      overall: overallMastery(results),
      assessedSkills: results.filter((r) => r.score !== null).length,
    };
  });
  return { points, historyFrom };
}

/** One topic's mastery after each graded quiz still in its window, plus its latest answers. */
export function buildSkillProgress(s: SkillState, record: MasteryRecord, now: Date): SkillProgress {
  const moments = [...new Set(record.recent.map(timeOf))].sort((a, b) => a - b);
  const points = moments.flatMap((t) => {
    const before = recordBefore(record, t + 1);
    if (!before) return [];
    return [{ at: new Date(t).toISOString(), score: computeMastery(before, now).score }];
  });
  return {
    skill: s.skill,
    label: s.label,
    points,
    recentAnswers: record.recent.slice(-PROGRESS_LIMITS.recentAnswers).map((i) => ({
      at: i.at,
      correct: i.c,
      difficulty: i.d,
      source: i.s,
    })),
    difficultyLevel: s.difficultyLevel,
  };
}

/* ── Quiz history and activity ────────────────────────────────────────────── */

export interface SubmittedSessionRow {
  id: string;
  quizId: string;
  focusSkill: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  result: unknown;
}

export interface DailyAttemptRow {
  id: string;
  completedAt: Date;
  score: number;
  questions: unknown;
}

const DAILY_QUIZ_LENGTH = 5;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function masteryChanges(value: unknown): QuizMasteryChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is QuizMasteryChange =>
      !!c && typeof c === "object" && typeof (c as QuizMasteryChange).skill === "string"
  ).map((c) => ({
    skill: c.skill,
    label: typeof c.label === "string" ? c.label : skillLabel(c.skill),
    before: num(c.before),
    after: num(c.after),
    band: c.band,
    bandLabel: typeof c.bandLabel === "string" ? c.bandLabel : "",
  }));
}

/** A student-facing name for a served quiz id. */
export function describeQuiz(
  quizId: string,
  focusSkill: string | null,
  lessonTitle: (lessonId: string) => string | null
): { kind: QuizHistoryItem["kind"]; title: string } {
  if (quizId === "adaptive") {
    return focusSkill
      ? { kind: "smart", title: `Smart practice · ${skillLabel(focusSkill)}` }
      : { kind: "placement", title: "Placement quiz" };
  }
  if (quizId.startsWith("adaptive-")) {
    return { kind: "topic", title: `${skillLabel(quizId.slice("adaptive-".length))} practice` };
  }
  if (quizId.startsWith("test-")) {
    const testLesson = quizId.slice("test-".length);
    const title = lessonTitle(testLesson) ?? "Lesson";
    return { kind: "test", title: /test series$/i.test(title) ? title : `${title} test` };
  }
  const lessonId = quizId.startsWith("practice-") ? quizId.slice("practice-".length) : "";
  if (!lessonId || lessonId === "1") return { kind: "practice", title: "Mixed practice" };
  return { kind: "practice", title: `${lessonTitle(lessonId) ?? "Lesson"} practice` };
}

export function buildQuizHistory(
  sessions: SubmittedSessionRow[],
  daily: DailyAttemptRow[],
  lessonTitle: (lessonId: string) => string | null
): QuizHistoryItem[] {
  const items: QuizHistoryItem[] = [];
  for (const s of sessions) {
    const r = (s.result && typeof s.result === "object" ? s.result : {}) as Record<string, unknown>;
    const total = num(r.totalQuestions);
    const correct = num(r.correctAnswers);
    if (total === null || correct === null || total <= 0) continue;
    const { kind, title } = describeQuiz(s.quizId, s.focusSkill, lessonTitle);
    items.push({
      id: s.id,
      kind,
      title,
      submittedAt: (s.submittedAt ?? s.createdAt).toISOString(),
      correct,
      total,
      scorePercent: num(r.scorePercent) ?? Math.round((correct / total) * 100),
      mastery: masteryChanges(r.mastery),
    });
  }
  for (const d of daily) {
    const total = Array.isArray(d.questions) && d.questions.length > 0 ? d.questions.length : DAILY_QUIZ_LENGTH;
    items.push({
      id: d.id,
      kind: "daily",
      title: "Daily quiz",
      submittedAt: d.completedAt.toISOString(),
      correct: d.score,
      total,
      scorePercent: Math.round((d.score / total) * 100),
      mastery: [],
    });
  }
  return items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
}

/** Answers per day over `days`, from the quiz history. */
export function buildActivity(history: QuizHistoryItem[], days: string[]): DailyActivity[] {
  const byDay = new Map(days.map((date) => [date, { date, answered: 0, correct: 0, quizzes: 0 }]));
  for (const item of history) {
    const day = byDay.get(item.submittedAt.slice(0, 10));
    if (!day) continue;
    day.answered += item.total;
    day.correct += item.correct;
    day.quizzes += 1;
  }
  return [...byDay.values()];
}

/* ── Mistakes and the next quiz ───────────────────────────────────────────── */

/**
 * Questions missed in an adaptive quiz, a lesson test or the daily quiz and
 * not answered correctly since, most recent miss first.
 */
export function buildMistakes(skills: SkillRecord[], limit: number = PROGRESS_LIMITS.mistakes): MistakeToReview[] {
  const answers = skills
    .flatMap((s) => s.record.recent.map((item, pos) => ({ skill: s.skill, item, t: timeOf(item), pos })))
    .sort((a, b) => a.t - b.t || a.pos - b.pos);

  const latest = new Map<string, (typeof answers)[number]>();
  const revealedMiss = new Map<string, (typeof answers)[number]>();
  for (const a of answers) {
    latest.set(a.item.q, a);
    if (!a.item.c && (a.item.s === "adaptive" || a.item.s === "daily" || a.item.s === "test")) revealedMiss.set(a.item.q, a);
  }

  const out: MistakeToReview[] = [];
  const misses = [...revealedMiss.values()].sort((a, b) => b.t - a.t || b.pos - a.pos);
  for (const miss of misses) {
    if (out.length >= limit) break;
    if (latest.get(miss.item.q)?.item.c) continue; // answered correctly since
    const question = getQuestion(miss.item.q);
    const answerId = question ? correctOptionId(question) : null;
    const answer = question?.options.find((o) => o.id === answerId);
    if (!question || !answer) continue;
    out.push({
      questionId: question.id,
      skill: miss.skill,
      skillLabel: skillLabel(miss.skill),
      question: question.questionText,
      correctAnswer: answer.text,
      explanation: question.explanation,
      hint: question.hint || null,
      missedAt: miss.item.at,
      source: miss.item.s,
      practiceHref: skillQuizHref(miss.skill),
    });
  }
  return out;
}

/** What the auto-adaptive quiz is planned to serve next. */
export function previewNextQuiz(skills: SkillState[]): NextQuizPreview | null {
  if (skills.length === 0) return null;
  const plan = planAutoQuiz(skills);
  const counts = new Map<string | null, number>();
  for (const slot of plan.slots) counts.set(slot.skill, (counts.get(slot.skill) ?? 0) + 1);
  const focusSkillLabel = plan.focusSkill ? skillLabel(plan.focusSkill) : null;
  return {
    kind: plan.kind === "diagnostic" ? "diagnostic" : "focused",
    title: plan.kind === "diagnostic" ? "Placement quiz" : `Smart practice · ${focusSkillLabel ?? "Mixed topics"}`,
    reason: plan.reason,
    focusSkill: plan.focusSkill,
    focusSkillLabel,
    targetDifficulty: difficultyForLevel(plan.targetLevel),
    mix: [...counts].map(([skill, questions]) => ({
      skill,
      label: skill ? skillLabel(skill) : "Any topic",
      questions,
    })),
    href: ADAPTIVE_QUIZ_HREF,
  };
}

/** How far back session rows must be read so a session served before the range but submitted in it counts. */
export function sessionLookback(since: Date): Date {
  return new Date(since.getTime() - ADAPTIVE_CONFIG.quiz.sessionTtlMinutes * 60_000);
}
