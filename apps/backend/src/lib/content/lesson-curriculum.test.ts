import { describe, expect, it } from "vitest";
import {
  LESSON_EDITOR_SOURCE,
  removeLessonFromCurriculum,
  syncLessonIntoCurriculum,
} from "@/lib/content/lesson-curriculum";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function curriculum(): Json {
  return {
    activeTopic: null,
    standaloneTopics: [],
    chapters: [
      {
        id: "chap_1",
        chapterNumber: 1,
        title: "Numbers and Counting",
        topicsCount: 2,
        topics: [
          {
            id: "counting-numbers-up-to-100",
            title: "Counting numbers up to 100",
            status: "active",
            estimatedTime: "13 mins",
            vercelLink: "https://number-counting-gamma.vercel.app/",
            heroSlide: { title: "Counting numbers up to 100", subtitle: "Learn all about counting!" },
            actionCards: { architecture: "https://number-counting-gamma.vercel.app/", video: "", edunotes: "/student/lesson/edunotes", practice: "https://old.example/quiz" },
            aiContext: "The student is currently learning about Counting numbers up to 100.",
          },
          { id: "number-patterns", title: "Number patterns", status: "active", estimatedTime: "15 mins" },
        ],
      },
      { id: "chap_2", chapterNumber: 2, title: "Addition", topicsCount: 0, topics: [] },
    ],
  };
}

/** A seeded lesson file whose id differs from its curriculum topic, like counting-up-to-100.json. */
function seededLesson(overrides: Json = {}): Json {
  return {
    id: "counting-up-to-100",
    title: "Counting numbers up to 100",
    description: "Learn to count numbers from 1 to 100 through engaging activities.",
    chapterId: "chap_1",
    chapterTitle: "Numbers And Counting",
    estimatedMinutes: 20,
    locked: false,
    heroVisualizer: "numbers-to-1000",
    modules: {
      architectureModule: { enabled: true, url: "https://number-counting-gamma.vercel.app/" },
      videoLesson: { enabled: true, url: "/student/lesson/video" },
      practiceModule: { enabled: true, url: "/student/quiz/practice-1" },
      eduNotes: { enabled: true, url: "/student/lesson/edunotes" },
    },
    ...overrides,
  };
}

const topicOf = (doc: Json, id: string) =>
  doc.chapters.flatMap((c: Json) => c.topics).find((t: Json) => t.id === id || t.lessonId === id);

describe("a new lesson", () => {
  it("becomes a topic in its chapter, with everything students see", () => {
    const lesson = {
      id: "comparing-big-numbers",
      title: "Comparing big numbers",
      description: "Which is bigger?",
      chapterId: "chap_1",
      estimatedMinutes: 25,
      locked: false,
      heroVisualizer: "place-value",
      modules: {
        architectureModule: { enabled: true, url: "https://compare.vercel.app/" },
        videoLesson: { enabled: true, url: "https://www.youtube.com/watch?v=abc123XYZ00" },
        practiceModule: { enabled: false, url: "" },
        eduNotes: { enabled: true, url: "/student/lesson/edunotes" },
      },
    };
    const sync = syncLessonIntoCurriculum(curriculum(), "comparing-big-numbers", lesson, null)!;

    expect(sync.change).toBe("created");
    const chapter = (sync.curriculum as Json).chapters[0];
    expect(chapter.topicsCount).toBe(3);
    expect(chapter.topics[2]).toMatchObject({
      id: "comparing-big-numbers",
      title: "Comparing big numbers",
      status: "active",
      estimatedTime: "25 mins",
      vercelLink: "https://compare.vercel.app/",
      heroSlide: { title: "Comparing big numbers", subtitle: "Which is bigger?", visualizerKey: "place-value" },
      // Placeholder student screens and disabled modules are not links.
      actionCards: { architecture: "https://compare.vercel.app/", video: "https://www.youtube.com/watch?v=abc123XYZ00", edunotes: "", practice: "" },
      source: LESSON_EDITOR_SOURCE,
    });
  });

  it("starts locked when the editor locked it", () => {
    const sync = syncLessonIntoCurriculum(curriculum(), "secret", { title: "Secret", chapterId: "chap_2", locked: true }, null)!;
    expect(topicOf(sync.curriculum, "secret").status).toBe("locked");
  });

  it("opens a chapter when the grade has none to match", () => {
    const empty = { chapters: [] };
    const sync = syncLessonIntoCurriculum(empty, "algebra-intro", { title: "Algebra", chapterId: "chap_9", chapterTitle: "Algebra" }, null)!;
    expect((sync.curriculum as Json).chapters).toEqual([
      expect.objectContaining({ id: "chap_9", chapterNumber: 1, title: "Algebra", topicsCount: 1 }),
    ]);
  });

  it("matches a chapter by title, ignoring the 'Chapter N :' prefix", () => {
    const doc = curriculum();
    doc.chapters[1].title = "Chapter 2 : Addition";
    const sync = syncLessonIntoCurriculum(doc, "adding-tens", { title: "Adding tens", chapterId: "x", chapterTitle: "Addition" }, null)!;
    expect((sync.curriculum as Json).chapters[1].topics[0].id).toBe("adding-tens");
  });

  it("does not take over an existing topic that only shares its title", () => {
    const sync = syncLessonIntoCurriculum(curriculum(), "number-patterns-2", { title: "Number patterns", chapterId: "chap_1" }, null)!;
    expect(sync.change).toBe("created");
    expect((sync.curriculum as Json).chapters[0].topics).toHaveLength(3);
    expect(topicOf(sync.curriculum, "number-patterns").lessonId).toBeUndefined();
  });
});

describe("saving an existing lesson", () => {
  it("copies only what the editor changed", () => {
    const previous = seededLesson();
    const saved = seededLesson({ title: "Counting to 100", estimatedMinutes: 20, locked: true });
    const sync = syncLessonIntoCurriculum(curriculum(), "counting-up-to-100", saved, previous)!;
    const topic = topicOf(sync.curriculum, "counting-up-to-100");

    expect(sync.change).toBe("updated");
    expect(topic).toMatchObject({
      id: "counting-numbers-up-to-100",
      lessonId: "counting-up-to-100",
      title: "Counting to 100",
      status: "locked",
      // The seed's 20 minutes were not touched, so the curriculum's 13 stays.
      estimatedTime: "13 mins",
      aiContext: "The student is currently learning about Counting to 100.",
    });
    expect(topic.heroSlide.title).toBe("Counting to 100");
    // Description untouched too.
    expect(topic.heroSlide.subtitle).toBe("Learn all about counting!");
  });

  it("keeps the link after a rename, through the topic's lessonId", () => {
    const first = syncLessonIntoCurriculum(curriculum(), "counting-up-to-100", seededLesson({ title: "Counting to 100" }), seededLesson())!;
    const second = syncLessonIntoCurriculum(
      first.curriculum,
      "counting-up-to-100",
      seededLesson({ title: "Count to a hundred" }),
      seededLesson({ title: "Counting to 100" })
    )!;
    expect(second.change).toBe("updated");
    expect((second.curriculum as Json).chapters[0].topics).toHaveLength(2);
    expect(topicOf(second.curriculum, "counting-up-to-100").title).toBe("Count to a hundred");
  });

  it("copies changed module links, but not placeholders or switched-off modules", () => {
    const previous = seededLesson();
    const saved = seededLesson({
      modules: {
        ...previous.modules,
        videoLesson: { enabled: true, url: "https://www.youtube.com/watch?v=newVideo123" },
        practiceModule: { enabled: true, url: "/student/quiz/test-counting-numbers-up-to-100" },
        eduNotes: { enabled: false, url: "" },
      },
    });
    const topic = topicOf(syncLessonIntoCurriculum(curriculum(), "counting-up-to-100", saved, previous)!.curriculum, "counting-up-to-100");
    expect(topic.actionCards).toEqual({
      architecture: "https://number-counting-gamma.vercel.app/",
      video: "https://www.youtube.com/watch?v=newVideo123",
      edunotes: "/student/lesson/edunotes",
      practice: "/student/quiz/test-counting-numbers-up-to-100",
    });
  });

  it("unlocks a topic the editor unlocks", () => {
    const doc = curriculum();
    doc.chapters[0].topics[1].status = "locked";
    const lesson = { id: "number-patterns", title: "Number patterns", chapterId: "chap_1", locked: false };
    const sync = syncLessonIntoCurriculum(doc, "number-patterns", lesson, { ...lesson, locked: true })!;
    expect(topicOf(sync.curriculum, "number-patterns").status).toBe("active");
  });

  it("moves the topic when the editor moves the lesson to another chapter", () => {
    const lesson = { id: "number-patterns", title: "Number patterns", chapterId: "chap_2" };
    const sync = syncLessonIntoCurriculum(curriculum(), "number-patterns", lesson, { ...lesson, chapterId: "chap_1" })!;
    expect((sync.curriculum as Json).chapters[0]).toMatchObject({ topicsCount: 1 });
    expect((sync.curriculum as Json).chapters[1]).toMatchObject({ topicsCount: 1, topics: [expect.objectContaining({ id: "number-patterns" })] });
  });

  it("reports no change when nothing students see changed", () => {
    const lesson = seededLesson();
    const doc = syncLessonIntoCurriculum(curriculum(), "counting-up-to-100", lesson, lesson)!.curriculum;
    expect(syncLessonIntoCurriculum(doc, "counting-up-to-100", lesson, lesson)!.change).toBe("unchanged");
  });

  it("never mutates the curriculum it was given", () => {
    const doc = curriculum();
    const copy = structuredClone(doc);
    syncLessonIntoCurriculum(doc, "counting-up-to-100", seededLesson({ title: "X" }), seededLesson());
    syncLessonIntoCurriculum(doc, "brand-new", { title: "New", chapterId: "chap_1" }, null);
    expect(doc).toEqual(copy);
  });

  it("ignores a curriculum that is not an object", () => {
    expect(syncLessonIntoCurriculum(null, "a", { title: "A" }, null)).toBeNull();
    expect(syncLessonIntoCurriculum([], "a", { title: "A" }, null)).toBeNull();
  });
});

describe("deleting a lesson", () => {
  it("removes the topic the editor created", () => {
    const created = syncLessonIntoCurriculum(curriculum(), "brand-new", { title: "New", chapterId: "chap_2" }, null)!.curriculum;
    const after = removeLessonFromCurriculum(created, "brand-new")!;
    expect((after as Json).chapters[1]).toMatchObject({ topicsCount: 0, topics: [] });
  });

  it("keeps a topic that was in the curriculum before the lesson file", () => {
    const linked = syncLessonIntoCurriculum(curriculum(), "counting-up-to-100", seededLesson({ title: "Y" }), seededLesson())!.curriculum;
    expect(removeLessonFromCurriculum(linked, "counting-up-to-100")).toBeNull();
  });
});
