import { describe, expect, it } from "vitest";
import { ADAPTIVE_CONFIG, type Difficulty } from "@/lib/adaptive/config";
import { computeMastery, EMPTY_RECORD, type EvidenceItem } from "@/lib/adaptive/mastery";
import type { BankQuestion } from "@/lib/adaptive/question-bank";
import { questionPool } from "@/lib/adaptive/question-bank";
import {
  diagnosticLevels,
  planAutoQuiz,
  planSkillQuiz,
  selectQuestions,
} from "@/lib/adaptive/quiz-selection";
import type { SkillState } from "@/lib/adaptive/recommendations";
import { skillLabel } from "@/lib/adaptive/skill-map";

function q(id: string, skill: string, difficulty: Difficulty | null): BankQuestion {
  return {
    id,
    grade: "grade3",
    skill,
    difficulty,
    questionText: id,
    options: [
      { id: "a", text: "A", isCorrect: true },
      { id: "b", text: "B", isCorrect: false },
    ],
    hint: "",
    explanation: "",
  };
}

const POOL: BankQuestion[] = [
  q("f-easy-1", "fractions", "easy"),
  q("f-easy-2", "fractions", "easy"),
  q("f-med-1", "fractions", "medium"),
  q("f-hard-1", "fractions", "hard"),
  q("a-easy-1", "addition", "easy"),
  q("a-med-1", "addition", "medium"),
  q("a-hard-1", "addition", "hard"),
  q("l-med-1", "logic", "medium"),
  q("x-none-1", "logic", null),
];

const NOW = new Date("2026-10-18T12:00:00Z");
function state(name: string, outcomes: boolean[], level = ADAPTIVE_CONFIG.difficulty.initial): SkillState {
  const recent: EvidenceItem[] = outcomes.map((c, i) => ({ q: `${name}${i}`, c, d: "medium", at: NOW.toISOString(), s: "adaptive" }));
  const mastery = computeMastery(
    { ...EMPTY_RECORD, attempts: recent.length, correct: recent.filter((r) => r.c).length, recent, lastPracticedAt: NOW },
    NOW
  );
  return { skill: name, label: skillLabel(name), mastery, difficultyLevel: level };
}

describe("selectQuestions", () => {
  it("serves easy questions at a low level and hard ones at a high level", () => {
    const easy = selectQuestions({ pool: POOL, slots: [{ skill: "fractions", level: 1 }], seed: "s" });
    const hard = selectQuestions({ pool: POOL, slots: [{ skill: "fractions", level: 3 }], seed: "s" });
    expect(easy[0].difficulty).toBe("easy");
    expect(hard[0].difficulty).toBe("hard");
  });

  it("uses focus-skill questions within one level before any other skill's", () => {
    const picked = selectQuestions({
      pool: POOL,
      slots: Array.from({ length: 4 }, () => ({ skill: "fractions", level: 2 })),
      seed: "s",
    });
    // At medium, every fractions question is within one level.
    expect(picked.every((p) => p.skill === "fractions")).toBe(true);
  });

  it("swaps a focus question two levels off target for an on-level one from another skill", () => {
    // A struggling student (easy): the hard fractions question is too far away
    // while an easy question from another skill is available.
    const picked = selectQuestions({
      pool: POOL,
      slots: Array.from({ length: 4 }, () => ({ skill: "fractions", level: 1 })),
      seed: "s",
    });
    const ids = picked.map((p) => p.questionId);
    expect(ids.slice(0, 3).sort()).toEqual(["f-easy-1", "f-easy-2", "f-med-1"]);
    expect(ids[3]).toBe("a-easy-1");
    expect(ids).not.toContain("f-hard-1");
  });

  it("still uses a far-off focus question once on-level alternatives run out", () => {
    const picked = selectQuestions({
      pool: POOL,
      slots: Array.from({ length: 5 }, () => ({ skill: "fractions", level: 1 })),
      seed: "s",
    });
    expect(picked[4].questionId).toBe("f-hard-1");
  });

  it("never repeats a question within a quiz", () => {
    const picked = selectQuestions({
      pool: POOL,
      slots: Array.from({ length: POOL.length + 3 }, () => ({ skill: null, level: 2 })),
      seed: "s",
    });
    expect(new Set(picked.map((p) => p.questionId)).size).toBe(picked.length);
    expect(picked).toHaveLength(POOL.length);
  });

  it("prefers questions the student has not seen recently", () => {
    const fresh = selectQuestions({
      pool: POOL,
      slots: [{ skill: "fractions", level: 1 }],
      recentlySeen: new Map([["f-easy-1", 0], ["f-easy-2", 5]]),
      seed: "s",
    });
    expect(fresh[0].questionId).toBe("f-easy-2");
  });

  it("spreads open slots across skills", () => {
    const picked = selectQuestions({
      pool: POOL,
      slots: Array.from({ length: 3 }, () => ({ skill: null, level: 2 })),
      seed: "s",
    });
    expect(new Set(picked.map((p) => p.skill)).size).toBe(3);
  });

  it("treats unlabelled questions as medium, behind labelled ones", () => {
    const picked = selectQuestions({ pool: POOL, slots: [{ skill: "logic", level: 2 }], seed: "s" });
    expect(picked[0].questionId).toBe("l-med-1");
  });

  it("is deterministic for a seed", () => {
    const slots = Array.from({ length: 5 }, () => ({ skill: null, level: 2 }));
    expect(selectQuestions({ pool: POOL, slots, seed: "abc" })).toEqual(selectQuestions({ pool: POOL, slots, seed: "abc" }));
  });

  it("returns nothing from an empty pool", () => {
    expect(selectQuestions({ pool: [], slots: [{ skill: null, level: 2 }], seed: "s" })).toEqual([]);
  });
});

describe("quiz planning", () => {
  it("spreads a placement quiz from easy to hard", () => {
    const levels = diagnosticLevels(5);
    expect(levels[0]).toBe(1);
    expect(levels.at(-1)).toBe(3);
    expect(levels.slice(1, -1).every((l) => l >= 1.5 && l <= 2.5)).toBe(true);
  });

  it("plans a placement quiz for a new learner", () => {
    const plan = planAutoQuiz([state("fractions", []), state("addition", [])]);
    expect(plan.kind).toBe("diagnostic");
    expect(plan.focusSkill).toBeNull();
    expect(plan.slots).toHaveLength(ADAPTIVE_CONFIG.quiz.questionCount);
    expect(plan.preferSkills).toEqual(["fractions", "addition"]);
  });

  it("focuses an established learner on their weakest skill", () => {
    const plan = planAutoQuiz([
      state("addition", Array(20).fill(true), 2.75),
      state("fractions", Array(8).fill(false), 1),
    ]);
    expect(plan.kind).toBe("focused");
    expect(plan.focusSkill).toBe("fractions");
    expect(plan.slots.filter((s) => s.skill === "fractions")).toHaveLength(3);
    expect(plan.slots[0].level).toBe(1);
    expect(plan.reason).toMatch(/Mostly fractions/);
  });

  it("pitches a single-skill quiz at that skill's level", () => {
    const plan = planSkillQuiz(state("fractions", Array(20).fill(true), 2.5));
    expect(plan.slots.every((s) => s.skill === "fractions" && s.level === 2.5)).toBe(true);
    expect(plan.reason).toMatch(/hard level/);
  });

  it("produces a full quiz from the real grade pools", () => {
    for (const grade of ["grade1", "grade3", "grade5", "grade7"]) {
      const pool = questionPool(grade);
      const plan = planAutoQuiz([]);
      const picked = selectQuestions({ pool, slots: plan.slots, seed: grade });
      expect(picked).toHaveLength(ADAPTIVE_CONFIG.quiz.questionCount);
    }
  });
});
