/**
 * What an editor saves, students see: the real editor routes write, the real
 * student routes read. Runs against a temporary copy of src/data/grades (the
 * store resolves paths from process.cwd()) and the in-memory fake database,
 * so the repository's curriculum files are never touched.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intellia-store-"));
  const realCwd = process.cwd();
  const originalCwd = process.cwd;
  // Point the curriculum store (and every student route) at the copy; the
  // store reads it once, when its module loads.
  process.cwd = () => tmp;

  /** Puts process.cwd back and removes the copy. */
  function restore() {
    process.cwd = originalCwd;
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const state: { current: { db: Record<string, unknown> } | null } = { current: null };
  const db = new Proxy({}, { get: (_t, prop) => (state.current!.db as Record<string | symbol, unknown>)[prop] });

  /** A fresh copy of the shipped grades, before each test. */
  function resetStore() {
    const target = path.join(tmp, "src", "data", "grades");
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    for (const grade of ["grade1", "grade2", "grade3", "grade4", "grade5", "grade6", "grade7", "grade10"]) {
      fs.cpSync(path.join(realCwd, "src", "data", "grades", grade), path.join(target, grade), { recursive: true });
    }
  }

  return { tmp, state, db, resetStore, restore, getSession: vi.fn() };
});

vi.mock("@/lib/auth/session", () => ({ getSession: h.getSession }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { createFakeDb } from "@/lib/adaptive/test-support/fake-db";
import { GET as listLessons, POST as createLesson } from "@/app/api/editor/lessons/[gradeId]/route";
import { POST as mergeDuplicates } from "@/app/api/editor/lessons/[gradeId]/merge-duplicates/route";
import {
  DELETE as deleteLesson,
  GET as getLesson,
  PATCH as patchLesson,
  PUT as saveLesson,
} from "@/app/api/editor/lessons/[gradeId]/[lessonId]/route";
import { GET as getCurriculumAsEditor, PUT as saveCurriculum } from "@/app/api/editor/curriculum/[gradeId]/route";
import { GET as getGrades } from "@/app/api/editor/grades/route";
import { GET as studentCurriculum } from "@/app/api/student/curriculum/route";
import { GET as studentResources } from "@/app/api/student/lesson-resources/route";
import { readStoreDocument, storePath, writeStoreDocument } from "@/lib/content/curriculum-store";
import { syncLessonIntoCurriculum } from "@/lib/content/lesson-curriculum";
import { saveLesson as storeLesson } from "@/lib/content/lesson-store";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let fake: ReturnType<typeof createFakeDb>;

function req(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

function as(role: "EDITOR" | "STUDENT" | null) {
  h.getSession.mockResolvedValue(role ? { sub: `user-${role}`, role, name: role, email: `${role}@x.test` } : null);
}

async function curriculumForStudent(grade = "grade1"): Promise<Json> {
  as("STUDENT");
  const res = await studentCurriculum(req(`/api/student/curriculum?grade=${grade}`));
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

async function resourcesForStudent(lessonId: string, grade = "grade1"): Promise<Json> {
  as("STUDENT");
  const res = await studentResources(req(`/api/student/lesson-resources?lessonId=${lessonId}&grade=${grade}`));
  return (await res.json()).data;
}

async function lessonAsEditor(lessonId: string, grade = "grade1"): Promise<Json> {
  as("EDITOR");
  return (await (await getLesson(req(`/api/editor/lessons/${grade}/${lessonId}`), params({ gradeId: grade, lessonId }))).json()).data;
}

async function putLesson(lessonId: string, lesson: Json, grade = "grade1") {
  as("EDITOR");
  const res = await saveLesson(req(`/api/editor/lessons/${grade}/${lessonId}`, "PUT", lesson), params({ gradeId: grade, lessonId }));
  return { status: res.status, body: await res.json() };
}

async function lessonsAsEditor(grade = "grade1"): Promise<Json[]> {
  as("EDITOR");
  return (await (await listLessons(req(`/api/editor/lessons/${grade}`), params({ gradeId: grade }))).json()).data;
}

async function addLesson(lesson: Json, grade = "grade1") {
  as("EDITOR");
  const res = await createLesson(req(`/api/editor/lessons/${grade}`, "POST", lesson), params({ gradeId: grade }));
  return { status: res.status, body: await res.json() };
}

async function merge(grade = "grade1") {
  as("EDITOR");
  const res = await mergeDuplicates(req(`/api/editor/lessons/${grade}/merge-duplicates`, "POST"), params({ gradeId: grade }));
  return { status: res.status, body: await res.json() };
}

const topics = (doc: Json) => doc.chapters.flatMap((c: Json) => c.topics as Json[]);
const topicFor = (doc: Json, id: string) => topics(doc).find((t: Json) => t.id === id || t.lessonId === id);

afterAll(() => h.restore());

beforeEach(() => {
  h.resetStore();
  fake = createFakeDb();
  h.state.current = fake as unknown as { db: Record<string, unknown> };
  h.getSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a lesson created in the editor", () => {
  it("shows up in the student's course list and opens on the lesson screen", async () => {
    as("EDITOR");
    const res = await createLesson(
      req("/api/editor/lessons/grade1", "POST", {
        id: "triangle",
        title: "Triangle",
        chapterId: "chap_6",
        estimatedMinutes: 12,
        architectureUrl: "https://triangle-shapes.vercel.app/",
        videoUrl: "https://www.youtube.com/watch?v=abc123XYZ00",
      }),
      params({ gradeId: "grade1" })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).message).toContain("students' course list");

    const doc = await curriculumForStudent();
    const geometry = doc.chapters.find((c: Json) => c.id === "chap_6");
    expect(geometry.topics.at(-1)).toMatchObject({ id: "triangle", title: "Triangle", estimatedTime: "12 mins", status: "active" });
    expect(geometry.topicsCount).toBe(geometry.topics.length);

    const resources = await resourcesForStudent("triangle");
    expect(resources).toMatchObject({
      found: true,
      title: "Triangle",
      architectureUrl: "https://triangle-shapes.vercel.app/",
      video: { videos: [expect.objectContaining({ videoId: "abc123XYZ00" })] },
    });
    // The lesson test knows the new lesson's topic and chapter.
    expect(resources.test).toMatchObject({ available: true, covers: ["2D shapes"] });
  });

  it("goes again when the lesson is deleted", async () => {
    as("EDITOR");
    await createLesson(req("/api/editor/lessons/grade1", "POST", { id: "triangle", title: "Triangle", chapterId: "chap_6" }), params({ gradeId: "grade1" }));
    const res = await deleteLesson(req("/api/editor/lessons/grade1/triangle", "DELETE"), params({ gradeId: "grade1", lessonId: "triangle" }));
    expect((await res.json()).message).toContain("removed from the students' course list");
    expect(topicFor(await curriculumForStudent(), "triangle")).toBeUndefined();
  });

  it("starts a chapter in a grade that has none yet", async () => {
    as("EDITOR");
    await createLesson(
      req("/api/editor/lessons/grade6", "POST", { id: "integers", title: "Integers", chapterId: "chap_1", chapterTitle: "Integers" }),
      params({ gradeId: "grade6" })
    );
    const doc = await curriculumForStudent("grade6");
    expect(doc.chapters).toEqual([expect.objectContaining({ id: "chap_1", title: "Integers", topics: [expect.objectContaining({ id: "integers" })] })]);
  });
});

describe("editing an existing lesson", () => {
  it("changes what students see: title, time and lock", async () => {
    const lesson = await lessonAsEditor("counting-up-to-100");
    const saved = await putLesson("counting-up-to-100", { ...lesson, title: "Counting to 100", estimatedMinutes: 25, locked: true });
    expect(saved.status).toBe(200);
    expect(saved.body.message).toContain("Students' course list updated");

    const topic = topicFor(await curriculumForStudent(), "counting-up-to-100");
    expect(topic).toMatchObject({
      id: "counting-numbers-up-to-100",
      lessonId: "counting-up-to-100",
      title: "Counting to 100",
      estimatedTime: "25 mins",
      status: "locked",
    });
    expect((await resourcesForStudent("counting-numbers-up-to-100")).title).toBe("Counting to 100");
  });

  it("keeps one topic through a second rename", async () => {
    const lesson = await lessonAsEditor("counting-up-to-100");
    await putLesson("counting-up-to-100", { ...lesson, title: "Counting to 100" });
    await putLesson("counting-up-to-100", { ...lesson, title: "Count to a hundred" });

    const doc = await curriculumForStudent();
    const matches = topics(doc).filter((t: Json) => t.id === "counting-numbers-up-to-100" || t.lessonId === "counting-up-to-100");
    expect(matches).toEqual([expect.objectContaining({ title: "Count to a hundred" })]);
    // The lesson screen still finds the lesson file's modules.
    expect((await resourcesForStudent("counting-numbers-up-to-100")).architectureUrl).toBe("https://number-counting-gamma.vercel.app/");
  });

  it("leaves the curriculum alone when only a module link changed", async () => {
    const before = topicFor(await curriculumForStudent(), "counting-numbers-up-to-100");
    const lesson = await lessonAsEditor("counting-up-to-100");
    await putLesson("counting-up-to-100", {
      ...lesson,
      modules: { ...lesson.modules, videoLesson: { enabled: true, url: "https://www.youtube.com/watch?v=newVideo123" } },
    });

    const after = topicFor(await curriculumForStudent(), "counting-numbers-up-to-100");
    // The seed's 20 minutes were never edited, so the curriculum keeps its own time.
    expect(after.estimatedTime).toBe(before.estimatedTime);
    expect(after.title).toBe(before.title);
    expect(after.actionCards.video).toBe("https://www.youtube.com/watch?v=newVideo123");
    expect((await resourcesForStudent("counting-numbers-up-to-100")).video.videos[0].videoId).toBe("newVideo123");
  });

  it("keeps the curriculum's topic when its lesson file is deleted", async () => {
    as("EDITOR");
    await deleteLesson(req("/api/editor/lessons/grade1/counting-up-to-100", "DELETE"), params({ gradeId: "grade1", lessonId: "counting-up-to-100" }));
    expect(topicFor(await curriculumForStudent(), "counting-numbers-up-to-100")).toBeDefined();
  });

  it("mirrors the updated curriculum, so a deploy carries it over", async () => {
    const lesson = await lessonAsEditor("counting-up-to-100");
    await putLesson("counting-up-to-100", { ...lesson, title: "Counting to 100" });
    const mirrored = fake.table("curriculumDocument").find((d) => d.path === "grade1/curriculum.json")!;
    expect(topicFor(mirrored.content as Json, "counting-up-to-100").title).toBe("Counting to 100");
  });
});

describe("a lesson that shipped with the curriculum", () => {
  it("is listed with the rest of the grade, once each", async () => {
    const doc = await curriculumForStudent("grade3");
    const rows = await lessonsAsEditor("grade3");
    expect(rows.map((r) => r.id)).toEqual(topics(doc).map((t: Json) => t.id));
    expect(rows.every((r) => !r.duplicateOf && !r.sharesTitle)).toBe(true);
  });

  it("counts towards its grade", async () => {
    as("EDITOR");
    const grades = (await (await getGrades()).json()).data as Json[];
    const doc = await curriculumForStudent("grade3");
    as("EDITOR");
    expect(grades.find((g) => g.id === "grade3")?.lessonCount).toBe(topics(doc).length);
  });

  it("opens in the editor with what students see today", async () => {
    const lesson = await lessonAsEditor("counting-up-to-10-000", "grade3");
    expect(lesson).toMatchObject({
      id: "counting-up-to-10-000",
      title: "Counting up to 10,000",
      chapterId: "chap_1",
      chapterTitle: "Chapter 1 : Whole Numbers (Up to 10,000)",
      grade: "grade3",
      estimatedMinutes: 19,
      locked: false,
      modules: {
        // "#" and the placeholder video are not links.
        architectureModule: { enabled: false, url: "" },
        videoLesson: { enabled: false, url: "" },
        practiceModule: { enabled: true, url: "/student/quiz/practice-1" },
      },
    });
  });

  it("still answers 404 for a lesson that does not exist", async () => {
    as("EDITOR");
    const res = await getLesson(req("/api/editor/lessons/grade3/no-such-lesson"), params({ gradeId: "grade3", lessonId: "no-such-lesson" }));
    expect(res.status).toBe(404);
  });

  it("reaches students once edited, as the same lesson", async () => {
    const before = await curriculumForStudent("grade3");
    const lesson = await lessonAsEditor("counting-up-to-10-000", "grade3");
    const url = "https://counting-to-ten-thousand.vercel.app/";

    const saved = await putLesson(
      "counting-up-to-10-000",
      { ...lesson, title: "Counting to 10,000", modules: { ...lesson.modules, architectureModule: { enabled: true, url } } },
      "grade3"
    );
    expect(saved.status).toBe(200);

    const doc = await curriculumForStudent("grade3");
    expect(topics(doc)).toHaveLength(topics(before).length);
    expect(topicFor(doc, "counting-up-to-10-000")).toMatchObject({
      title: "Counting to 10,000",
      vercelLink: url,
      // Nothing else about the lesson moved.
      estimatedTime: "19 mins",
      status: "completed",
      xpReward: 66,
    });
    expect(await resourcesForStudent("counting-up-to-10-000", "grade3")).toMatchObject({
      title: "Counting to 10,000",
      architectureUrl: url,
    });
    expect((await lessonsAsEditor("grade3"))[0]).toMatchObject({ id: "counting-up-to-10-000", hasFile: true });
  });

  it("can be patched too", async () => {
    as("EDITOR");
    const res = await patchLesson(
      req("/api/editor/lessons/grade3/counting-up-to-10-000", "PATCH", { estimatedMinutes: 30 }),
      params({ gradeId: "grade3", lessonId: "counting-up-to-10-000" })
    );
    expect(res.status).toBe(200);
    expect(topicFor(await curriculumForStudent("grade3"), "counting-up-to-10-000").estimatedTime).toBe("30 mins");
  });

  it("keeps its curated EduNotes when first saved", async () => {
    // Without its lesson file this topic's EduNotes come from the registry alone.
    as("EDITOR");
    await deleteLesson(req("/api/editor/lessons/grade1/counting-up-to-100", "DELETE"), params({ gradeId: "grade1", lessonId: "counting-up-to-100" }));
    expect((await resourcesForStudent("counting-numbers-up-to-100")).eduNotes).toEqual({ available: true });

    const lesson = await lessonAsEditor("counting-numbers-up-to-100");
    expect(lesson.modules.eduNotes).toEqual({ enabled: true, url: "/student/lesson/edunotes" });
    expect((await putLesson("counting-numbers-up-to-100", lesson)).status).toBe(200);

    expect((await resourcesForStudent("counting-numbers-up-to-100")).eduNotes).toEqual({ available: true });
  });

  it(
    "saves unchanged in every grade without changing anything students see",
    async () => {
      for (const grade of ["grade1", "grade2", "grade3", "grade4", "grade5", "grade7", "grade10"]) {
        const before = await curriculumForStudent(grade);
        const snapshot = async () => {
          const seen: Json[] = [];
          for (const topic of topics(before)) seen.push(await resourcesForStudent(topic.id, grade));
          return seen;
        };
        const resourcesBefore = await snapshot();

        for (const { id } of (await lessonsAsEditor(grade)).filter((r) => !r.hasFile)) {
          const saved = await putLesson(id, await lessonAsEditor(id, grade), grade);
          expect([grade, id, saved.status]).toEqual([grade, id, 200]);
        }

        expect(await curriculumForStudent(grade)).toEqual(before);
        expect(await snapshot()).toEqual(resourcesBefore);
      }
    },
    120_000
  );
});

describe("a lesson appears once in a grade", () => {
  it("refuses adding a title the grade already has, pointing at the lesson to edit", async () => {
    const before = await curriculumForStudent("grade3");
    const res = await addLesson({ id: "counting-again", title: "counting up to 10000", chapterId: "chap_1" }, "grade3");

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Counting up to 10,000");
    expect(res.body.data).toEqual({ id: "counting-up-to-10-000", title: "Counting up to 10,000" });
    expect(await curriculumForStudent("grade3")).toEqual(before);
    expect((await lessonsAsEditor("grade3")).some((r) => r.id === "counting-again")).toBe(false);
  });

  it("refuses reusing a lesson's id, even one with no file yet", async () => {
    const res = await addLesson({ id: "counting-up-to-10-000", title: "Something new", chapterId: "chap_1" }, "grade3");
    expect(res.status).toBe(409);
    expect(res.body.data.id).toBe("counting-up-to-10-000");
  });

  it("refuses a second lesson with the same title in a new grade", async () => {
    expect((await addLesson({ id: "integers", title: "Integers", chapterId: "chap_1" }, "grade6")).status).toBe(201);
    expect((await addLesson({ id: "integers-2", title: "Integers", chapterId: "chap_1" }, "grade6")).status).toBe(409);
  });

  it("allows the same title in another grade", async () => {
    expect((await addLesson({ id: "counting-up-to-10-000", title: "Counting up to 10,000", chapterId: "chap_1" }, "grade6")).status).toBe(201);
  });

  it("refuses renaming a lesson to another lesson's title", async () => {
    const lesson = await lessonAsEditor("counting-up-to-10-000", "grade3");
    const saved = await putLesson("counting-up-to-10-000", { ...lesson, title: "Odd and even numbers" }, "grade3");
    expect(saved.status).toBe(409);
    expect(topicFor(await curriculumForStudent("grade3"), "counting-up-to-10-000").title).toBe("Counting up to 10,000");
  });

  it("refuses the same rename through PATCH", async () => {
    as("EDITOR");
    const res = await patchLesson(
      req("/api/editor/lessons/grade3/counting-up-to-10-000", "PATCH", { title: "Odd and even numbers" }),
      params({ gradeId: "grade3", lessonId: "counting-up-to-10-000" })
    );
    expect(res.status).toBe(409);
  });

  it("still saves curriculum lessons that share a title", async () => {
    const lesson = await lessonAsEditor("word-problems-division", "grade3");
    expect(lesson.title).toBe("Word problems");
    expect((await putLesson("word-problems-division", { ...lesson, estimatedMinutes: 25 }, "grade3")).status).toBe(200);
  });

  it("lets a lesson change the case of its own title", async () => {
    const lesson = await lessonAsEditor("counting-up-to-10-000", "grade3");
    expect((await putLesson("counting-up-to-10-000", { ...lesson, title: "COUNTING UP TO 10,000" }, "grade3")).status).toBe(200);
  });

  it("refuses a curriculum save that repeats a lesson", async () => {
    as("EDITOR");
    const doc = (await (await getCurriculumAsEditor(req("/api/editor/curriculum/grade3"), params({ gradeId: "grade3" }))).json()).data;
    doc.chapters[0].topics.push({ id: "counting-copy", title: "Counting up to 10,000" });

    const res = await saveCurriculum(req("/api/editor/curriculum/grade3", "PUT", doc), params({ gradeId: "grade3" }));

    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("Counting up to 10,000");
    expect(topicFor(await curriculumForStudent("grade3"), "counting-copy")).toBeUndefined();
  });

  it("still saves a curriculum whose repeats were already there", async () => {
    as("EDITOR");
    const doc = (await (await getCurriculumAsEditor(req("/api/editor/curriculum/grade3"), params({ gradeId: "grade3" }))).json()).data;
    doc.chapters[0].title = "Whole numbers";
    expect((await saveCurriculum(req("/api/editor/curriculum/grade3", "PUT", doc), params({ gradeId: "grade3" }))).status).toBe(200);
  });
});

describe("merging lessons added twice", () => {
  /** What re-adding a lesson used to leave behind: a second topic with its own lesson file. */
  async function addTheOldWay(lessonId: string, title: string, url: string, chapterId = "chap_1", grade = "grade3") {
    const lesson = {
      id: lessonId,
      title,
      chapterId,
      estimatedMinutes: 20,
      locked: false,
      modules: {
        eduNotes: { enabled: false, url: "" },
        architectureModule: { enabled: true, url },
        videoLesson: { enabled: false, url: "" },
        practiceModule: { enabled: false, url: "" },
      },
    };
    await storeLesson({ gradeId: grade, lessonId }, lesson, "old-editor");
    const relPath = storePath(grade, "curriculum.json");
    const sync = syncLessonIntoCurriculum(await readStoreDocument(relPath), lessonId, lesson, null)!;
    await writeStoreDocument({ path: relPath, gradeId: grade, kind: "curriculum", content: sync.curriculum }, "curriculum");
  }

  const url = "https://counting-to-ten-thousand.vercel.app/";

  it("flags the duplicate for editors", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    const rows = await lessonsAsEditor("grade3");
    expect(rows.find((r) => r.id === "counting-up-to-10000")?.duplicateOf).toBe("counting-up-to-10-000");
    expect(rows.find((r) => r.id === "counting-up-to-10-000")?.duplicateOf).toBeNull();
  });

  it("leaves students one lesson, where it always was, with the newest link", async () => {
    const before = await curriculumForStudent("grade3");
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);

    const merged = await merge("grade3");
    expect(merged.status).toBe(200);
    expect(merged.body.message).toContain("Merged 1 duplicate lesson");

    const doc = await curriculumForStudent("grade3");
    expect(topics(doc).map((t: Json) => t.id)).toEqual(topics(before).map((t: Json) => t.id));
    expect(doc.chapters[0].topicsCount).toBe(before.chapters[0].topics.length);
    expect(doc.chapters[0].topics[0]).toMatchObject({ id: "counting-up-to-10-000", vercelLink: url, status: "completed", estimatedTime: "19 mins" });
  });

  it("keeps both addresses working, so a saved link still opens the lesson", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    await merge("grade3");
    for (const id of ["counting-up-to-10-000", "counting-up-to-10000"]) {
      expect(await resourcesForStudent(id, "grade3")).toMatchObject({ found: true, architectureUrl: url, title: "Counting up to 10,000" });
    }
  });

  it("moves a lesson re-added to the default chapter back to its own", async () => {
    await addTheOldWay("fractions-again", "Meaning of fractions", url);
    const before = (await curriculumForStudent("grade3")).chapters[0].topics.length;

    await merge("grade3");

    const doc = await curriculumForStudent("grade3");
    expect(doc.chapters[0].topics).toHaveLength(before - 1);
    const lesson = await lessonAsEditor("fractions-again", "grade3");
    const home = doc.chapters.find((c: Json) => c.topics.some((t: Json) => t.lessonId === "fractions-again"));
    expect(lesson.chapterId).toBe(home.id);
    expect(lesson.chapterId).not.toBe("chap_1");
  });

  it("leaves one row in the editor that opens and saves", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    await merge("grade3");

    const rows = (await lessonsAsEditor("grade3")).filter((r) => r.title === "Counting up to 10,000");
    expect(rows).toEqual([expect.objectContaining({ id: "counting-up-to-10000", hasFile: true, duplicateOf: null })]);

    const lesson = await lessonAsEditor(rows[0].id, "grade3");
    expect(lesson.modules.architectureModule).toEqual({ enabled: true, url });
    const saved = await putLesson(rows[0].id, { ...lesson, estimatedMinutes: 31 }, "grade3");
    expect(saved.status).toBe(200);
    expect(topicFor(await curriculumForStudent("grade3"), "counting-up-to-10-000").estimatedTime).toBe("31 mins");
  });

  it("does nothing the second time", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    await merge("grade3");
    const after = await curriculumForStudent("grade3");

    const again = await merge("grade3");
    expect(again.body.message).toBe("No duplicate lessons to merge.");
    expect(await curriculumForStudent("grade3")).toEqual(after);
  });

  it("removes a duplicate's file when the original keeps its own", async () => {
    await addTheOldWay("counting-numbers-again", "Counting numbers up to 100", url, "chap_1", "grade1");
    await merge("grade1");

    expect((await lessonsAsEditor("grade1")).some((r) => r.id === "counting-numbers-again")).toBe(false);
    const gone = await getLesson(
      req("/api/editor/lessons/grade1/counting-numbers-again"),
      params({ gradeId: "grade1", lessonId: "counting-numbers-again" })
    );
    expect(gone.status).toBe(404);
    expect((await lessonAsEditor("counting-up-to-100")).modules.architectureModule.url).toBe(url);
  });

  it("archives what it replaced, so a merge can be undone", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    const relPath = storePath("grade3", "curriculum.json");
    const replaced = await readStoreDocument(relPath);
    await merge("grade3");

    const document = fake.table("curriculumDocument").find((d) => d.path === relPath)!;
    const revisions = fake.table("curriculumRevision").filter((r) => r.documentId === document.id);
    expect(revisions.at(-1)?.content).toEqual(replaced);
  });

  it("is for editors only", async () => {
    await addTheOldWay("counting-up-to-10000", "Counting up to 10,000", url);
    as("STUDENT");
    const res = await mergeDuplicates(req("/api/editor/lessons/grade3/merge-duplicates", "POST"), params({ gradeId: "grade3" }));
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(404);
    expect((await lessonsAsEditor("grade3")).some((r) => r.duplicateOf)).toBe(true);
  });
});

describe("the curriculum editor", () => {
  it("reaches students on their next page load", async () => {
    as("EDITOR");
    const doc = (await (await getCurriculumAsEditor(req("/api/editor/curriculum/grade1"), params({ gradeId: "grade1" }))).json()).data;
    doc.chapters[0].title = "Numbers to 100";
    doc.chapters[0].topics[1].title = "Reading and writing numbers to 100";
    const res = await saveCurriculum(req("/api/editor/curriculum/grade1", "PUT", doc), params({ gradeId: "grade1" }));
    expect(res.status).toBe(200);

    const seen = await curriculumForStudent();
    expect(seen.chapters[0].title).toBe("Numbers to 100");
    expect(seen.chapters[0].topics[1].title).toBe("Reading and writing numbers to 100");
  });
});

describe("GET /api/student/curriculum", () => {
  it("needs a signed-in student", async () => {
    as(null);
    expect((await studentCurriculum(req("/api/student/curriculum?grade=grade1"))).status).toBe(401);
  });

  it("rejects a bad grade and reports a missing one", async () => {
    as("STUDENT");
    expect((await studentCurriculum(req("/api/student/curriculum?grade=../etc"))).status).toBe(400);
    expect((await studentCurriculum(req("/api/student/curriculum?grade=grade42"))).status).toBe(404);
  });

  it("is never cached", async () => {
    as("STUDENT");
    const res = await studentCurriculum(req("/api/student/curriculum?grade=grade1"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
