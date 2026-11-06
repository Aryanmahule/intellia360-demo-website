/**
 * Every lesson in a grade, as the Lesson editor sees them.
 *
 * A grade's lessons live in two places. curriculum.json holds a topic for every
 * lesson students can reach; lesson files only exist for lessons someone has
 * saved in the editor. The editor used to list the files alone, so the lessons
 * that shipped with the curriculum had no Edit button, and the only way to
 * change one was to add it again under the same name, which left students with
 * the lesson twice.
 *
 * This joins the two: each topic is one lesson, with its file when it has one,
 * and a file no topic claims is a lesson of its own. A lesson without a file
 * opens from its topic (lessonFromTopic) and gets a file on its first save.
 *
 * Titles identify a lesson inside a grade, so a title already in use is refused
 * (findLessonClash, addedDuplicates). Duplicates from before that rule are
 * merged on request (mergeDuplicateLessons): the extra lesson goes, and its
 * links move to the lesson that stays.
 *
 * Topics in the grade's own curriculum can legitimately share a title — Grade 3
 * has a "Word problems" in each of three chapters. Those are different lessons,
 * so only a lesson added afterwards can count as a duplicate.
 */
import {
  deleteLesson,
  listLessons,
  readLesson,
  saveLesson,
  type LessonContent,
  type LessonRef,
} from "@/lib/content/lesson-store";
import {
  copyModuleLink,
  findLessonTopic,
  isObject,
  LESSON_EDITOR_SOURCE,
  moduleLink,
  MODULE_CARDS,
  normalize,
  recount,
  text,
  topicSpots,
  type TopicSpot,
} from "@/lib/content/lesson-curriculum";
import { readStoreDocument, storePath, writeStoreDocument } from "@/lib/content/curriculum-store";
import { recordAudit } from "@/lib/audit";
import { isEmbeddableUrl, isValidModuleUrl } from "@intellia360/shared/content/lesson-modules";
import { LESSON_VIDEOS_REGISTRY, isPlaceholderVideoId, parseYouTubeId } from "@/lib/student/lesson-videos";
import { EDUNOTES_REGISTRY } from "@/lib/student/edunotes";

type Json = Record<string, unknown>;
type LessonFile = { lessonId: string; content: LessonContent | null };

export interface CatalogLesson {
  /** What the editor opens: the lesson file's name, or the topic's lesson id. */
  id: string;
  title: string;
  grade: string;
  chapterId: string;
  estimatedMinutes: number;
  locked: boolean;
  completed: boolean;
  /** False until the lesson is first saved in the editor; there is no file to delete. */
  hasFile: boolean;
  /** The lesson this one repeats, when merging them is safe. */
  duplicateOf: string | null;
  /** Shares a title with lessons it can't be matched to, so a person has to decide. */
  sharesTitle: boolean;
}

interface Entry {
  spot: TopicSpot | null;
  file: LessonFile | null;
  id: string;
  title: string;
}

/** Titles a student would read as the same lesson: "Counting to 10,000", "counting to 10000". */
export function lessonTitleKey(title: unknown): string {
  return typeof title === "string" ? title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") : "";
}

function topicIds(topic: Json): string[] {
  return [text(topic.lessonId), text(topic.id)].filter(Boolean);
}

function isAdded(entry: Entry): boolean {
  return !entry.spot || entry.spot.topic.source === LESSON_EDITOR_SOURCE;
}

/**
 * Pairs topics with lesson files. Ids go first, so a title can never take a
 * file that belongs to another topic; titles use the comparison the lesson
 * screen and findLessonTopic use, so all three agree on which file is whose.
 */
function joinLessons(curriculum: unknown, files: LessonFile[]): Entry[] {
  const unclaimed = new Map(files.map((file) => [file.lessonId, file]));
  const take = (matches: (file: LessonFile) => boolean): LessonFile | null => {
    for (const file of unclaimed.values()) {
      if (!matches(file)) continue;
      unclaimed.delete(file.lessonId);
      return file;
    }
    return null;
  };

  const spots = isObject(curriculum) ? topicSpots(curriculum) : [];
  const paired = new Map<TopicSpot, LessonFile>();

  for (const spot of spots) {
    const ids = topicIds(spot.topic);
    const file = take((f) => ids.includes(f.lessonId) || ids.includes(text(f.content?.id)));
    if (file) paired.set(spot, file);
  }
  for (const spot of spots) {
    if (paired.has(spot)) continue;
    const title = normalize(spot.topic.title);
    const file = title ? take((f) => normalize(f.content?.title) === title) : null;
    if (file) paired.set(spot, file);
  }

  const entries: Entry[] = spots.map((spot) => {
    const file = paired.get(spot) ?? null;
    const id = file?.lessonId ?? topicIds(spot.topic)[0] ?? "";
    return { spot, file, id, title: text(file?.content?.title) || text(spot.topic.title) || id };
  });
  for (const file of unclaimed.values()) {
    entries.push({ spot: null, file, id: file.lessonId, title: text(file.content?.title) || `${file.lessonId}.json` });
  }
  return entries.filter((entry) => entry.id);
}

/**
 * The lesson an added duplicate repeats. Original lessons outrank added ones;
 * several originals with this title means nothing says which one was meant,
 * unless the duplicate sits in one's chapter.
 */
function keeperOf(extra: Entry, originals: Entry[], added: Entry[]): Entry | null {
  if (originals.length === 1) return originals[0];
  if (originals.length > 1) return originals.find((entry) => entry.spot?.chapter === extra.spot?.chapter) ?? null;
  return added.find((entry) => entry.spot) ?? added[0];
}

interface DuplicateGroup {
  keeper: Entry;
  /** Oldest first: topics are appended, so the last one is the latest attempt. */
  extras: Entry[];
}

function findDuplicates(entries: Entry[]): { groups: DuplicateGroup[]; undecided: Set<Entry> } {
  const byTitle = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = lessonTitleKey(entry.title);
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), entry]);
  }

  const groups = new Map<Entry, Entry[]>();
  const undecided = new Set<Entry>();
  for (const sameTitle of byTitle.values()) {
    const added = sameTitle.filter(isAdded);
    const originals = sameTitle.filter((entry) => !isAdded(entry));
    if (sameTitle.length < 2 || added.length === 0) continue;

    for (const entry of added) {
      const keeper = keeperOf(entry, originals, added);
      if (!keeper) undecided.add(entry);
      else if (keeper !== entry) groups.set(keeper, [...(groups.get(keeper) ?? []), entry]);
    }
  }
  return { groups: [...groups].map(([keeper, extras]) => ({ keeper, extras })), undecided };
}

function readGrade(gradeId: string) {
  return Promise.all([readStoreDocument(storePath(gradeId, "curriculum.json")), listLessons(gradeId)]);
}

async function loadEntries(gradeId: string): Promise<Entry[]> {
  const [curriculum, files] = await readGrade(gradeId);
  return joinLessons(curriculum, files);
}

function minutesOf(topic: Json | undefined): number {
  return Number.parseInt(text(topic?.estimatedTime), 10) || 0;
}

/** Every lesson in a grade, in the order students meet them; lessons with no topic come last. */
export function catalogLessons(curriculum: unknown, files: LessonFile[], gradeId: string): CatalogLesson[] {
  const entries = joinLessons(curriculum, files);
  const { groups, undecided } = findDuplicates(entries);
  const repeats = new Map(groups.flatMap(({ keeper, extras }) => extras.map((extra) => [extra, keeper.id] as const)));

  return entries.map((entry) => {
    const content = entry.file?.content;
    const topic = entry.spot?.topic;
    const minutes = content?.estimatedMinutes;
    return {
      id: entry.id,
      title: entry.title,
      grade: text(content?.grade) || gradeId,
      chapterId: text(content?.chapterId) || text(entry.spot?.chapter?.id),
      estimatedMinutes: typeof minutes === "number" ? minutes : minutesOf(topic),
      locked: typeof content?.locked === "boolean" ? content.locked : topic?.status === "locked",
      completed: content?.completed === true,
      hasFile: entry.file !== null,
      duplicateOf: repeats.get(entry) ?? null,
      sharesTitle: undecided.has(entry),
    };
  });
}

export async function listGradeLessons(gradeId: string): Promise<CatalogLesson[]> {
  const [curriculum, files] = await readGrade(gradeId);
  return catalogLessons(curriculum, files, gradeId);
}

/** Where a student's lesson screen would find this link: an https page it may frame. */
function framed(value: unknown, video = false): string {
  const url = text(value);
  return /^https?:\/\//i.test(url) && isEmbeddableUrl(url, { video }) ? url : "";
}

function curatedVideo(gradeId: string, ids: string[]): boolean {
  return ids.some((id) =>
    (LESSON_VIDEOS_REGISTRY[gradeId]?.[id] ?? []).some((video) => video.videoId && !isPlaceholderVideoId(video.videoId))
  );
}

function ownVideo(card: unknown): string {
  const youtubeId = parseYouTubeId(text(card));
  if (youtubeId) return isPlaceholderVideoId(youtubeId) ? "" : text(card);
  return framed(card, true);
}

function ownNotes(card: unknown): string {
  const url = text(card);
  if (!url || !isValidModuleUrl(url)) return "";
  return /^\/student(?:[/?#]|$)/i.test(url) ? "" : url;
}

const link = (url: string) => ({ enabled: Boolean(url), url });

/**
 * A topic's links as lesson modules, showing what students get today. The
 * placeholder paths are how lesson files say "use the curated source": a module
 * switched off here would hide a registry video or EduNotes PDF from students
 * the first time anyone saved the lesson.
 */
function modulesFromTopic(topic: Json, gradeId: string) {
  const cards = isObject(topic.actionCards) ? topic.actionCards : {};
  const ids = topicIds(topic);
  const curatedNotes = ids.some((id) => EDUNOTES_REGISTRY[gradeId]?.[id]?.fileId);
  const practice = text(cards.practice);

  return {
    architectureModule: link(framed(cards.architecture) || framed(topic.vercelLink)),
    videoLesson: curatedVideo(gradeId, ids)
      ? link("/student/lesson/video")
      : link(ownVideo(cards.video)),
    practiceModule: link(isValidModuleUrl(practice) ? practice : ""),
    eduNotes: link(ownNotes(cards.edunotes) || (curatedNotes ? "/student/lesson/edunotes" : "")),
  };
}

/** A lesson that only exists as a curriculum topic, in the shape the editor saves. */
export function lessonFromTopic(spot: TopicSpot, ref: LessonRef): LessonContent {
  const { topic, chapter } = spot;
  const hero = isObject(topic.heroSlide) ? topic.heroSlide : {};
  return {
    id: ref.lessonId,
    title: text(topic.title),
    description: text(hero.subtitle),
    chapterId: text(chapter?.id),
    chapterTitle: text(chapter?.title),
    grade: ref.gradeId,
    estimatedMinutes: minutesOf(topic),
    completed: false,
    locked: topic.status === "locked",
    heroVisualizer: text(hero.visualizerKey),
    heroVisualizerData: isObject(hero.visualizerData) ? hero.visualizerData : {},
    modules: modulesFromTopic(topic, ref.gradeId),
    previousLesson: null,
    nextLesson: null,
  };
}

/** The lesson to edit: its file, or its curriculum topic when it has never been saved. */
export async function readEditableLesson(ref: LessonRef): Promise<LessonContent | null> {
  const lesson = await readLesson(ref);
  if (lesson) return lesson;

  const curriculum = await readStoreDocument(storePath(ref.gradeId, "curriculum.json"));
  const spot = isObject(curriculum) ? findLessonTopic(curriculum, ref.lessonId) : null;
  return spot ? lessonFromTopic(spot, ref) : null;
}

function isLesson(entry: Entry, lessonId: string): boolean {
  return entry.id === lessonId || (entry.spot ? topicIds(entry.spot.topic).includes(lessonId) : false);
}

export interface LessonClash {
  /** The lesson to open instead. */
  id: string;
  title: string;
}

/**
 * The lesson standing in the way of `title`, or null. Keeping a title a lesson
 * already has is never a clash, so older same-titled lessons can still be saved.
 */
export async function findLessonClash(
  ref: LessonRef,
  title: unknown,
  previous: LessonContent | null
): Promise<LessonClash | null> {
  const key = lessonTitleKey(title);
  if (!key || (previous && lessonTitleKey(previous.title) === key)) return null;

  const others = (await loadEntries(ref.gradeId)).filter((entry) => !isLesson(entry, ref.lessonId));
  const clash = others.find((entry) => lessonTitleKey(entry.title) === key);
  return clash ? { id: clash.id, title: clash.title } : null;
}

/** A new lesson must not reuse the id or the title of one the grade already has. */
export async function findNewLessonClash(ref: LessonRef, title: unknown): Promise<LessonClash | null> {
  const entries = await loadEntries(ref.gradeId);
  const key = lessonTitleKey(title);
  const clash = entries.find(
    (entry) => isLesson(entry, ref.lessonId) || (key !== "" && lessonTitleKey(entry.title) === key)
  );
  return clash ? { id: clash.id, title: clash.title } : null;
}

export function describeClash(clash: LessonClash): string {
  return `"${clash.title}" is already a lesson in this grade. Change that lesson instead, or pick a different title.`;
}

/**
 * Titles and ids `after` repeats that `before` did not, for the raw curriculum
 * editor. Repeats already in `before` pass, or nobody could save that grade.
 */
export function addedDuplicates(before: unknown, after: unknown): string[] {
  const tally = (doc: unknown) => {
    const seen = new Map<string, { count: number; label: string }>();
    for (const { topic } of isObject(doc) ? topicSpots(doc) : []) {
      const label = text(topic.title) || text(topic.id);
      for (const key of [`title:${lessonTitleKey(topic.title)}`, `id:${text(topic.id)}`]) {
        if (key.endsWith(":")) continue;
        seen.set(key, { count: (seen.get(key)?.count ?? 0) + 1, label });
      }
    }
    return seen;
  };

  const earlier = tally(before);
  const repeated = [...tally(after)].filter(
    ([key, { count }]) => count > 1 && count > (earlier.get(key)?.count ?? 0)
  );
  return [...new Set(repeated.map(([, { label }]) => label))];
}

export interface DuplicateMerge {
  curriculum: Json;
  /** Lesson files to write, before anything is removed. */
  saves: { lessonId: string; content: LessonContent }[];
  /** Lesson files that are no longer anyone's. */
  removes: string[];
  merged: { kept: string; removed: string[] }[];
}

/**
 * The curriculum and lesson files with each duplicate folded into the lesson it
 * repeats, or null when there are none. Pure: `curriculum` is left untouched.
 *
 * The lesson keeps its place, id, title, chapter and lock. For each module the
 * newest working link wins, since re-adding a lesson was how links got changed,
 * and a module no duplicate had a link for keeps what the lesson already showed.
 * A lesson with a file keeps it: files shipped in git come back on every
 * deploy, so deleting one instead would undo the merge.
 */
export function planDuplicateMerge(curriculum: unknown, files: LessonFile[], gradeId: string): DuplicateMerge | null {
  if (!isObject(curriculum)) return null;
  const doc = structuredClone(curriculum);
  const { groups } = findDuplicates(joinLessons(doc, files));
  if (groups.length === 0) return null;

  const plan: DuplicateMerge = { curriculum: doc, saves: [], removes: [], merged: [] };

  for (const { keeper, extras } of groups) {
    const newestFirst = [...extras].reverse().concat(keeper);
    const withContent = newestFirst.filter((entry) => entry.file?.content);
    const survivor = keeper.file?.content ? keeper : withContent[0];
    const topic = keeper.spot?.topic;

    if (survivor?.file?.content) {
      const modules: Json = { ...(isObject(survivor.file.content.modules) ? survivor.file.content.modules : {}) };
      // A duplicate's unticked modules must not switch off what its original had.
      const original: Json = survivor !== keeper && topic ? modulesFromTopic(topic, gradeId) : {};
      for (const key of Object.keys(MODULE_CARDS)) {
        const url = withContent.map((entry) => moduleLink(entry.file!.content!, key)).find(Boolean);
        if (url) modules[key] = { enabled: true, url };
        else if (isObject(original[key]) && original[key].enabled) modules[key] = original[key];
      }

      const content: LessonContent = { ...survivor.file.content, id: survivor.file.lessonId, modules };
      if (topic) {
        content.title = text(topic.title) || content.title;
        content.chapterId = text(keeper.spot?.chapter?.id) || content.chapterId;
        content.chapterTitle = text(keeper.spot?.chapter?.title) || content.chapterTitle;
        content.locked = topic.status === "locked";
        for (const key of Object.keys(MODULE_CARDS)) copyModuleLink(topic, content, key);
        if (!topicIds(topic).includes(survivor.file.lessonId)) topic.lessonId = survivor.file.lessonId;
      }
      plan.saves.push({ lessonId: survivor.file.lessonId, content });
    }

    for (const extra of extras) {
      if (extra.file && extra.file !== survivor?.file) plan.removes.push(extra.file.lessonId);
      if (extra.spot) {
        extra.spot.list.splice(extra.spot.list.indexOf(extra.spot.topic), 1);
        recount(extra.spot.chapter);
      }
    }
    plan.merged.push({ kept: keeper.id, removed: extras.map((extra) => extra.id) });
  }
  return plan;
}

/**
 * Applies planDuplicateMerge. New content is stored before anything is removed,
 * so a failure part-way leaves every lesson intact and the merge can be re-run;
 * previous versions stay recoverable as revisions and tombstones.
 */
export async function mergeDuplicateLessons(
  gradeId: string,
  actor: { userId: string; email: string; role: string },
  request?: Request
): Promise<DuplicateMerge["merged"]> {
  const relPath = storePath(gradeId, "curriculum.json");
  const [current, files] = await readGrade(gradeId);
  const plan = planDuplicateMerge(current, files, gradeId);
  if (!plan) return [];

  for (const { lessonId, content } of plan.saves) await saveLesson({ gradeId, lessonId }, content, actor.userId);
  await writeStoreDocument(
    { path: relPath, gradeId, kind: "curriculum", content: plan.curriculum, updatedBy: actor.userId },
    "curriculum"
  );
  for (const lessonId of plan.removes) await deleteLesson({ gradeId, lessonId }, actor.userId);

  await recordAudit({
    actor,
    action: "curriculum.merge-duplicates",
    entityType: "CurriculumDocument",
    entityId: relPath,
    summary: `Merged ${plan.merged.reduce((sum, m) => sum + m.removed.length, 0)} duplicate lessons in ${gradeId}`,
    before: current,
    after: plan.curriculum,
    request,
  });
  return plan.merged;
}
