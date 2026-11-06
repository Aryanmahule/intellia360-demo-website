import { describe, expect, it } from "vitest";
import { ADAPTIVE_CONFIG } from "@/lib/adaptive/config";
import { buildCurriculumGraph, type CurriculumGraph } from "@/lib/adaptive/curriculum-graph";
import { computeMastery, EMPTY_RECORD, type EvidenceItem, type MasteryRecord } from "@/lib/adaptive/mastery";
import {
  buildRecommendations,
  nextEligibleTopic,
  rankSkillsForPractice,
  resolveReachableTopic,
  type SkillState,
} from "@/lib/adaptive/recommendations";
import { skillLabel } from "@/lib/adaptive/skill-map";

const NOW = new Date("2026-10-18T12:00:00Z");
let n = 0;

function skill(name: string, outcomes: boolean[], extra: Partial<MasteryRecord> = {}): SkillState {
  const recent: EvidenceItem[] = outcomes.map((c) => ({ q: `${name}-${n++}`, c, d: "medium", at: NOW.toISOString(), s: "adaptive" }));
  const rec: MasteryRecord = {
    ...EMPTY_RECORD,
    attempts: recent.length,
    correct: recent.filter((r) => r.c).length,
    recent,
    lastPracticedAt: recent.length ? NOW : null,
    ...extra,
  };
  return { skill: name, label: skillLabel(name), mastery: computeMastery(rec, NOW), difficultyLevel: rec.difficultyLevel };
}

const right = (k: number) => Array<boolean>(k).fill(true);
const wrong = (k: number) => Array<boolean>(k).fill(false);

const SKILLS = ["fractions", "addition", "counting", "logic"];

function graph(): CurriculumGraph {
  return buildCurriculumGraph(
    "grade3",
    {
      chapters: [
        {
          chapterNumber: 1,
          title: "Numbers",
          topics: [
            { id: "counting-to-100", title: "Counting to 100" },
            { id: "adding-numbers", title: "Adding numbers" },
          ],
        },
        {
          chapterNumber: 2,
          title: "Fractions",
          topics: [
            { id: "intro-to-parts", title: "Parts of a whole" },
            { id: "meaning-of-fractions", title: "Meaning of fractions" },
            { id: "fractions-test-series", title: "Fractions Test Series" },
          ],
        },
      ],
    },
    [],
    SKILLS
  );
}

describe("new learners", () => {
  it("get a placement quiz first and the first lesson next", () => {
    const recs = buildRecommendations({
      graph: graph(),
      completed: new Set(),
      skills: SKILLS.map((s) => skill(s, [])),
    });
    expect(recs[0].type).toBe("diagnostic");
    expect(recs[0].actions[0].href).toBe("/student/quiz/adaptive");
    expect(recs[0].reason).toMatch(/haven't seen any/);
    const lesson = recs.find((r) => r.type === "next-lesson")!;
    expect(lesson.lesson?.id).toBe("counting-to-100");
    // No per-skill noise before the student has any profile.
    expect(recs.filter((r) => r.skill && r.type !== "next-lesson")).toHaveLength(0);
  });
});

describe("remediation", () => {
  it("sends a struggling student to the foundation lesson, through its prerequisite", () => {
    const recs = buildRecommendations({
      graph: graph(),
      completed: new Set(["counting-to-100", "adding-numbers"]),
      skills: [skill("fractions", [...right(1), ...wrong(6)]), skill("addition", right(12))],
    });
    const remedial = recs.find((r) => r.type === "remedial")!;
    expect(remedial.skill).toBe("fractions");
    expect(remedial.difficulty).toBe("easy");
    // "Meaning of fractions" needs "Parts of a whole" first — it must not be skipped.
    expect(remedial.lesson?.id).toBe("intro-to-parts");
    expect(remedial.reason).toContain('Start with "Parts of a whole"');
    expect(remedial.reason).toMatch(/You answered 1 of your last 7 fractions questions correctly/);
    expect(remedial.actions.map((a) => a.kind)).toEqual(["lesson", "quiz"]);
    expect(recs[0].type).toBe("remedial");
  });

  it("offers a review when the foundation lesson is already completed", () => {
    const recs = buildRecommendations({
      graph: graph(),
      completed: new Set(["counting-to-100", "adding-numbers", "intro-to-parts", "meaning-of-fractions"]),
      skills: [skill("fractions", wrong(8))],
    });
    const remedial = recs.find((r) => r.type === "remedial")!;
    expect(remedial.lesson?.id).toBe("meaning-of-fractions");
    expect(remedial.actions[0].label).toMatch(/^Review/);
  });

  it("calls out repeated mistakes on the same question", () => {
    const s = skill("addition", right(8));
    const repeated: SkillState = { ...s, mastery: { ...s.mastery, repeatedMistakes: ["q1"] } };
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills: [repeated] });
    const remedial = recs.find((r) => r.type === "remedial")!;
    expect(remedial.reason).toContain("missed the same question more than once");
  });

  it("recommends practice only — never an invented lesson — for skills with no linked lesson", () => {
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills: [skill("logic", wrong(8))] });
    const remedial = recs.find((r) => r.type === "remedial")!;
    expect(remedial.lesson).toBeNull();
    expect(remedial.actions).toEqual([
      { label: "Practise with easier questions", href: "/student/quiz/adaptive-logic", kind: "quiz" },
    ]);
  });
});

describe("progression and practice", () => {
  it("recommends targeted practice for developing skills", () => {
    // Half right overall, only two misses in the last five: developing, not struggling.
    const outcomes = [false, false, false, false, true, false, true, true, false, true, true, false];
    const s = skill("addition", outcomes);
    expect(s.mastery.band).toBe("developing");
    expect(s.mastery.recentStruggle).toBe(false);
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills: [s] });
    expect(recs.some((r) => r.type === "remedial")).toBe(false);
    const practice = recs.find((r) => r.type === "targeted-practice");
    expect(practice?.skill).toBe("addition");
    expect(practice?.actions[0].href).toBe("/student/quiz/adaptive-addition");
  });

  it("offers a challenge for a proficient skill and keeps progressing the curriculum", () => {
    const recs = buildRecommendations({
      graph: graph(),
      completed: new Set(["counting-to-100"]),
      skills: [skill("addition", right(25))],
    });
    expect(recs.find((r) => r.type === "challenge")?.difficulty).toBe("hard");
    const next = recs.find((r) => r.type === "next-lesson")!;
    expect(next.lesson?.id).toBe("adding-numbers");
    expect(next.reason).toContain('completed "Counting to 100"');
    expect(next.priority).toBeGreaterThan(recs.find((r) => r.type === "challenge")!.priority);
  });

  it("schedules revision for a well-learned skill left unpractised", () => {
    const stale = skill("addition", right(25), { lastPracticedAt: new Date(NOW.getTime() - 20 * 86_400_000) });
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills: [stale] });
    const revision = recs.find((r) => r.type === "revision")!;
    expect(revision.reason).toContain("20 days");
  });

  it("returns at most the configured number, sorted by priority", () => {
    const skills = ["fractions", "addition", "counting", "logic"].map((s) => skill(s, [...wrong(4), ...right(2)]));
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills });
    expect(recs.length).toBeLessThanOrEqual(ADAPTIVE_CONFIG.recommendations.limit);
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].priority).toBeGreaterThanOrEqual(recs[i].priority);
    expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);
  });

  it("degrades to practice-only when the grade has no curriculum", () => {
    const empty = buildCurriculumGraph("grade9", null, [], SKILLS);
    const recs = buildRecommendations({ graph: empty, completed: new Set(), skills: [skill("fractions", wrong(6))] });
    expect(recs.every((r) => r.lesson === null)).toBe(true);
    expect(recs.some((r) => r.type === "remedial")).toBe(true);
  });

  it("recommends nothing to practise when the grade has no questions", () => {
    const recs = buildRecommendations({ graph: graph(), completed: new Set(), skills: [] });
    expect(recs.map((r) => r.type)).toEqual(["next-lesson"]);
  });
});

describe("prerequisite enforcement", () => {
  const explicit = buildCurriculumGraph(
    "grade4",
    {
      chapters: [
        { chapterNumber: 1, topics: [{ id: "a", title: "A" }] },
        { chapterNumber: 2, topics: [{ id: "b", title: "B", prerequisites: ["c"] }] },
        { chapterNumber: 3, topics: [{ id: "c", title: "C" }] },
      ],
    },
    [],
    []
  );

  it("skips lessons whose prerequisites are incomplete", () => {
    expect(nextEligibleTopic(explicit, new Set(["a"]))?.id).toBe("c");
    expect(nextEligibleTopic(explicit, new Set(["a", "c"]))?.id).toBe("b");
    expect(nextEligibleTopic(explicit, new Set(["a", "b", "c"]))).toBeNull();
  });

  it("walks back to the earliest incomplete prerequisite", () => {
    const b = explicit.topics.find((t) => t.id === "b")!;
    expect(resolveReachableTopic(explicit, b, new Set()).id).toBe("c");
    expect(resolveReachableTopic(explicit, b, new Set(["c"])).id).toBe("b");
  });

  it("survives a prerequisite cycle in authored data", () => {
    const cyclic = buildCurriculumGraph(
      "grade4",
      { chapters: [{ topics: [{ id: "x", title: "X", prerequisites: ["y"] }, { id: "y", title: "Y", prerequisites: ["x"] }] }] },
      [],
      []
    );
    expect(nextEligibleTopic(cyclic, new Set())).toBeNull();
    expect(["x", "y"]).toContain(resolveReachableTopic(cyclic, cyclic.topics[0], new Set()).id);
  });
});

describe("rankSkillsForPractice", () => {
  it("puts the weakest skill first and proficient skills last", () => {
    const ranked = rankSkillsForPractice([
      skill("addition", right(25)),
      skill("fractions", wrong(8)),
      skill("counting", [...right(6), ...wrong(4)]),
    ]);
    expect(ranked.map((s) => s.skill)).toEqual(["fractions", "counting", "addition"]);
  });
});
