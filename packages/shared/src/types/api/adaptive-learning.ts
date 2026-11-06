/**
 * Adaptive learning API contract — shared by apps/backend (producer) and
 * apps/frontend (consumer).
 *
 * "Skill" is the question bank's topic tag (e.g. "fractions"); the UI calls it
 * a topic. Lessons are curriculum topics.
 */

export type MasteryBandId = "foundational" | "developing" | "nearly-proficient" | "proficient";
export type MasteryBandOrInsufficient = MasteryBandId | "insufficient-data";
export type DifficultyLabel = "easy" | "medium" | "hard";
export type MasteryTrend = "improving" | "declining" | "steady" | "unknown";
export type ConfidenceLabel = "low" | "medium" | "high";

export type RecommendationType =
  | "diagnostic"
  | "remedial"
  | "targeted-practice"
  | "next-lesson"
  | "revision"
  | "challenge";

export interface RecommendationAction {
  label: string;
  href: string;
  kind: "quiz" | "lesson";
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  /** Higher is more urgent; lists arrive sorted by it. */
  priority: number;
  title: string;
  /** Why this is recommended, in plain language, from the student's own data. */
  reason: string;
  skill: string | null;
  skillLabel: string | null;
  lesson: { id: string; title: string; chapterTitle: string | null } | null;
  difficulty: DifficultyLabel | null;
  /** Primary action first. */
  actions: RecommendationAction[];
}

export interface SkillMasteryView {
  skill: string;
  label: string;
  /** 0–100, null while there is not enough evidence. */
  score: number | null;
  band: MasteryBandOrInsufficient;
  bandLabel: string;
  /** 0–100: how much the score rests on evidence rather than the starting assumption. */
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  evidenceCount: number;
  correctCount: number;
  /** 0–100 recency-weighted accuracy, null with no answers. */
  recentAccuracy: number | null;
  trend: MasteryTrend;
  lastPracticedAt: string | null;
  daysSincePractice: number | null;
  revisionDue: boolean;
  repeatedMistakeCount: number;
  recommendedDifficulty: DifficultyLabel;
  practiceHref: string;
  /** Questions this grade's bank has for the skill — adaptation is limited by it. */
  questionsAvailable: number;
  lessons: { id: string; title: string }[];
}

export interface MasteryBandPolicy {
  id: MasteryBandId;
  min: number;
  max: number;
  label: string;
}

export interface AdaptiveSummary {
  /** Evidence-weighted mean of assessed skills; null when none are assessed. */
  overallMastery: number | null;
  assessedSkills: number;
  totalSkills: number;
  proficientSkills: number;
  needsSupportSkills: number;
  revisionDue: number;
  totalResponses: number;
  streakDays: number;
  lessons: { available: boolean; total: number; completed: number };
}

export interface AdaptiveOverview {
  grade: string;
  generatedAt: string;
  /** "unavailable": the grade has no questions to assess with. */
  status: "ready" | "insufficient-data" | "unavailable";
  summary: AdaptiveSummary;
  skills: SkillMasteryView[];
  strengths: { skill: string; label: string; score: number }[];
  needsWork: { skill: string; label: string; score: number }[];
  recommendations: Recommendation[];
  /**
   * True when the learner's membership does not include recommendations
   * (Free, with billing switched on): `recommendations` is then empty.
   */
  recommendationsLocked?: boolean;
  policy: { bands: MasteryBandPolicy[]; minEvidence: number };
}

export interface MasteryResponse {
  grade: string;
  skills: SkillMasteryView[];
  policy: AdaptiveOverview["policy"];
}

export interface RecommendationsResponse {
  grade: string;
  status: AdaptiveOverview["status"];
  recommendations: Recommendation[];
  recommendationsLocked?: boolean;
}

/* ── Progress (GET /api/student/adaptive-learning/progress) ───────────────── */

export type EvidenceSourceLabel = "adaptive" | "practice" | "daily" | "test";

/** Overall mastery at the end of one UTC day. */
export interface MasteryHistoryPoint {
  /** "YYYY-MM-DD", UTC — the same day boundary as the daily quiz and streak. */
  date: string;
  /** null: nothing measured yet, or the day is before `historyFrom`. */
  overall: number | null;
  assessedSkills: number;
}

/** Graded answers on one UTC day, from quiz sessions and the daily quiz. */
export interface DailyActivity {
  date: string;
  answered: number;
  correct: number;
  quizzes: number;
}

export interface SkillProgress {
  skill: string;
  label: string;
  /** Mastery after each graded quiz still in the stored answer window, oldest first. */
  points: { at: string; score: number | null }[];
  /** The most recent answers (up to 10), oldest first. No question content. */
  recentAnswers: { at: string; correct: boolean; difficulty: DifficultyLabel | null; source: EvidenceSourceLabel }[];
  /** 1 (easy) – 3 (hard): where the next questions on this topic are pitched. */
  difficultyLevel: number;
}

export type QuizHistoryKind = "placement" | "smart" | "topic" | "practice" | "daily" | "test";

export interface QuizHistoryItem {
  id: string;
  kind: QuizHistoryKind;
  title: string;
  submittedAt: string;
  correct: number;
  total: number;
  scorePercent: number;
  /** Mastery changes the quiz caused; empty for the daily quiz (not stored with it). */
  mastery: QuizMasteryChange[];
}

/**
 * A question answered wrongly and not answered correctly since. Only from
 * adaptive quizzes, lesson tests and the daily quiz, which already showed the
 * answer at submission; practice quizzes keep their answers hidden.
 */
export interface MistakeToReview {
  questionId: string;
  skill: string;
  skillLabel: string;
  question: string;
  correctAnswer: string;
  explanation: string;
  hint: string | null;
  missedAt: string;
  source: EvidenceSourceLabel;
  practiceHref: string;
}

/** What GET /api/student/quiz/adaptive will serve next, so the student knows before starting. */
export interface NextQuizPreview {
  kind: "diagnostic" | "focused";
  title: string;
  reason: string;
  focusSkill: string | null;
  focusSkillLabel: string | null;
  targetDifficulty: DifficultyLabel;
  /** Planned questions per topic; null skill = any topic. */
  mix: { skill: string | null; label: string; questions: number }[];
  href: string;
}

export interface AdaptiveProgress {
  grade: string;
  generatedAt: string;
  /** Days covered by `masteryHistory` and `activity`, today included. */
  days: number;
  /**
   * Only the most recent answers per topic are stored, so mastery before this
   * day cannot be rebuilt. null when the whole range is covered.
   */
  historyFrom: string | null;
  masteryHistory: MasteryHistoryPoint[];
  activity: DailyActivity[];
  totals: { answered: number; correct: number; quizzes: number; activeDays: number };
  skills: SkillProgress[];
  /** Most recent first. */
  quizzes: QuizHistoryItem[];
  mistakes: MistakeToReview[];
  nextQuiz: NextQuizPreview | null;
}

/* ── Quiz additions ───────────────────────────────────────────────────────── */

/** Present on adaptive quizzes: what was adapted, stated honestly. */
export interface QuizAdaptation {
  kind: "diagnostic" | "focused" | "skill";
  focusSkill: string | null;
  focusSkillLabel: string | null;
  targetDifficulty: DifficultyLabel;
  reason: string;
  /** How many served questions matched the requested skill and difficulty. */
  matchedSkill: number;
  matchedDifficulty: number;
  /** True when the bank lacked questions to fully honour the plan. */
  limitedByBank: boolean;
}

export interface QuizReviewItem {
  questionId: string;
  isCorrect: boolean;
  /** Adaptive quizzes and lesson tests only. */
  correctOptionId?: string;
  explanation?: string;
}

export interface QuizMasteryChange {
  skill: string;
  label: string;
  before: number | null;
  after: number | null;
  band: MasteryBandOrInsufficient;
  bandLabel: string;
}

export interface QuizSubmitResult {
  quizId: string;
  lessonId: string;
  sessionId: string | null;
  mode: "practice" | "adaptive" | "test";
  scorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
  xpEarned: number;
  review: QuizReviewItem[];
  mastery: QuizMasteryChange[];
  /** True when this response replays an earlier submission (no new rewards). */
  alreadySubmitted: boolean;
  nextStep?: Recommendation | null;
}
