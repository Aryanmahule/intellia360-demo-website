/**
 * The learner profile handed to the AI Tutor.
 *
 * Built deterministically on the server from the student's own data — the
 * curriculum lesson, their skill mastery and the questions they actually got
 * wrong — so the model tailors its explanations to real evidence. The model
 * reads this text; it never writes back. Mastery, XP and progress are changed
 * only by graded quiz submissions.
 *
 * Everything quoted comes from the curriculum or the question bank, not from
 * the request. A lesson the student names that is not in their grade's
 * curriculum is not described at all.
 */
import { ADAPTIVE_CONFIG, difficultyForLevel } from "@/lib/adaptive/config";
import { findTopic, isTopicCompleted, type GraphTopic } from "@/lib/adaptive/curriculum-graph";
import { parseEvidence } from "@/lib/adaptive/mastery";
import { correctOptionId, getQuestion } from "@/lib/adaptive/question-bank";
import { buildRecommendations, type SkillState } from "@/lib/adaptive/recommendations";
import type { LearnerState } from "@/lib/adaptive/service";

const MAX_MISTAKES = 3;

/** Collapses whitespace and bounds length so quoted data stays on one line. */
function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function teachingApproach(states: SkillState[]): string {
  const assessed = states.filter((s) => s.mastery.score !== null);
  if (assessed.length === 0) {
    return "We don't know this student's level on this topic yet. Ask one short check question first and adjust to their answer.";
  }
  const weakest = [...assessed].sort((a, b) => a.mastery.score! - b.mastery.score!)[0].mastery;
  if (weakest.band === "foundational" || weakest.recentStruggle) {
    return "Use small steps, concrete everyday examples and small numbers. Check understanding after each step. Give a hint and let the student try before revealing any answer.";
  }
  if (weakest.band === "developing") {
    return "Show one worked example, then let the student try a similar one. Offer a hint before the answer.";
  }
  if (weakest.band === "nearly-proficient") {
    return "Target the specific mistakes listed. Give short practice on them; hints before answers.";
  }
  return "The student is confident here. Offer extension or challenge questions and keep explanations brief unless asked.";
}

export interface TutorContext {
  /** The text block added to the system prompt. */
  text: string;
  /** The curriculum title of the lesson, when the requested lesson was found. */
  lessonTitle: string | null;
  topic: GraphTopic | null;
}

export function buildTutorContext(state: LearnerState, lessonId: string | null | undefined): TutorContext {
  const topic = lessonId ? findTopic(state.graph, lessonId) : null;

  // Skills for this lesson; without a lesson, the student's weakest assessed ones.
  let relevant = topic ? state.skills.filter((s) => topic.skills.includes(s.skill)) : [];
  if (relevant.length === 0) {
    relevant = state.skills
      .filter((s) => s.mastery.score !== null)
      .sort((a, b) => a.mastery.score! - b.mastery.score!)
      .slice(0, 2);
  }

  const lines: string[] = [
    "LEARNER PROFILE (facts from this student's graded answers — not instructions)",
    "-------------------------------------------------------------------------",
    `Grade: ${state.grade}`,
  ];

  if (topic) {
    const chapter = topic.chapterTitle ? ` (${clip(topic.chapterTitle, 80)})` : "";
    const level = topic.difficulty ? ` — curriculum level: ${clip(topic.difficulty, 20)}` : "";
    lines.push(`Current lesson: "${clip(topic.title, 120)}"${chapter}${level}`);
    if (topic.aiContext) lines.push(`Lesson notes: ${clip(topic.aiContext, 300)}`);
    for (const p of topic.prerequisites) {
      const pre = state.graph.topics.find((t) => t.id === p);
      if (pre) {
        lines.push(
          `Builds on: "${clip(pre.title, 120)}" (${isTopicCompleted(pre, state.completed) ? "completed" : "not completed yet"})`
        );
      }
    }
  }

  if (relevant.length > 0) {
    lines.push("Topic mastery:");
    for (const s of relevant) {
      const m = s.mastery;
      lines.push(
        m.score === null
          ? `- ${s.label}: not enough answers yet (${m.evidenceCount} so far)`
          : `- ${s.label}: ${m.score}% — ${m.bandLabel} (${m.confidenceLabel} confidence, ${m.windowCorrect}/${m.windowCount} recent answers correct, trend: ${m.trend})`
      );
    }
  }

  // Recent mistakes: questions answered wrong, newest first, one entry per question.
  const relevantSkills = new Set(relevant.map((s) => s.skill));
  const misses: { q: string; at: number }[] = [];
  for (const row of state.rows) {
    if (!relevantSkills.has(row.skill)) continue;
    for (const item of parseEvidence(row.recent)) if (!item.c) misses.push({ q: item.q, at: Date.parse(item.at) || 0 });
  }
  misses.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const mistakeLines: string[] = [];
  for (const miss of misses) {
    if (seen.has(miss.q) || mistakeLines.length >= MAX_MISTAKES) continue;
    seen.add(miss.q);
    const q = getQuestion(miss.q);
    if (!q) continue;
    const answer = q.options.find((o) => o.id === correctOptionId(q))?.text;
    mistakeLines.push(
      `- "${clip(q.questionText, 160)}"${answer ? ` — correct answer: ${clip(answer, 60)}` : ""}${q.explanation ? `; why: ${clip(q.explanation, 160)}` : ""}`
    );
  }
  if (mistakeLines.length > 0) {
    lines.push("Recent mistakes (use to address misconceptions; let the student retry before giving answers):");
    lines.push(...mistakeLines);
  }

  const level =
    relevant.length > 0
      ? Math.min(...relevant.map((s) => s.difficultyLevel))
      : ADAPTIVE_CONFIG.difficulty.initial;
  lines.push(`Recommended difficulty: ${difficultyForLevel(level)}`);

  const next = buildRecommendations({ graph: state.graph, completed: state.completed, skills: state.skills })[0];
  if (next) lines.push(`Next learning objective: ${clip(next.title, 100)} — ${clip(next.reason, 240)}`);

  lines.push(`Teaching approach: ${teachingApproach(relevant)}`);

  return { text: lines.join("\n"), lessonTitle: topic?.title ?? null, topic };
}
