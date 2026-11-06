/**
 * GET /api/student/lesson-resources?lessonId=<id>&grade=<gradeId>
 *
 * The Architecture URL, videos, EduNotes availability and lesson test for one
 * lesson in one grade, resolved from the Editor's lesson data and the grade
 * curriculum by src/lib/student/lesson-resources.ts, plus the student's own
 * results on the lesson test. Used by /student/lesson/[id].
 */
import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/student/require-student-session";
import { requireMembership } from "@/lib/billing/guards";
import { db } from "@/lib/db";
import { UnsafePathError } from "@/lib/content/curriculum-store";
import {
  resolveLessonResources,
  type StudentLessonResources,
} from "@/lib/student/lesson-resources";
import type { LessonTestSummary, StudentLessonTest } from "@intellia360/shared/types/api/lesson-resources";

/** The test with the student's attempts. A failed read still shows the test, without history. */
async function withResults(userId: string, test: LessonTestSummary): Promise<StudentLessonTest> {
  let scores: number[] = [];
  try {
    const attempts = await db.quizAttempt.findMany({
      where: { userId, quizId: test.quizId },
      select: { scorePercent: true },
      orderBy: { submittedAt: "desc" },
    });
    scores = attempts.map((a) => a.scorePercent);
  } catch (err) {
    console.error("[lesson-resources] could not read lesson test attempts", err);
  }
  return {
    available: true,
    ...test,
    attempts: scores.length,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    lastScore: scores[0] ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { session, errorResponse } = await requireStudentSession();
  if (errorResponse) return errorResponse;
  const needsPlan = await requireMembership(session);
  if (needsPlan) return needsPlan;

  const lessonId = request.nextUrl.searchParams.get("lessonId")?.trim();
  const grade = request.nextUrl.searchParams.get("grade")?.trim();

  if (!lessonId || !grade) {
    return NextResponse.json(
      { success: false, message: "lessonId and grade parameters are required" },
      { status: 400 }
    );
  }

  try {
    const { eduNotes, test, ...resources } = await resolveLessonResources(
      lessonId,
      grade,
      request.nextUrl.origin
    );

    const data: StudentLessonResources = {
      ...resources,
      eduNotes: { available: eduNotes !== null },
      test: test ? await withResults(session.userId, test) : { available: false },
    };

    return NextResponse.json({ success: true, message: "OK", data }, { status: 200 });
  } catch (error) {
    if (error instanceof UnsafePathError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    console.error("Error resolving lesson resources:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error while loading the lesson" },
      { status: 500 }
    );
  }
}
