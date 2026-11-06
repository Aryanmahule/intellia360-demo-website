/**
 * The grade curriculum as an ordered graph the recommender can reason about.
 *
 * Built from the same curriculum.json every student screen reads (through the
 * curriculum store, so a read-only host sees the editor's database copy), plus
 * the grade's lesson files for id aliases.
 *
 * Prerequisites:
 *  • A topic may declare `"prerequisites": ["topic-id", …]`. Unknown ids are
 *    dropped (and reported), so a typo cannot make a lesson unreachable.
 *  • Otherwise each topic depends on the topic before it in the same chapter.
 *    Chapters are independent units: the first topic of a chapter has none.
 *    No curriculum ships explicit prerequisites today, so this sequence rule is
 *    what is enforced.
 *
 * Lesson ids: completion is recorded under whatever id the screen used — the
 * curriculum topic id, or a lesson file's shorter id. Lesson files are matched
 * to topics by id, then by title (the rule lesson-resources.ts uses), and both
 * ids count as the same lesson.
 */
import { assertGradeId, readStoreDocument, storePath } from "@/lib/content/curriculum-store";
import { listLessons } from "@/lib/content/lesson-store";
import { deriveSkills } from "@/lib/adaptive/skill-map";

export interface GraphTopic {
  id: string;
  title: string;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterNumber: number | null;
  /** Position in the whole curriculum, 0-based. */
  order: number;
  /** Curriculum label ("Beginner", "Intermediate", "Advanced"), as authored. */
  difficulty: string | null;
  prerequisites: string[];
  prerequisiteSource: "explicit" | "sequence" | "none";
  skills: string[];
  skillSource: "explicit" | "derived" | "none";
  /** Other ids this lesson's completion may be recorded under. */
  aliases: string[];
  /** Chapter test series — assessments, not teaching lessons. */
  isAssessment: boolean;
  aiContext: string | null;
}

export interface CurriculumGraph {
  grade: string;
  topics: GraphTopic[];
  /** Explicit prerequisite ids that matched no topic — surfaced for editors, never enforced. */
  unknownPrerequisites: { topicId: string; prerequisite: string }[];
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

function normaliseTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

export interface LessonFileRef {
  lessonId: string;
  content: Record<string, unknown> | null;
}

/** Pure: curriculum JSON + lesson files → graph. Malformed entries are skipped, never thrown. */
export function buildCurriculumGraph(
  grade: string,
  curriculum: unknown,
  lessonFiles: LessonFileRef[],
  knownSkills: Iterable<string>
): CurriculumGraph {
  const doc = asObject(curriculum);
  const skills = [...knownSkills];
  const empty: CurriculumGraph = { grade, topics: [], unknownPrerequisites: [] };
  if (!doc) return empty;

  type RawTopic = { raw: Json; chapter: Json | null; chapterIndex: number };
  const rawTopics: RawTopic[] = [];

  const chapters = (Array.isArray(doc.chapters) ? doc.chapters : [])
    .map((c, index) => ({ chapter: asObject(c), index }))
    .filter((c): c is { chapter: Json; index: number } => c.chapter !== null)
    .sort((a, b) => {
      const na = typeof a.chapter.chapterNumber === "number" ? a.chapter.chapterNumber : a.index + 1;
      const nb = typeof b.chapter.chapterNumber === "number" ? b.chapter.chapterNumber : b.index + 1;
      return na - nb || a.index - b.index;
    });

  chapters.forEach(({ chapter }, chapterIndex) => {
    for (const t of Array.isArray(chapter.topics) ? chapter.topics : []) {
      const raw = asObject(t);
      if (raw && asString(raw.id)) rawTopics.push({ raw, chapter, chapterIndex });
    }
  });
  for (const t of Array.isArray(doc.standaloneTopics) ? doc.standaloneTopics : []) {
    const raw = asObject(t);
    if (raw && asString(raw.id)) rawTopics.push({ raw, chapter: null, chapterIndex: -1 });
  }

  // First occurrence wins if an id is duplicated.
  const seen = new Set<string>();
  const unique = rawTopics.filter(({ raw }) => {
    const id = asString(raw.id)!;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const lessons = lessonFiles.filter((l) => l.content !== null);
  const unknownPrerequisites: CurriculumGraph["unknownPrerequisites"] = [];

  const topics: GraphTopic[] = unique.map(({ raw, chapter, chapterIndex }, order) => {
    const id = asString(raw.id)!;
    const title = asString(raw.title) ?? id;

    // Aliases: an explicit lessonId, then lesson files matched by id or title.
    const aliases = new Set<string>();
    const explicitLessonId = asString(raw.lessonId);
    if (explicitLessonId && explicitLessonId !== id) aliases.add(explicitLessonId);
    const titleKey = normaliseTitle(title);
    for (const lesson of lessons) {
      const fileId = asString(lesson.content?.id) ?? lesson.lessonId;
      const matches =
        lesson.lessonId === id ||
        fileId === id ||
        (titleKey !== "" && normaliseTitle(lesson.content?.title) === titleKey);
      if (matches) {
        if (lesson.lessonId !== id) aliases.add(lesson.lessonId);
        if (fileId !== id) aliases.add(fileId);
      }
    }

    // Prerequisites: explicit list, else the previous topic in the same chapter.
    let prerequisites: string[] = [];
    let prerequisiteSource: GraphTopic["prerequisiteSource"] = "none";
    const explicit = asStringArray(raw.prerequisites);
    if (explicit) {
      prerequisiteSource = "explicit";
      for (const p of explicit) {
        if (p === id) continue;
        if (seen.has(p)) prerequisites.push(p);
        else unknownPrerequisites.push({ topicId: id, prerequisite: p });
      }
    } else if (chapter) {
      const siblings = unique.filter((u) => u.chapter === chapter);
      const position = siblings.findIndex((u) => asString(u.raw.id) === id);
      if (position > 0) {
        prerequisites = [asString(siblings[position - 1].raw.id)!];
        prerequisiteSource = "sequence";
      }
    }

    // Skills: explicit declaration, else derived from title + id keywords.
    const explicitSkills = asStringArray(raw.skills);
    let topicSkills: string[];
    let skillSource: GraphTopic["skillSource"];
    if (explicitSkills) {
      topicSkills = [...new Set(explicitSkills)];
      skillSource = topicSkills.length ? "explicit" : "none";
    } else {
      topicSkills = deriveSkills(`${title} ${id.replace(/-/g, " ")}`, skills);
      skillSource = topicSkills.length ? "derived" : "none";
    }

    return {
      id,
      title,
      chapterId: chapter ? asString(chapter.id) : null,
      chapterTitle: chapter ? asString(chapter.title) : null,
      chapterNumber:
        chapter && typeof chapter.chapterNumber === "number" ? chapter.chapterNumber : chapter ? chapterIndex + 1 : null,
      order,
      difficulty: asString(raw.difficulty),
      prerequisites,
      prerequisiteSource,
      skills: topicSkills,
      skillSource,
      aliases: [...aliases],
      isAssessment: /test[\s-]?series/i.test(`${id} ${title}`),
      aiContext: asString(raw.aiContext),
    };
  });

  return { grade, topics, unknownPrerequisites };
}

/** Every id a topic's completion may be stored under. */
export function topicIds(topic: GraphTopic): string[] {
  return [topic.id, ...topic.aliases];
}

export function isTopicCompleted(topic: GraphTopic, completed: ReadonlySet<string>): boolean {
  return topicIds(topic).some((id) => completed.has(id));
}

/** Resolves a curriculum topic id or a lesson-file alias to its topic. */
export function findTopic(graph: CurriculumGraph, id: string): GraphTopic | null {
  return graph.topics.find((t) => t.id === id || t.aliases.includes(id)) ?? null;
}

/** A topic is eligible once every prerequisite has been completed. */
export function isTopicEligible(
  graph: CurriculumGraph,
  topic: GraphTopic,
  completed: ReadonlySet<string>
): boolean {
  return topic.prerequisites.every((p) => {
    const prerequisite = graph.topics.find((t) => t.id === p);
    // An unresolvable prerequisite was already dropped at build time.
    return !prerequisite || isTopicCompleted(prerequisite, completed);
  });
}

/** Topics linked to a skill, in curriculum order. */
export function topicsForSkill(graph: CurriculumGraph, skill: string): GraphTopic[] {
  return graph.topics.filter((t) => t.skills.includes(skill));
}

/**
 * Loads a grade's graph. Returns an empty graph (never throws) when the grade
 * has no curriculum, so callers degrade to practice-only recommendations.
 */
export async function loadCurriculumGraph(grade: string, knownSkills: Iterable<string>): Promise<CurriculumGraph> {
  try {
    assertGradeId(grade);
  } catch {
    return buildCurriculumGraph(grade, null, [], knownSkills);
  }

  let curriculum: unknown = null;
  try {
    curriculum = await readStoreDocument(storePath(grade, "curriculum.json"));
  } catch (err) {
    console.error("[adaptive] could not read curriculum for", grade, err);
  }

  let lessons: LessonFileRef[] = [];
  try {
    lessons = await listLessons(grade);
  } catch (err) {
    console.error("[adaptive] could not list lessons for", grade, err);
  }

  return buildCurriculumGraph(grade, curriculum, lessons, knownSkills);
}
