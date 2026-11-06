/**
 * Personalised next steps — pure and deterministic.
 *
 * Inputs are facts only: the grade's curriculum graph, the lessons the student
 * has completed, and per-skill mastery computed from graded answers. Every
 * recommendation carries a plain-language `reason` built from those numbers.
 *
 * Guarantees (each covered by tests):
 *  • Lessons are only ever ones present in the grade's curriculum.
 *  • A lesson is only recommended once its prerequisites are complete; when a
 *    remedial lesson is not yet eligible, its earliest incomplete prerequisite
 *    is recommended instead.
 *  • Practice is only recommended for skills the grade's question pool has.
 *  • A student without enough answers gets a placement quiz first.
 */
import { ADAPTIVE_CONFIG, difficultyForLevel, type AdaptiveConfig } from "@/lib/adaptive/config";
import type { MasteryResult } from "@/lib/adaptive/mastery";
import { skillLabel as labelForSkill } from "@/lib/adaptive/skill-map";
import {
  isTopicCompleted,
  isTopicEligible,
  topicsForSkill,
  type CurriculumGraph,
  type GraphTopic,
} from "@/lib/adaptive/curriculum-graph";
import type {
  Recommendation,
  RecommendationAction,
  RecommendationType,
} from "@intellia360/shared/types/api/adaptive-learning";

export type { Recommendation, RecommendationAction, RecommendationType };

/** One assessable skill in the student's grade. */
export interface SkillState {
  skill: string;
  label: string;
  mastery: MasteryResult;
  difficultyLevel: number;
}

export const ADAPTIVE_QUIZ_HREF = "/student/quiz/adaptive";

export function skillQuizHref(skill: string): string {
  return `/student/quiz/adaptive-${encodeURIComponent(skill)}`;
}

export function lessonHref(topicId: string): string {
  return `/student/lesson/${encodeURIComponent(topicId)}`;
}

function needsRemediation(m: MasteryResult): boolean {
  return (
    m.band === "foundational" ||
    (m.band !== "insufficient-data" && (m.recentStruggle || m.repeatedMistakes.length > 0))
  );
}

/**
 * How urgently a skill needs practice. Shared by the recommender and the
 * auto-adaptive quiz so "what we suggest" and "what we serve" agree.
 */
export function practicePriority(s: SkillState): number {
  const m = s.mastery;
  if (m.band === "insufficient-data") return m.evidenceCount > 0 ? 48 : 45;
  const score = m.score ?? 0;
  const extra = (m.repeatedMistakes.length > 0 ? 5 : 0) + (m.recentStruggle ? 5 : 0);
  switch (m.band) {
    case "foundational":
      return 90 + (40 - score) / 4 + extra;
    case "developing":
      return 70 + (70 - score) / 3 + extra;
    case "nearly-proficient":
      return 55 + (85 - score) / 3 + extra + (m.revisionDue ? 5 : 0);
    case "proficient":
      return m.revisionDue ? 50 : 20;
  }
}

/** Skills ordered from most to least in need of practice. Deterministic tie-breaks. */
export function rankSkillsForPractice(skills: SkillState[]): SkillState[] {
  return [...skills].sort(
    (a, b) =>
      practicePriority(b) - practicePriority(a) ||
      (a.mastery.score ?? 50) - (b.mastery.score ?? 50) ||
      a.skill.localeCompare(b.skill)
  );
}

/**
 * The lesson to actually send a student to for a topic: the topic itself when
 * it is completed (a review) or eligible, otherwise its earliest incomplete
 * prerequisite, followed recursively.
 */
export function resolveReachableTopic(
  graph: CurriculumGraph,
  topic: GraphTopic,
  completed: ReadonlySet<string>
): GraphTopic {
  let current = topic;
  const visited = new Set<string>();
  while (!isTopicCompleted(current, completed) && !isTopicEligible(graph, current, completed)) {
    if (visited.has(current.id)) break; // a prerequisite cycle in authored data
    visited.add(current.id);
    const blocker = current.prerequisites
      .map((id) => graph.topics.find((t) => t.id === id))
      .filter((t): t is GraphTopic => !!t && !isTopicCompleted(t, completed))
      .sort((a, b) => a.order - b.order)[0];
    if (!blocker) break;
    current = blocker;
  }
  return current;
}

/** The earliest lesson the student has not completed and is allowed to start. */
export function nextEligibleTopic(graph: CurriculumGraph, completed: ReadonlySet<string>): GraphTopic | null {
  return (
    graph.topics.find((t) => !isTopicCompleted(t, completed) && isTopicEligible(graph, t, completed)) ?? null
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function lessonRef(t: GraphTopic) {
  return { id: t.id, title: t.title, chapterTitle: t.chapterTitle };
}

function accuracyPhrase(m: MasteryResult, label: string): string {
  return `You answered ${m.windowCorrect} of your last ${plural(m.windowCount, `${label.toLowerCase()} question`)} correctly`;
}

export interface RecommendationInput {
  graph: CurriculumGraph;
  completed: ReadonlySet<string>;
  /** Every skill in the grade's question pool, assessed or not. */
  skills: SkillState[];
  config?: AdaptiveConfig;
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { graph, completed, skills } = input;
  const config = input.config ?? ADAPTIVE_CONFIG;
  const recs: Recommendation[] = [];
  const recommendedLessons = new Set<string>();

  const totalEvidence = skills.reduce((sum, s) => sum + s.mastery.evidenceCount, 0);

  // ── New learner: place them before personalising anything else ────────────
  if (totalEvidence < config.recommendations.minTotalEvidence && skills.length > 0) {
    recs.push({
      id: "diagnostic",
      type: "diagnostic",
      priority: 100,
      title: "Take a quick placement quiz",
      reason:
        totalEvidence === 0
          ? "We haven't seen any of your quiz answers yet. This short mixed quiz shows us where to start."
          : `We need a few more quiz answers to personalise your path (${totalEvidence} so far). This short mixed quiz shows us where to start.`,
      skill: null,
      skillLabel: null,
      lesson: null,
      difficulty: "medium",
      actions: [{ label: "Start placement quiz", href: ADAPTIVE_QUIZ_HREF, kind: "quiz" }],
    });
  }

  // ── Per-skill recommendations, most urgent first ───────────────────────────
  let challengeAdded = false;
  let revisionCount = 0;
  let unassessedAdded = false;

  for (const s of rankSkillsForPractice(skills)) {
    const m = s.mastery;
    const difficulty = difficultyForLevel(s.difficultyLevel);
    const practice: RecommendationAction = {
      label: `Practise ${s.label.toLowerCase()}`,
      href: skillQuizHref(s.skill),
      kind: "quiz",
    };
    const base = { skill: s.skill, skillLabel: s.label, difficulty, priority: practicePriority(s) };

    if (m.band === "insufficient-data") {
      // Only once the learner has a profile — before that the placement quiz covers it.
      if (unassessedAdded || totalEvidence < config.recommendations.minTotalEvidence) continue;
      unassessedAdded = true;
      recs.push({
        ...base,
        id: `diagnostic:${s.skill}`,
        type: "diagnostic",
        title: `Check your ${s.label.toLowerCase()}`,
        reason: `We haven't measured ${s.label.toLowerCase()} yet (${plural(m.evidenceCount, "answer")} so far). A few questions will show how you're doing.`,
        lesson: null,
        actions: [{ ...practice, label: `Try ${s.label.toLowerCase()} questions` }],
      });
      continue;
    }

    if (needsRemediation(m)) {
      // The foundation lesson is the earliest teaching lesson linked to the skill.
      const foundation = topicsForSkill(graph, s.skill).find((t) => !t.isAssessment) ?? null;
      const target = foundation ? resolveReachableTopic(graph, foundation, completed) : null;

      let reason = `${accuracyPhrase(m, s.label)} (mastery ${m.score}%, ${m.bandLabel.toLowerCase()}).`;
      if (m.repeatedMistakes.length > 0) reason += " You've missed the same question more than once.";
      else if (m.recentStruggle) reason += " Several of your most recent answers were incorrect.";

      const actions: RecommendationAction[] = [];
      if (target) {
        const done = isTopicCompleted(target, completed);
        if (foundation && target.id !== foundation.id) {
          reason += ` Start with "${target.title}" — it comes before "${foundation.title}".`;
        } else {
          reason += done
            ? ` Reviewing "${target.title}" will rebuild the basics.`
            : ` "${target.title}" teaches the basics.`;
        }
        actions.push({ label: `${done ? "Review" : "Start"} ${target.title}`, href: lessonHref(target.id), kind: "lesson" });
        recommendedLessons.add(target.id);
      }
      reason += " Then practise with easier questions and hints.";
      actions.push({ ...practice, label: "Practise with easier questions" });

      recs.push({
        ...base,
        id: `remedial:${s.skill}`,
        type: "remedial",
        title: `Strengthen ${s.label.toLowerCase()}`,
        reason,
        lesson: target ? lessonRef(target) : null,
        difficulty: "easy",
        actions,
      });
      continue;
    }

    if (m.revisionDue && revisionCount < 2) {
      revisionCount++;
      recs.push({
        ...base,
        id: `revision:${s.skill}`,
        type: "revision",
        title: `Review ${s.label.toLowerCase()}`,
        reason: `You reached ${m.score}% in ${s.label.toLowerCase()}, but it's been ${plural(m.daysSincePractice ?? 0, "day")} since you practised it. A short review keeps it fresh.`,
        lesson: null,
        actions: [{ ...practice, label: "Start a quick review" }],
      });
      continue;
    }

    if (m.band === "developing" || m.band === "nearly-proficient") {
      recs.push({
        ...base,
        id: `practice:${s.skill}`,
        type: "targeted-practice",
        title: `Practise ${s.label.toLowerCase()}`,
        reason: `${accuracyPhrase(m, s.label)} (mastery ${m.score}%, ${m.bandLabel.toLowerCase()}). Practice at ${difficulty} level targets what's still shaky.`,
        lesson: null,
        actions: [practice],
      });
      continue;
    }

    if (m.band === "proficient" && !challengeAdded) {
      challengeAdded = true;
      recs.push({
        ...base,
        id: `challenge:${s.skill}`,
        type: "challenge",
        title: `Take on harder ${s.label.toLowerCase()} questions`,
        reason: `Mastery ${m.score}% with ${m.confidenceLabel} confidence. Harder questions will stretch you further.`,
        lesson: null,
        difficulty: "hard",
        actions: [{ ...practice, label: "Try a challenge" }],
      });
    }
  }

  // ── Curriculum progression ─────────────────────────────────────────────────
  const next = nextEligibleTopic(graph, completed);
  if (next && !recommendedLessons.has(next.id)) {
    const prerequisite = next.prerequisites
      .map((id) => graph.topics.find((t) => t.id === id))
      .find((t): t is GraphTopic => !!t);
    let reason = next.chapterTitle ? `Next in ${next.chapterTitle}.` : "Next in your curriculum.";
    reason += prerequisite
      ? ` You've completed "${prerequisite.title}", which comes before it.`
      : next.prerequisiteSource === "explicit"
        ? " You've completed everything it builds on."
        : " It's the first lesson in this chapter.";
    const hasRemedial = recs.some((r) => r.type === "remedial");
    if (hasRemedial) reason += " Strengthen the skills above first if you can.";

    recs.push({
      id: `lesson:${next.id}`,
      type: "next-lesson",
      priority: hasRemedial ? 60 : 75,
      title: next.isAssessment ? `Take ${next.title}` : `Continue with ${next.title}`,
      reason,
      skill: next.skills[0] ?? null,
      skillLabel: next.skills[0] ? labelForSkill(next.skills[0]) : null,
      lesson: lessonRef(next),
      difficulty: null,
      actions: [{ label: next.isAssessment ? "Open test" : "Open lesson", href: lessonHref(next.id), kind: "lesson" }],
    });
  }

  return recs
    .map((r, index) => ({ r, index }))
    .sort((a, b) => b.r.priority - a.r.priority || a.index - b.index)
    .map(({ r }) => ({ ...r, priority: Math.round(r.priority * 10) / 10 }))
    .slice(0, config.recommendations.limit);
}
