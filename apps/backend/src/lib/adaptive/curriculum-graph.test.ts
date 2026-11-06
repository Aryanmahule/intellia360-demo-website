import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildCurriculumGraph,
  findTopic,
  isTopicCompleted,
  isTopicEligible,
  topicsForSkill,
} from "@/lib/adaptive/curriculum-graph";
import { poolSkills } from "@/lib/adaptive/question-bank";

const SKILLS = ["fractions", "addition", "counting", "logic"];

const curriculum = {
  chapters: [
    {
      id: "chap_2",
      chapterNumber: 2,
      title: "Fractions",
      topics: [
        { id: "meaning-of-fractions", title: "Meaning of fractions" },
        { id: "equivalent-fractions", title: "Equivalent fractions" },
        { id: "fractions-test-series", title: "Fractions Test Series" },
      ],
    },
    {
      id: "chap_1",
      chapterNumber: 1,
      title: "Numbers",
      topics: [
        { id: "counting-numbers-up-to-100", title: "Counting numbers up to 100" },
        { id: "adding-numbers", title: "Adding numbers", prerequisites: ["counting-numbers-up-to-100", "typo-id"] },
        { id: "puzzles", title: "Puzzles", skills: ["logic"] },
      ],
    },
  ],
  standaloneTopics: [{ id: "bonus", title: "Bonus lesson" }],
};

describe("buildCurriculumGraph", () => {
  const graph = buildCurriculumGraph("grade3", curriculum, [], SKILLS);

  it("orders topics by chapter number, then position", () => {
    expect(graph.topics.map((t) => t.id)).toEqual([
      "counting-numbers-up-to-100",
      "adding-numbers",
      "puzzles",
      "meaning-of-fractions",
      "equivalent-fractions",
      "fractions-test-series",
      "bonus",
    ]);
    expect(graph.topics.map((t) => t.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("uses the previous topic in the chapter as the implicit prerequisite", () => {
    const t = findTopic(graph, "equivalent-fractions")!;
    expect(t.prerequisites).toEqual(["meaning-of-fractions"]);
    expect(t.prerequisiteSource).toBe("sequence");
    expect(findTopic(graph, "meaning-of-fractions")!.prerequisites).toEqual([]);
    expect(findTopic(graph, "bonus")!.prerequisiteSource).toBe("none");
  });

  it("honours explicit prerequisites and reports unknown ids instead of enforcing them", () => {
    const t = findTopic(graph, "adding-numbers")!;
    expect(t.prerequisiteSource).toBe("explicit");
    expect(t.prerequisites).toEqual(["counting-numbers-up-to-100"]);
    expect(graph.unknownPrerequisites).toEqual([{ topicId: "adding-numbers", prerequisite: "typo-id" }]);
  });

  it("derives skills from titles and prefers explicit declarations", () => {
    expect(findTopic(graph, "meaning-of-fractions")!.skills).toEqual(["fractions"]);
    expect(findTopic(graph, "meaning-of-fractions")!.skillSource).toBe("derived");
    expect(findTopic(graph, "adding-numbers")!.skills).toEqual(["addition"]);
    expect(findTopic(graph, "puzzles")!.skills).toEqual(["logic"]);
    expect(findTopic(graph, "puzzles")!.skillSource).toBe("explicit");
    expect(findTopic(graph, "bonus")!.skillSource).toBe("none");
  });

  it("marks chapter test series as assessments", () => {
    expect(findTopic(graph, "fractions-test-series")!.isAssessment).toBe(true);
    expect(findTopic(graph, "meaning-of-fractions")!.isAssessment).toBe(false);
  });

  it("lists a skill's lessons in curriculum order", () => {
    expect(topicsForSkill(graph, "fractions").map((t) => t.id)).toEqual([
      "meaning-of-fractions",
      "equivalent-fractions",
      "fractions-test-series",
    ]);
  });

  it("checks eligibility against completed lessons", () => {
    const t = findTopic(graph, "equivalent-fractions")!;
    expect(isTopicEligible(graph, t, new Set())).toBe(false);
    expect(isTopicEligible(graph, t, new Set(["meaning-of-fractions"]))).toBe(true);
  });
});

describe("lesson-file aliases", () => {
  it("matches lesson files by title so either id counts as completion", () => {
    const graph = buildCurriculumGraph(
      "grade1",
      { chapters: [{ chapterNumber: 1, topics: [{ id: "counting-numbers-up-to-100", title: "Counting numbers up to 100" }] }] },
      [{ lessonId: "counting-up-to-100", content: { id: "counting-up-to-100", title: "Counting  numbers up to 100" } }],
      SKILLS
    );
    const topic = graph.topics[0];
    expect(topic.aliases).toEqual(["counting-up-to-100"]);
    expect(isTopicCompleted(topic, new Set(["counting-up-to-100"]))).toBe(true);
    expect(findTopic(graph, "counting-up-to-100")?.id).toBe("counting-numbers-up-to-100");
  });
});

describe("missing or malformed curriculum", () => {
  it.each([null, undefined, "nope", 42, [], { chapters: "x" }, { chapters: [null, { topics: [{ title: "no id" }] }] }])(
    "yields an empty graph for %j",
    (doc) => {
      expect(buildCurriculumGraph("grade9", doc, [], SKILLS).topics).toEqual([]);
    }
  );

  it("drops duplicate topic ids, keeping the first", () => {
    const graph = buildCurriculumGraph(
      "grade1",
      { chapters: [{ topics: [{ id: "a", title: "First" }, { id: "a", title: "Second" }] }] },
      [],
      SKILLS
    );
    expect(graph.topics).toHaveLength(1);
    expect(graph.topics[0].title).toBe("First");
  });
});

describe("real curricula", () => {
  it.each(["grade1", "grade2", "grade3", "grade4", "grade5"])("%s builds and links lessons to its pool's skills", (grade) => {
    const file = path.join(process.cwd(), "src", "data", "grades", grade, "curriculum.json");
    const graph = buildCurriculumGraph(grade, JSON.parse(fs.readFileSync(file, "utf8")), [], poolSkills(grade));
    expect(graph.topics.length).toBeGreaterThan(0);
    const pool = new Set(poolSkills(grade));
    for (const t of graph.topics) {
      for (const s of t.skills) expect(pool.has(s)).toBe(true);
      for (const p of t.prerequisites) expect(graph.topics.some((x) => x.id === p)).toBe(true);
    }
    expect(graph.topics.some((t) => t.skills.length > 0)).toBe(true);
  });
});
