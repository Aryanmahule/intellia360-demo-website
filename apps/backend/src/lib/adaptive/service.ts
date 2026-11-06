/**
 * Adaptive learning service — the IO edge around the pure engine.
 *
 * Every function takes the student's userId from the verified session and
 * reads that student's own grade from their profile. Nothing here accepts a
 * grade, score or mastery value from a request.
 */
import { db } from "@/lib/db";
import { ADAPTIVE_CONFIG, difficultyForLevel, DIFFICULTY_VALUE } from "@/lib/adaptive/config";
import {
  loadCurriculumGraph,
  findTopic,
  isTopicCompleted,
  topicsForSkill,
  type CurriculumGraph,
} from "@/lib/adaptive/curriculum-graph";
import { computeMastery } from "@/lib/adaptive/mastery";
import {
  buildActivity,
  buildMasteryHistory,
  buildMistakes,
  buildQuizHistory,
  buildSkillProgress,
  dayRange,
  overallMastery,
  previewNextQuiz,
  PROGRESS_LIMITS,
  sessionLookback,
  type DailyAttemptRow,
  type SubmittedSessionRow,
} from "@/lib/adaptive/progress";
import { poolSkills, questionPool, skillCoverage } from "@/lib/adaptive/question-bank";
import {
  planAutoQuiz,
  planSkillQuiz,
  selectQuestions,
  type QuizPlan,
} from "@/lib/adaptive/quiz-selection";
import {
  buildRecommendations,
  skillQuizHref,
  type SkillState,
} from "@/lib/adaptive/recommendations";
import { skillLabel } from "@/lib/adaptive/skill-map";
import { loadSkillRows, recentlySeenQuestions, toRecord, type SkillMasteryRow } from "@/lib/adaptive/store";
import type { PublicQuiz } from "@/lib/student/practice-quiz";
import type {
  AdaptiveOverview,
  AdaptiveProgress,
  QuizAdaptation,
  SkillMasteryView,
} from "@intellia360/shared/types/api/adaptive-learning";

export const DEFAULT_GRADE = "grade1";

export interface LearnerState {
  userId: string;
  grade: string;
  streakDays: number;
  graph: CurriculumGraph;
  completed: Set<string>;
  rows: SkillMasteryRow[];
  skills: SkillState[];
  now: Date;
}

/** The student's grade, as stored on their profile (the only trusted source). */
export async function studentGrade(userId: string): Promise<{ grade: string; streakDays: number }> {
  const profile = await db.studentProfile.findUnique({
    where: { userId },
    select: { grade: true, streakDays: true },
  });
  return { grade: profile?.grade ?? DEFAULT_GRADE, streakDays: profile?.streakDays ?? 0 };
}

export function skillStates(grade: string, rows: SkillMasteryRow[], now: Date): SkillState[] {
  const byId = new Map(rows.map((r) => [r.skill, r]));
  // Only skills this grade's bank can assess. History for a skill that left the
  // bank stays in the database but is not offered as something to practise.
  return poolSkills(grade).map((skill) => {
    const record = toRecord(byId.get(skill));
    return {
      skill,
      label: skillLabel(skill),
      mastery: computeMastery(record, now),
      difficultyLevel: record.difficultyLevel,
    };
  });
}

export async function loadLearnerState(userId: string, now = new Date()): Promise<LearnerState> {
  const { grade, streakDays } = await studentGrade(userId);
  const [rows, graph, completedRows] = await Promise.all([
    loadSkillRows(db, userId, grade),
    loadCurriculumGraph(grade, poolSkills(grade)),
    db.completedLesson.findMany({ where: { userId, grade }, select: { lessonId: true } }),
  ]);
  return {
    userId,
    grade,
    streakDays,
    graph,
    completed: new Set(completedRows.map((r) => r.lessonId)),
    rows,
    skills: skillStates(grade, rows, now),
    now,
  };
}

export function toSkillView(state: LearnerState, s: SkillState): SkillMasteryView {
  const m = s.mastery;
  const lessons = topicsForSkill(state.graph, s.skill)
    .sort((a, b) => Number(a.isAssessment) - Number(b.isAssessment) || a.order - b.order)
    .slice(0, 3)
    .map((t) => ({ id: t.id, title: t.title }));
  const row = state.rows.find((r) => r.skill === s.skill);
  return {
    skill: s.skill,
    label: s.label,
    score: m.score,
    band: m.band,
    bandLabel: m.bandLabel,
    confidence: Math.round(m.confidence * 100),
    confidenceLabel: m.confidenceLabel,
    evidenceCount: m.evidenceCount,
    correctCount: m.correctCount,
    recentAccuracy: m.recentAccuracy === null ? null : Math.round(m.recentAccuracy * 100),
    trend: m.trend,
    lastPracticedAt: row?.lastPracticedAt ? row.lastPracticedAt.toISOString() : null,
    daysSincePractice: m.daysSincePractice,
    revisionDue: m.revisionDue,
    repeatedMistakeCount: m.repeatedMistakes.length,
    recommendedDifficulty: difficultyForLevel(s.difficultyLevel),
    practiceHref: skillQuizHref(s.skill),
    questionsAvailable: skillCoverage(state.grade, s.skill).total,
    lessons,
  };
}

export function bandPolicy(): AdaptiveOverview["policy"] {
  const bands = ADAPTIVE_CONFIG.mastery.bands;
  return {
    bands: bands.map((b, i) => ({ id: b.id, min: b.min, max: i + 1 < bands.length ? bands[i + 1].min - 1 : 100, label: b.label })),
    minEvidence: ADAPTIVE_CONFIG.mastery.minEvidence,
  };
}

/** Assessed skills first (weakest first), then unassessed alphabetically. */
function sortSkillViews(views: SkillMasteryView[]): SkillMasteryView[] {
  return [...views].sort((a, b) => {
    if (a.score === null && b.score === null) return a.label.localeCompare(b.label);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return a.score - b.score || a.label.localeCompare(b.label);
  });
}

export function buildOverview(state: LearnerState): AdaptiveOverview {
  const views = sortSkillViews(state.skills.map((s) => toSkillView(state, s)));
  const assessed = views.filter((v) => v.score !== null);
  const totalResponses = views.reduce((sum, v) => sum + v.evidenceCount, 0);

  const strong = assessed.filter((v) => v.band === "proficient" || v.band === "nearly-proficient");
  const weak = assessed.filter((v) => v.band === "foundational" || v.band === "developing");

  const lessonsTotal = state.graph.topics.length;
  const lessonsCompleted = state.graph.topics.filter((t) => isTopicCompleted(t, state.completed)).length;

  const status: AdaptiveOverview["status"] =
    state.skills.length === 0
      ? "unavailable"
      : totalResponses < ADAPTIVE_CONFIG.recommendations.minTotalEvidence
        ? "insufficient-data"
        : "ready";

  return {
    grade: state.grade,
    generatedAt: state.now.toISOString(),
    status,
    summary: {
      // Shared with the progress history, so today's point always matches.
      overallMastery: overallMastery(views),
      assessedSkills: assessed.length,
      totalSkills: views.length,
      proficientSkills: assessed.filter((v) => v.band === "proficient").length,
      needsSupportSkills: assessed.filter((v) => v.band === "foundational").length,
      revisionDue: views.filter((v) => v.revisionDue).length,
      totalResponses,
      streakDays: state.streakDays,
      lessons: { available: lessonsTotal > 0, total: lessonsTotal, completed: lessonsCompleted },
    },
    skills: views,
    strengths: [...strong]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 3)
      .map((v) => ({ skill: v.skill, label: v.label, score: v.score ?? 0 })),
    needsWork: weak.slice(0, 3).map((v) => ({ skill: v.skill, label: v.label, score: v.score ?? 0 })),
    recommendations: buildRecommendations({ graph: state.graph, completed: state.completed, skills: state.skills }),
    policy: bandPolicy(),
  };
}

export async function getAdaptiveOverview(userId: string, now = new Date()): Promise<AdaptiveOverview> {
  return buildOverview(await loadLearnerState(userId, now));
}

/* ── Progress over time ───────────────────────────────────────────────────── */

/** Upper bound on session rows read for one range — far above a realistic 90 days. */
const PROGRESS_SESSION_CAP = 500;

export function buildProgress(
  state: LearnerState,
  days: number,
  sessions: SubmittedSessionRow[],
  daily: DailyAttemptRow[]
): AdaptiveProgress {
  const range = dayRange(state.now, days);
  const byId = new Map(state.rows.map((r) => [r.skill, r]));
  const records = state.skills.map((s) => ({ skill: s.skill, record: toRecord(byId.get(s.skill)) }));

  const { points, historyFrom } = buildMasteryHistory(records, range, state.now);
  const lessonTitle = (id: string) => findTopic(state.graph, id)?.title ?? null;
  const inRange = (iso: string) => iso.slice(0, 10) >= range[0];
  const history = buildQuizHistory(sessions, daily, lessonTitle).filter((q) => inRange(q.submittedAt));
  const activity = buildActivity(history, range);

  return {
    grade: state.grade,
    generatedAt: state.now.toISOString(),
    days,
    historyFrom,
    masteryHistory: points,
    activity,
    totals: {
      answered: activity.reduce((sum, d) => sum + d.answered, 0),
      correct: activity.reduce((sum, d) => sum + d.correct, 0),
      quizzes: activity.reduce((sum, d) => sum + d.quizzes, 0),
      activeDays: activity.filter((d) => d.answered > 0).length,
    },
    skills: state.skills.map((s, i) => buildSkillProgress(s, records[i].record, state.now)),
    quizzes: history.slice(0, PROGRESS_LIMITS.quizzes),
    mistakes: buildMistakes(records),
    nextQuiz: previewNextQuiz(state.skills),
  };
}

export async function getAdaptiveProgress(userId: string, days: number, now = new Date()): Promise<AdaptiveProgress> {
  const state = await loadLearnerState(userId, now);
  const since = new Date(`${dayRange(now, days)[0]}T00:00:00.000Z`);
  const [sessions, daily] = await Promise.all([
    db.quizSession.findMany({
      where: { userId, grade: state.grade, status: "SUBMITTED", createdAt: { gte: sessionLookback(since) } },
      orderBy: { createdAt: "desc" },
      take: PROGRESS_SESSION_CAP,
      select: { id: true, quizId: true, focusSkill: true, submittedAt: true, createdAt: true, result: true },
    }),
    db.dailyQuizAttempt.findMany({
      where: { userId, grade: state.grade, completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true, score: true, questions: true },
    }),
  ]);
  return buildProgress(state, days, sessions, daily);
}

/* ── Adaptive quizzes ─────────────────────────────────────────────────────── */

export const ADAPTIVE_QUIZ_ID = "adaptive";
const SKILL_QUIZ_PREFIX = "adaptive-";
const SKILL_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isAdaptiveQuizId(quizId: string): boolean {
  return quizId === ADAPTIVE_QUIZ_ID || quizId.startsWith(SKILL_QUIZ_PREFIX);
}

/** "adaptive-fractions" → "fractions"; "adaptive" → null. Throws on a malformed id. */
export function skillFromQuizId(quizId: string): string | null {
  if (quizId === ADAPTIVE_QUIZ_ID) return null;
  const skill = quizId.slice(SKILL_QUIZ_PREFIX.length);
  if (!SKILL_ID_RE.test(skill) || skill.length > 64) throw new Error("Invalid adaptive quiz id");
  return skill;
}

export interface BuiltAdaptiveQuiz {
  quiz: PublicQuiz;
  plan: QuizPlan;
  adaptation: QuizAdaptation;
  questionIds: string[];
}

/**
 * Plans and selects an adaptive quiz for the student. Returns null when the
 * requested skill is not in the grade's pool or the pool is empty.
 */
export function buildAdaptiveQuiz(state: LearnerState, quizId: string, seed: string): BuiltAdaptiveQuiz | null {
  let focus: string | null;
  try {
    focus = skillFromQuizId(quizId);
  } catch {
    return null;
  }

  const pool = questionPool(state.grade);
  if (pool.length === 0) return null;

  let plan: QuizPlan;
  if (focus) {
    const s = state.skills.find((x) => x.skill === focus);
    if (!s) return null;
    plan = planSkillQuiz(s);
  } else {
    plan = planAutoQuiz(state.skills);
  }

  const picked = selectQuestions({
    pool,
    slots: plan.slots,
    recentlySeen: recentlySeenQuestions(state.rows),
    preferSkills: new Set(plan.preferSkills),
    seed,
  });
  if (picked.length === 0) return null;

  const byId = new Map(pool.map((q) => [q.id, q]));
  const matchedSkill = picked.filter((p) => !p.slotSkill || p.slotSkill === p.skill).length;
  const matchedDifficulty = picked.filter(
    (p) => p.difficulty && Math.abs(DIFFICULTY_VALUE[p.difficulty] - p.slotLevel) < 0.5 + 1e-9
  ).length;
  const focusLabel = plan.focusSkill ? skillLabel(plan.focusSkill) : null;

  const adaptation: QuizAdaptation = {
    kind: plan.kind,
    focusSkill: plan.focusSkill,
    focusSkillLabel: focusLabel,
    targetDifficulty: difficultyForLevel(plan.targetLevel),
    reason: plan.reason,
    matchedSkill,
    matchedDifficulty,
    limitedByBank:
      plan.kind !== "diagnostic" && (matchedSkill < picked.length || matchedDifficulty < picked.length),
  };

  const title =
    plan.kind === "diagnostic" ? "Placement quiz" : focusLabel ? `${focusLabel} — Smart practice` : "Smart practice";

  return {
    plan,
    adaptation,
    questionIds: picked.map((p) => p.questionId),
    quiz: {
      id: quizId,
      title,
      lessonId: "adaptive-practice",
      lessonTitle: plan.kind === "diagnostic" ? "Find your starting point" : (focusLabel ?? "Mixed topics"),
      durationSeconds: picked.length * ADAPTIVE_CONFIG.quiz.secondsPerQuestion,
      questions: picked.map((p) => {
        const q = byId.get(p.questionId)!;
        return {
          id: q.id,
          question: q.questionText,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
          hint: q.hint || undefined,
          difficulty: q.difficulty,
        };
      }),
    },
  };
}
