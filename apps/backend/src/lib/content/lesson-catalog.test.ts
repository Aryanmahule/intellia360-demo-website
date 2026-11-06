import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  addedDuplicates,
  catalogLessons,
  lessonTitleKey,
  planDuplicateMerge,
} from "@/lib/content/lesson-catalog";
import { LESSON_EDITOR_SOURCE } from "@/lib/content/lesson-curriculum";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const topic = (id: string, title: string, extra: Json = {}): Json => ({ id, title, status: "active", estimatedTime: "19 mins", ...extra });
const added = (id: string, title: string, extra: Json = {}) => topic(id, title, { source: LESSON_EDITOR_SOURCE, ...extra });

function chapters(...lists: Json[][]): Json {
  return {
    standaloneTopics: [],
    chapters: lists.map((topics, i) => ({ id: `chap_${i + 1}`, title: `Chapter ${i + 1}`, topicsCount: topics.length, topics })),
  };
}

const file = (lessonId: string, content: Json) => ({ lessonId, content });
const plannedMerge = (doc: Json, files: ReturnType<typeof file>[]) => planDuplicateMerge(doc, files, "grade3") as Json;
const withArchitecture = (title: string, url: string, extra: Json = {}) => ({
  title,
  chapterId: "chap_1",
  estimatedMinutes: 20,
  modules: { architectureModule: { enabled: true, url } },
  ...extra,
});

describe("lessonTitleKey", () => {
  it("treats titles a student would read as the same lesson as equal", () => {
    expect(lessonTitleKey("Counting up to 10,000")).toBe(lessonTitleKey(" counting  up to 10000 "));
    expect(lessonTitleKey("Skip counting (2, 3)")).toBe(lessonTitleKey("Skip Counting 2 3"));
  });

  it("keeps different lessons apart, and ignores what is not a title", () => {
    expect(lessonTitleKey("Counting up to 1,000")).not.toBe(lessonTitleKey("Counting up to 10,000"));
    expect(lessonTitleKey("गिनती")).not.toBe("");
    expect(lessonTitleKey(undefined)).toBe("");
  });
});

describe("catalogLessons", () => {
  it("lists every topic in order, and a file with no topic after them", () => {
    const doc = chapters([topic("a", "A"), topic("b", "B")], [topic("c", "C", { status: "locked" })]);
    const rows = catalogLessons(doc, [file("loose", { title: "Loose", estimatedMinutes: 7 })], "grade3");

    expect(rows.map((r) => [r.id, r.hasFile])).toEqual([["a", false], ["b", false], ["c", false], ["loose", true]]);
    expect(rows[0]).toMatchObject({ estimatedMinutes: 19, chapterId: "chap_1", locked: false, grade: "grade3" });
    expect(rows[2]).toMatchObject({ chapterId: "chap_2", locked: true });
  });

  it("opens a lesson by its file, reached by id, alias or title", () => {
    const doc = chapters([topic("a", "A"), topic("b", "B", { lessonId: "b-file" }), topic("c", "C Lesson")]);
    const rows = catalogLessons(
      doc,
      [file("a", { title: "A" }), file("b-file", { title: "B" }), file("short", { title: "c  lesson" })],
      "grade1"
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b-file", "short"]);
    expect(rows.every((r) => r.hasFile)).toBe(true);
  });

  it("lets a topic's own file win over a title match", () => {
    const doc = chapters([topic("same", "Same"), added("same-2", "Same")]);
    const rows = catalogLessons(doc, [file("same-2", { title: "Same" })], "grade1");
    expect(rows.map((r) => [r.id, r.hasFile])).toEqual([["same", false], ["same-2", true]]);
  });

  it("flags a lesson added again under the same title", () => {
    const doc = chapters([topic("counting", "Counting up to 10,000"), added("counting-2", "Counting up to 10000")]);
    const [original, extra] = catalogLessons(doc, [file("counting-2", { title: "Counting up to 10000" })], "grade3");
    expect(original.duplicateOf).toBeNull();
    expect(extra.duplicateOf).toBe("counting");
  });

  it("flags a re-added lesson even in another chapter", () => {
    const doc = chapters([added("fractions-2", "Fractions")], [topic("fractions", "Fractions")]);
    expect(catalogLessons(doc, [], "grade3")[0].duplicateOf).toBe("fractions");
  });

  it("leaves curriculum lessons that share a title alone", () => {
    const doc = chapters([topic("wp-add", "Word problems")], [topic("wp-mul", "Word problems")]);
    expect(catalogLessons(doc, [], "grade3").every((r) => !r.duplicateOf && !r.sharesTitle)).toBe(true);
  });

  it("asks a person when nothing says which original a lesson repeats", () => {
    const doc = chapters(
      [added("word-problems", "Word problems")],
      [topic("wp-add", "Word problems")],
      [topic("wp-mul", "Word problems")]
    );
    expect(catalogLessons(doc, [], "grade3")[0]).toMatchObject({ duplicateOf: null, sharesTitle: true });
  });

  it("matches such a lesson when it sits in one original's chapter", () => {
    const doc = chapters([added("wp-2", "Word problems"), topic("wp-add", "Word problems")], [topic("wp-mul", "Word problems")]);
    expect(catalogLessons(doc, [], "grade3")[0].duplicateOf).toBe("wp-add");
  });

  it("keeps the first of lessons that were all added in the editor", () => {
    const doc = chapters([added("one", "New lesson"), added("two", "New lesson")]);
    expect(catalogLessons(doc, [], "grade6").map((r) => r.duplicateOf)).toEqual([null, "one"]);
  });
});

describe("addedDuplicates", () => {
  const before = chapters([topic("a", "A")], [topic("wp-1", "Word problems"), topic("wp-2", "Word problems")]);

  it("reports a title or id the save repeats", () => {
    const after = structuredClone(before);
    after.chapters[0].topics.push(topic("a-again", "a"));
    expect(addedDuplicates(before, after)).toEqual(["a"]);

    const sameId = structuredClone(before);
    sameId.chapters[1].topics.push(topic("a", "Something else"));
    expect(addedDuplicates(before, sameId)).toEqual(["Something else"]);
  });

  it("passes repeats that were already there", () => {
    expect(addedDuplicates(before, structuredClone(before))).toEqual([]);
  });

  it("reports a third copy of something already repeated", () => {
    const after = structuredClone(before);
    after.chapters[0].topics.push(topic("wp-3", "Word problems"));
    expect(addedDuplicates(before, after)).toEqual(["Word problems"]);
  });
});

describe("planDuplicateMerge", () => {
  it("returns nothing when there is nothing to merge", () => {
    expect(planDuplicateMerge(chapters([topic("a", "A")]), [], "grade3")).toBeNull();
    expect(planDuplicateMerge(null, [], "grade3")).toBeNull();
  });

  it("gives the original the duplicate's lesson and links, and drops the extra topic", () => {
    const doc = chapters([
      topic("counting", "Counting", { vercelLink: "#", actionCards: { architecture: "#", video: "" } }),
      added("counting-2", "Counting"),
    ]);
    const plan = plannedMerge(doc, [
      file("counting-2", withArchitecture("Counting", "https://counting.vercel.app/", { locked: true, chapterId: "chap_9" })),
    ]);

    const { topics, topicsCount } = plan.curriculum.chapters[0];
    expect(topicsCount).toBe(1);
    expect(topics).toEqual([
      expect.objectContaining({
        id: "counting",
        lessonId: "counting-2",
        vercelLink: "https://counting.vercel.app/",
        actionCards: { architecture: "https://counting.vercel.app/", video: "" },
      }),
    ]);
    expect(plan.removes).toEqual([]);
    // The lesson stays where it was and as it was: not the duplicate's chapter or lock.
    expect(plan.saves).toEqual([
      {
        lessonId: "counting-2",
        content: expect.objectContaining({ id: "counting-2", chapterId: "chap_1", locked: false }),
      },
    ]);
  });

  it("keeps a file the original already has, with the newest working link for each module", () => {
    const doc = chapters([topic("fractions", "Fractions"), added("fractions-2", "Fractions"), added("fractions-3", "Fractions")]);
    const plan = plannedMerge(doc, [
      file("fractions", {
        title: "Fractions",
        modules: {
          architectureModule: { enabled: true, url: "https://old.vercel.app/" },
          videoLesson: { enabled: true, url: "https://www.youtube.com/watch?v=oldVideo000" },
        },
      }),
      file("fractions-2", withArchitecture("Fractions", "https://middle.vercel.app/")),
      file("fractions-3", withArchitecture("Fractions", "https://newest.vercel.app/")),
    ]);

    expect(plan.saves).toHaveLength(1);
    expect(plan.saves[0].lessonId).toBe("fractions");
    expect(plan.saves[0].content.modules).toMatchObject({
      architectureModule: { enabled: true, url: "https://newest.vercel.app/" },
      videoLesson: { enabled: true, url: "https://www.youtube.com/watch?v=oldVideo000" },
    });
    expect(plan.removes).toEqual(["fractions-2", "fractions-3"]);
    expect(plan.curriculum.chapters[0].topics).toHaveLength(1);
    expect(plan.curriculum.chapters[0].topics[0].lessonId).toBeUndefined();
  });

  it("does not let a duplicate without a link wipe the original's", () => {
    const doc = chapters([
      topic("a", "A", { vercelLink: "https://a.vercel.app/", actionCards: { architecture: "https://a.vercel.app/" } }),
      added("a-2", "A"),
    ]);
    const plan = plannedMerge(doc, [file("a-2", { title: "A", modules: { architectureModule: { enabled: false, url: "" } } })]);
    expect(plan.curriculum.chapters[0].topics[0].vercelLink).toBe("https://a.vercel.app/");
  });

  it("does not let a duplicate's unticked modules switch off what the original had", () => {
    const video = "https://www.youtube.com/watch?v=realVideo00";
    const doc = chapters([topic("a", "A", { actionCards: { architecture: "#", video } }), added("a-2", "A")]);
    const plan = plannedMerge(doc, [
      file("a-2", {
        title: "A",
        modules: {
          architectureModule: { enabled: true, url: "https://new.vercel.app/" },
          videoLesson: { enabled: false, url: "" },
        },
      }),
    ]);
    expect(plan.saves[0].content.modules).toMatchObject({
      architectureModule: { enabled: true, url: "https://new.vercel.app/" },
      videoLesson: { enabled: true, url: video },
    });
  });

  it("folds a loose lesson file into the topic it repeats", () => {
    const doc = chapters([topic("counting", "Counting up to 10,000")]);
    const plan = plannedMerge(doc, [file("counting-new", withArchitecture("Counting up to 10000", "https://c.vercel.app/"))]);
    expect(plan.curriculum.chapters[0].topics[0]).toMatchObject({ lessonId: "counting-new", vercelLink: "https://c.vercel.app/" });
    expect(plan.saves[0].content.title).toBe("Counting up to 10,000");
  });

  it("leaves lessons it can't place, and never touches the document it was given", () => {
    const doc = chapters(
      [added("word-problems", "Word problems"), topic("a", "A"), added("a-2", "A")],
      [topic("wp-add", "Word problems")],
      [topic("wp-mul", "Word problems")]
    );
    const copy = structuredClone(doc);
    const plan = plannedMerge(doc, []);

    expect(plan.merged).toEqual([{ kept: "a", removed: ["a-2"] }]);
    expect(plan.curriculum.chapters[0].topics.map((t: Json) => t.id)).toEqual(["word-problems", "a"]);
    expect(doc).toEqual(copy);
  });
});
