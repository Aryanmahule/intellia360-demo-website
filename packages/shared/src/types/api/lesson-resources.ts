/**
 * Lesson resource shapes: GET /api/student/lesson-resources and the EduNotes source it resolves.
 *
 * Shared by the backend route (lib/student/lesson-resources.ts) and the frontend that consumes it.
 */

export interface LessonVideo {
  /** YouTube video ID, e.g. "abc123XYZ". */
  videoId: string;
  title: string;
  description?: string;
  durationLabel?: string;
}

/** Where a lesson's EduNotes PDF is fetched from. */
export interface EduNotesSource {
  fileName: string;
  /** Google Drive file id, downloaded through the EduNotes content route. */
  fileId: string | null;
  /** A direct PDF URL (absolute, or a same-site path) when there is no Drive id. */
  url: string | null;
}

export interface LessonVideoResources {
  /** YouTube videos, played by the existing lesson video player. */
  videos: LessonVideo[];
  /** A non-YouTube video URL from the lesson data, embedded as-is. */
  embedUrl: string | null;
}

/** A lesson's test as planned from its topic — no student data. */
export interface LessonTestSummary {
  /** Served by GET /api/student/quiz/<quizId>; always "test-<lessonId>". */
  quizId: string;
  questionCount: number;
  durationSeconds: number;
  /** What the questions cover: topic names, or the chapter's lessons for a chapter test. */
  covers: string[];
  /** A chapter's "Test Series" lesson, drawing on every lesson in the chapter. */
  chapterTest: boolean;
}

/** The lesson test on the student lesson screen, with the student's own results. */
export type StudentLessonTest =
  | ({ available: true } & LessonTestSummary & {
      attempts: number;
      /** 0–100, null before the first attempt. */
      bestScore: number | null;
      lastScore: number | null;
    })
  | { available: false };

export interface ResolvedLessonResources {
  lessonId: string;
  grade: string;
  title: string | null;
  /** False when the grade has neither a curriculum topic nor a lesson file for this id. */
  found: boolean;
  architectureUrl: string | null;
  video: LessonVideoResources;
  eduNotes: EduNotesSource | null;
  /** Null when no test fits the lesson, or its lesson file sets `"test": { "enabled": false }`. */
  test: LessonTestSummary | null;
}

/** What /api/student/lesson-resources returns to the lesson screen. */
export type StudentLessonResources = Omit<ResolvedLessonResources, "eduNotes" | "test"> & {
  eduNotes: { available: boolean };
  test: StudentLessonTest;
};
