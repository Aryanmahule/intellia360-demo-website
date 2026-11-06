/**
 * Adaptive question selection — pure and deterministic.
 *
 * A quiz is planned as a list of slots, each asking for a skill (or any skill)
 * at a difficulty level on the 1 (easy) – 3 (hard) scale. Each slot is then
 * filled greedily with the unused question of lowest cost:
 *
 *   cost = skill mismatch      2.5 when the slot names a skill and the question is another
 *        + difficulty distance |question level − slot level|  (unlabelled = medium + 0.25)
 *        + far off level       1 more when that distance is two levels (easy ↔ hard)
 *        + recently seen       0.6–1.2, more for more recent
 *        + repetition          0.75 per question of that skill already picked (open slots)
 *        − preference          0.3 for preferred (e.g. unassessed) skills (open slots)
 *        + tie-break           < 0.01, seeded — same seed, same quiz
 *
 * So a focus skill's questions within one level of the target always come
 * first; one two levels away (a hard question for a struggling student) yields
 * to an on-level question from another skill. When the bank runs out of
 * questions for a skill or level, the nearest alternatives fill the slot and
 * the plan reports it (`limitedByBank`) instead of overstating the adaptation.
 *
 * Difficulty adapts between quizzes: each graded quiz moves the skill's stored
 * level (see nextDifficultyLevel in mastery.ts) and the next quiz is planned
 * from it. Questions within one quiz are served together, as the quiz screen
 * expects.
 */
import crypto from "crypto";
import {
  ADAPTIVE_CONFIG,
  DIFFICULTY_VALUE,
  difficultyForLevel,
  type AdaptiveConfig,
  type Difficulty,
} from "@/lib/adaptive/config";
import type { BankQuestion } from "@/lib/adaptive/question-bank";
import { rankSkillsForPractice, type SkillState } from "@/lib/adaptive/recommendations";

export interface SelectionSlot {
  skill: string | null;
  level: number;
}

export interface SelectionInput {
  pool: BankQuestion[];
  slots: SelectionSlot[];
  /** Question id → recency rank among the student's recent answers (0 = most recent). */
  recentlySeen?: ReadonlyMap<string, number>;
  preferSkills?: ReadonlySet<string>;
  seed: string;
  config?: AdaptiveConfig;
}

export interface SelectedQuestion {
  questionId: string;
  skill: string;
  difficulty: Difficulty | null;
  slotSkill: string | null;
  slotLevel: number;
}

function tieBreak(seed: string, id: string): number {
  const hex = crypto.createHash("sha256").update(`${seed}:${id}`).digest("hex").slice(0, 8);
  return (parseInt(hex, 16) / 0xffffffff) * 0.01;
}

export function questionLevel(q: BankQuestion): number {
  return q.difficulty ? DIFFICULTY_VALUE[q.difficulty] : DIFFICULTY_VALUE.medium;
}

export function selectQuestions(input: SelectionInput): SelectedQuestion[] {
  const config = input.config ?? ADAPTIVE_CONFIG;
  const seenWindow = Math.max(1, config.quiz.recentlySeenWindow);
  const used = new Set<string>();
  const skillCounts = new Map<string, number>();
  const out: SelectedQuestion[] = [];

  for (const slot of input.slots) {
    let best: { q: BankQuestion; cost: number } | null = null;

    for (const q of input.pool) {
      if (used.has(q.id)) continue;

      let cost = 0;
      if (slot.skill && q.skill !== slot.skill) cost += 2.5;
      const distance = Math.abs(questionLevel(q) - slot.level);
      cost += distance + (distance >= 1.75 ? 1 : 0) + (q.difficulty ? 0 : 0.25);

      const rank = input.recentlySeen?.get(q.id);
      if (rank !== undefined) cost += 0.6 + 0.6 * Math.max(0, 1 - rank / seenWindow);

      if (!slot.skill) {
        cost += 0.75 * (skillCounts.get(q.skill) ?? 0);
        if (input.preferSkills?.has(q.skill)) cost -= 0.3;
      }

      cost += tieBreak(input.seed, q.id);
      if (!best || cost < best.cost) best = { q, cost };
    }

    if (!best) break; // pool exhausted
    used.add(best.q.id);
    skillCounts.set(best.q.skill, (skillCounts.get(best.q.skill) ?? 0) + 1);
    out.push({
      questionId: best.q.id,
      skill: best.q.skill,
      difficulty: best.q.difficulty,
      slotSkill: slot.skill,
      slotLevel: slot.level,
    });
  }

  return out;
}

/* ── Planning ─────────────────────────────────────────────────────────────── */

export type QuizPlanKind = "diagnostic" | "focused" | "skill";

export interface QuizPlan {
  kind: QuizPlanKind;
  focusSkill: string | null;
  /** The focus skill's level, or the mean slot level for a diagnostic. */
  targetLevel: number;
  slots: SelectionSlot[];
  preferSkills: string[];
  reason: string;
}

/** Spread levels across easy → hard so a placement quiz can locate the student. */
export function diagnosticLevels(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [2];
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    // Endpoints at easy and hard, the middle weighted toward medium.
    const t = i / (count - 1);
    levels.push(i === 0 ? 1 : i === count - 1 ? 3 : 2 + (t - 0.5) * 0.5);
  }
  return levels;
}

export function planSkillQuiz(state: SkillState, config: AdaptiveConfig = ADAPTIVE_CONFIG): QuizPlan {
  const level = state.difficultyLevel;
  const count = config.quiz.questionCount;
  const m = state.mastery;
  const reason =
    m.band === "insufficient-data"
      ? `A first look at ${state.label.toLowerCase()}, starting between easy and medium.`
      : `Your ${state.label.toLowerCase()} mastery is ${m.score}% (${m.bandLabel.toLowerCase()}), so questions are pitched at ${difficultyForLevel(level)} level.`;
  return {
    kind: "skill",
    focusSkill: state.skill,
    targetLevel: level,
    slots: Array.from({ length: count }, () => ({ skill: state.skill, level })),
    preferSkills: [],
    reason,
  };
}

/**
 * The "adaptive" quiz with no skill chosen: a placement quiz for new learners,
 * otherwise 3 questions on the most-needed skill and the rest on the next ones.
 */
export function planAutoQuiz(skills: SkillState[], config: AdaptiveConfig = ADAPTIVE_CONFIG): QuizPlan {
  const count = config.quiz.questionCount;
  const totalEvidence = skills.reduce((sum, s) => sum + s.mastery.evidenceCount, 0);
  const unassessed = skills.filter((s) => s.mastery.band === "insufficient-data").map((s) => s.skill);

  if (totalEvidence < config.recommendations.minTotalEvidence || skills.length === 0) {
    const levels = diagnosticLevels(count);
    return {
      kind: "diagnostic",
      focusSkill: null,
      targetLevel: levels.reduce((a, v) => a + v, 0) / Math.max(1, levels.length),
      slots: levels.map((level) => ({ skill: null, level })),
      preferSkills: unassessed,
      reason: "A placement quiz: a mix of topics from easy to hard, so we can see where to start.",
    };
  }

  const ranked = rankSkillsForPractice(skills);
  const focus = ranked[0];
  const focusCount = Math.min(count, Math.ceil(count * 0.6));
  const slots: SelectionSlot[] = Array.from({ length: focusCount }, () => ({
    skill: focus.skill,
    level: focus.difficultyLevel,
  }));
  const others = ranked.slice(1);
  for (let i = 0; slots.length < count; i++) {
    const s = others[i];
    slots.push(s ? { skill: s.skill, level: s.difficultyLevel } : { skill: null, level: focus.difficultyLevel });
  }

  const fm = focus.mastery;
  const why =
    fm.band === "insufficient-data"
      ? `we haven't measured ${focus.label.toLowerCase()} yet`
      : `${focus.label.toLowerCase()} is at ${fm.score}% (${fm.bandLabel.toLowerCase()})`;
  return {
    kind: "focused",
    focusSkill: focus.skill,
    targetLevel: focus.difficultyLevel,
    slots,
    preferSkills: unassessed,
    reason: `Mostly ${focus.label.toLowerCase()} because ${why}, plus a few questions on other topics you're working on.`,
  };
}
