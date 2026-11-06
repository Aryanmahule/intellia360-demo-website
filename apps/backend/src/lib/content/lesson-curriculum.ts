/**
 * Keeps a grade's curriculum in step with its Lesson editor.
 *
 * Students reach lessons through curriculum.json: the chapters and topics in
 * the sidebar, on the dashboard and on the Courses page. The Lesson editor
 * saves lesson files, which on their own only feed the lesson screen's
 * modules, so a lesson created in the editor never appeared in a student's
 * lists, and a changed title, time or lock never left the editor. Every
 * lesson save therefore also updates the lesson's topic in curriculum.json
 * (creating it for a new lesson), and deleting a lesson removes the topic the
 * editor created for it.
 *
 * Only what the editor changed is copied. Comparing the save with the
 * previous version means a value nobody touched (the placeholder minutes in a
 * seeded lesson file, say) never overwrites what the curriculum says. A new
 * topic gets everything.
 *
 * Lessons are linked to topics by id, then by the topic's `lessonId` alias,
 * then (for a lesson that already existed) by title. Once linked, the topic
 * records the lesson's id as `lessonId`, so a later rename keeps the link —
 * the lesson screen and the adaptive curriculum graph already read that alias.
 */
import {
  readStoreDocument,
  storePath,
  writeStoreDocument,
} from "@/lib/content/curriculum-store";
import type { LessonContent } from "@/lib/content/lesson-store";
import { recordAudit } from "@/lib/audit";
import { isValidModuleUrl } from "@intellia360/shared/content/lesson-modules";

type Json = Record<string, unknown>;

/** Marks topics the Lesson editor created, so deleting the lesson can remove them. */
export const LESSON_EDITOR_SOURCE = "lesson-editor";

/** Lesson module → the curriculum action card students' screens read. */
export const MODULE_CARDS: Record<string, string> = {
  architectureModule: "architecture",
  videoLesson: "video",
  eduNotes: "edunotes",
  practiceModule: "practice",
};

/** Seed lessons point modules at the student's own screens; those are not real links. */
const STUDENT_SCREEN = /^\/student\/lesson(?:[/?#]|$)/i;

const DEFAULT_AI_CONTEXT = /^The student is currently learning about /;

export function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalize(value: unknown): string {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

/** "Chapter 1 : Numbers to 200" and "Numbers to 200" name the same chapter. */
function chapterKey(value: unknown): string {
  return normalize(value).replace(/^chapter\s*\d+\s*:?\s*/, "");
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** A module link students can be sent to: enabled, valid, and not a placeholder student screen. */
export function moduleLink(lesson: LessonContent, key: string): string | null {
  const mod = isObject(lesson.modules) ? lesson.modules[key] : null;
  if (!isObject(mod) || mod.enabled !== true) return null;
  const url = text(mod.url);
  return url && isValidModuleUrl(url) && !STUDENT_SCREEN.test(url) ? url : null;
}

export interface TopicSpot {
  topic: Json;
  list: unknown[];
  chapter: Json | null;
}

export function topicSpots(doc: Json): TopicSpot[] {
  const spots: TopicSpot[] = [];
  for (const chapter of Array.isArray(doc.chapters) ? doc.chapters : []) {
    if (!isObject(chapter) || !Array.isArray(chapter.topics)) continue;
    for (const topic of chapter.topics) if (isObject(topic)) spots.push({ topic, list: chapter.topics, chapter });
  }
  if (Array.isArray(doc.standaloneTopics)) {
    for (const topic of doc.standaloneTopics) if (isObject(topic)) spots.push({ topic, list: doc.standaloneTopics, chapter: null });
  }
  return spots;
}

/**
 * The topic a lesson belongs to. Titles are only compared for a lesson that
 * already existed, and never take a topic linked to a different lesson: a new
 * lesson that happens to share a title is a new topic.
 */
export function findLessonTopic(doc: Json, lessonId: string, titles: string[] = []): TopicSpot | null {
  const spots = topicSpots(doc);
  const wanted = titles.map(normalize).filter(Boolean);
  return (
    spots.find((s) => s.topic.id === lessonId) ??
    spots.find((s) => s.topic.lessonId === lessonId) ??
    spots.find(
      (s) => wanted.includes(normalize(s.topic.title)) && (!text(s.topic.lessonId) || s.topic.lessonId === lessonId)
    ) ??
    null
  );
}

/** The chapter a lesson names, by id and then by title; created when `create` is set and none matches. */
function chapterFor(doc: Json, lesson: LessonContent, create: boolean): Json | null {
  const chapters = (doc.chapters as unknown[]).filter(isObject);
  const id = text(lesson.chapterId);
  const key = chapterKey(lesson.chapterTitle);
  const found =
    (id ? chapters.find((c) => c.id === id) : undefined) ??
    (key ? chapters.find((c) => chapterKey(c.title) === key) : undefined);
  if (found || !create) return found ?? null;

  const number = chapters.reduce((max, c) => Math.max(max, typeof c.chapterNumber === "number" ? c.chapterNumber : 0), 0) + 1;
  const chapter: Json = {
    id: id || `chap_${number}`,
    chapterNumber: number,
    title: text(lesson.chapterTitle) || `Chapter ${number}`,
    topicsCount: 0,
    topics: [],
  };
  (doc.chapters as unknown[]).push(chapter);
  return chapter;
}

function heroOf(topic: Json): Json {
  if (!isObject(topic.heroSlide)) topic.heroSlide = {};
  return topic.heroSlide as Json;
}

function cardsOf(topic: Json): Json {
  if (!isObject(topic.actionCards)) topic.actionCards = {};
  return topic.actionCards as Json;
}

/** Puts one module's link on the topic; a module without a link leaves the topic's own alone. */
export function copyModuleLink(topic: Json, lesson: LessonContent, key: string) {
  const card = MODULE_CARDS[key];
  const link = moduleLink(lesson, key);
  // A disabled or placeholder module leaves the curriculum's own link alone:
  // the lesson screen already hides a module the editor switched off.
  if (!card || !link) return;
  cardsOf(topic)[card] = link;
  if (card === "architecture") topic.vercelLink = link;
}

export function recount(chapter: Json | null) {
  if (chapter && Array.isArray(chapter.topics)) chapter.topicsCount = chapter.topics.length;
}

/** A complete topic for a lesson the curriculum does not have yet. */
function newTopic(lessonId: string, lesson: LessonContent): Json {
  const title = text(lesson.title) || lessonId;
  const minutes = typeof lesson.estimatedMinutes === "number" && lesson.estimatedMinutes > 0 ? lesson.estimatedMinutes : null;
  const architecture = moduleLink(lesson, "architectureModule") ?? "";
  return {
    id: lessonId,
    title,
    status: lesson.locked === true ? "locked" : "active",
    icon: "star",
    vercelLink: architecture,
    ...(minutes ? { estimatedTime: `${minutes} mins` } : {}),
    heroSlide: {
      tag: "Today's Adventure",
      lessonId,
      title,
      subtitle: text(lesson.description) || `Learn all about ${title} in this exciting lesson!`,
      ctaText: "Start Learning →",
      ctaUrl: architecture,
      visualizerKey: text(lesson.heroVisualizer),
      visualizerData: isObject(lesson.heroVisualizerData) ? lesson.heroVisualizerData : {},
    },
    actionCards: Object.fromEntries(
      Object.entries(MODULE_CARDS).map(([key, card]) => [card, moduleLink(lesson, key) ?? ""])
    ),
    aiContext: `The student is currently learning about ${title}.`,
    source: LESSON_EDITOR_SOURCE,
  };
}

/** Copies the fields the editor changed onto an existing topic. */
function applyChanges(topic: Json, lesson: LessonContent, previous: LessonContent | null) {
  const changed = (key: string) => !previous || !same(previous[key], lesson[key]);

  const title = text(lesson.title);
  if (title && changed("title")) {
    topic.title = title;
    if (isObject(topic.heroSlide)) topic.heroSlide.title = title;
    if (typeof topic.aiContext !== "string" || DEFAULT_AI_CONTEXT.test(topic.aiContext)) {
      topic.aiContext = `The student is currently learning about ${title}.`;
    }
  }

  const description = text(lesson.description);
  if (description && changed("description")) heroOf(topic).subtitle = description;

  if (changed("estimatedMinutes") && typeof lesson.estimatedMinutes === "number" && lesson.estimatedMinutes > 0) {
    topic.estimatedTime = `${lesson.estimatedMinutes} mins`;
  }

  if (changed("locked") && typeof lesson.locked === "boolean") {
    if (lesson.locked) topic.status = "locked";
    else if (topic.status === "locked") topic.status = "active";
  }

  const visualizer = text(lesson.heroVisualizer);
  if (visualizer && changed("heroVisualizer")) heroOf(topic).visualizerKey = visualizer;
  if (isObject(lesson.heroVisualizerData) && changed("heroVisualizerData")) heroOf(topic).visualizerData = lesson.heroVisualizerData;

  const before = isObject(previous?.modules) ? previous.modules : {};
  const after = isObject(lesson.modules) ? lesson.modules : {};
  for (const key of Object.keys(MODULE_CARDS)) {
    if (previous && same(before[key], after[key])) continue;
    copyModuleLink(topic, lesson, key);
  }
}

export type CurriculumChange = "created" | "updated" | "unchanged";

export interface CurriculumSync {
  curriculum: Json;
  change: CurriculumChange;
  topicId: string | null;
}

/**
 * The curriculum with `lesson` applied. Pure: returns a new document and
 * leaves `curriculum` untouched. Null when `curriculum` is not an object.
 */
export function syncLessonIntoCurriculum(
  curriculum: unknown,
  lessonId: string,
  lesson: LessonContent,
  previous: LessonContent | null
): CurriculumSync | null {
  if (!isObject(curriculum)) return null;
  const doc = structuredClone(curriculum);
  if (!Array.isArray(doc.chapters)) doc.chapters = [];

  const titles = previous ? [previous.title, lesson.title].map(text) : [];
  const spot = findLessonTopic(doc, lessonId, titles);

  if (!spot) {
    const chapter = chapterFor(doc, lesson, true)!;
    (chapter.topics as unknown[]).push(newTopic(lessonId, lesson));
    recount(chapter);
    return { curriculum: doc, change: "created", topicId: lessonId };
  }

  const before = JSON.stringify(doc);
  const topic = spot.topic;
  if (topic.id !== lessonId && topic.lessonId !== lessonId) topic.lessonId = lessonId;
  applyChanges(topic, lesson, previous);

  // Moving chapters only when the editor changed the lesson's chapter.
  if (previous && !same(previous.chapterId, lesson.chapterId)) {
    const target = chapterFor(doc, lesson, false);
    if (target && target !== spot.chapter && Array.isArray(target.topics)) {
      spot.list.splice(spot.list.indexOf(topic), 1);
      target.topics.push(topic);
      recount(spot.chapter);
      recount(target);
    }
  }

  return {
    curriculum: doc,
    change: JSON.stringify(doc) === before ? "unchanged" : "updated",
    topicId: typeof topic.id === "string" ? topic.id : null,
  };
}

/** The curriculum without the topic the editor created for `lessonId`; null when there is none. */
export function removeLessonFromCurriculum(curriculum: unknown, lessonId: string): Json | null {
  if (!isObject(curriculum)) return null;
  const doc = structuredClone(curriculum);
  const spot = findLessonTopic(doc, lessonId);
  // A topic that was in the curriculum before the lesson file stays: deleting
  // the file removes the editor's module links, not the curriculum's lesson.
  if (!spot || spot.topic.source !== LESSON_EDITOR_SOURCE) return null;
  spot.list.splice(spot.list.indexOf(spot.topic), 1);
  recount(spot.chapter);
  return doc;
}

export interface CurriculumUpdate {
  change: CurriculumChange | "removed";
  /** Set when the lesson was saved but the curriculum could not be updated. */
  error?: string;
}

interface UpdateArgs {
  gradeId: string;
  lessonId: string;
  /** The lesson as saved, or null when it was deleted. */
  lesson: LessonContent | null;
  previous: LessonContent | null;
  actor: { userId: string; email: string; role: string };
  request?: Request;
}

/**
 * Applies a lesson save (or deletion) to the grade's curriculum.json and
 * stores it through the curriculum store — file and database mirror — with an
 * audit entry. Never throws: the lesson is already saved, so a failure here is
 * reported back for the editor to see.
 */
export async function updateCurriculumForLesson(args: UpdateArgs): Promise<CurriculumUpdate> {
  const relPath = storePath(args.gradeId, "curriculum.json");
  try {
    const current = await readStoreDocument(relPath);
    if (!isObject(current)) {
      return { change: "unchanged", error: `${args.gradeId} has no curriculum.json to add the lesson to.` };
    }

    let next: Json | null;
    let change: CurriculumUpdate["change"];
    if (args.lesson) {
      const sync = syncLessonIntoCurriculum(current, args.lessonId, args.lesson, args.previous);
      next = sync && sync.change !== "unchanged" ? sync.curriculum : null;
      change = sync?.change ?? "unchanged";
    } else {
      next = removeLessonFromCurriculum(current, args.lessonId);
      change = next ? "removed" : "unchanged";
    }
    if (!next) return { change: "unchanged" };

    await writeStoreDocument(
      { path: relPath, gradeId: args.gradeId, kind: "curriculum", content: next, updatedBy: args.actor.userId },
      "curriculum"
    );
    await recordAudit({
      actor: args.actor,
      action: "curriculum.lesson-sync",
      entityType: "CurriculumDocument",
      entityId: relPath,
      summary: `Lesson ${args.lessonId} ${change} in the ${args.gradeId} curriculum`,
      before: current,
      after: next,
      request: args.request,
    });
    return { change };
  } catch (err) {
    console.error("[lesson-curriculum] could not update", relPath, "for", args.lessonId, err);
    return {
      change: "unchanged",
      error: err instanceof Error ? err.message : "The curriculum could not be updated.",
    };
  }
}

/** One sentence for the editor about what students now see. */
export function describeCurriculumUpdate(update: CurriculumUpdate): string {
  if (update.error) return `Students' course list was not updated: ${update.error}`;
  switch (update.change) {
    case "created":
      return "It is now in the students' course list.";
    case "updated":
      return "Students' course list updated.";
    case "removed":
      return "It was removed from the students' course list.";
    default:
      return "";
  }
}
