"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calculator,
  Map,
  Orbit,
  Puzzle,
  Rocket,
  Search,
  Shapes,
  Star,
  Telescope,
} from "lucide-react";
import { useStudentContext } from "@/context/StudentContext";
import "./courses.css";
interface CourseTopic {
  id: string;
  title: string;
  status?: string;
  estimatedTime?: string;
}

interface CourseChapter {
  id: string;
  chapterNumber?: number | string;
  title: string;
  topics?: CourseTopic[];
  topicsCount?: number;
}

interface CourseCurriculum {
  chapters: CourseChapter[];
}

interface CourseData {
  id: string;
  title: string;
  chapterNumber: number | string;
  topics: CourseTopic[];
  completed: number;
  total: number;
  progress: number;
  firstTopicId?: string;
  status: "not-started" | "in-progress" | "completed";
}

type CourseFilter = "all" | CourseData["status"];

const courseFilters: { value: CourseFilter; label: string }[] = [
  { value: "all", label: "All chapters" },
  { value: "in-progress", label: "In progress" },
  { value: "not-started", label: "Not started" },
  { value: "completed", label: "Completed" },
];

const courseIcons = [Calculator, Rocket, Puzzle, Shapes, Star, Telescope];


function BookIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 4.5C5 3.67 5.67 3 6.5 3H19V18H6.5C5.67 18 5 18.67 5 19.5C5 20.33 5.67 21 6.5 21H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19.5V4.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 4h8v5a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 13v4M8.5 20h7M10 17h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m13 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

export default function StudentCoursesPage() {
  const {
    curriculum,
    currentGrade,
    completedLessons,
    xpPoints,
    learningGems,
    streakDays,
    activeLessonData,
    studentName,
    unlockedBadges,
  } = useStudentContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [courseFilter, setCourseFilter] = useState<CourseFilter>("all");

  const typedCurriculum =
    curriculum as CourseCurriculum | null;

  /*
   * Convert curriculum into course/chapter cards.
   */
  const courses = useMemo<CourseData[]>(() => {
    if (!typedCurriculum?.chapters) {
      return [];
    }

    return typedCurriculum.chapters.map(
      (chapter) => {
        const topics = chapter.topics ?? [];

        const completed = topics.filter(
          (topic) =>
            completedLessons.includes(topic.id)
        ).length;

        const total = topics.length;

        return {
          id: chapter.id,
          title: chapter.title,
          chapterNumber:
            chapter.chapterNumber ?? 0,
          topics,
          completed,
          total,
          progress:
            total > 0
              ? Math.round(
                (completed / total) * 100
              )
              : 0,
          firstTopicId: topics[0]?.id,
          status:
            total > 0 && completed === total
              ? "completed"
              : completed > 0
                ? "in-progress"
                : "not-started",
        };
      }
    );
  }, [
    typedCurriculum,
    completedLessons,
  ]);

  const totalLessons = courses.reduce(
    (sum, course) => sum + course.total,
    0
  );

  const completedTotal = courses.reduce(
    (sum, course) =>
      sum + course.completed,
    0
  );

  const overallProgress =
    totalLessons > 0
      ? Math.round(
        (completedTotal / totalLessons) *
        100
      )
      : 0;

  const continueTopic =
    activeLessonData?.id ||
    courses.find(
      (course) => course.firstTopicId
    )?.firstTopicId;

  const filteredCourses = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return courses.filter((course) => {
      const matchesFilter =
        courseFilter === "all" || course.status === courseFilter;
      const matchesSearch =
        !query ||
        course.title.toLocaleLowerCase().includes(query) ||
        course.topics.some((topic) =>
          topic.title.toLocaleLowerCase().includes(query)
        );
      return matchesFilter && matchesSearch;
    });
  }, [courses, courseFilter, searchTerm]);

  const firstName = studentName?.trim().split(/\s+/)[0];
  const welcomeName =
    firstName && firstName !== "Student" ? firstName : "Learner";

  if (!typedCurriculum) {
    return (
      <main className="courses-page courses-page-gamified">
        <div className="courses-loading">
          <div className="loading-orb" />
          <h2>Preparing your learning world...</h2>
          <p>
            Loading your courses and progress.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="courses-page">
      <div className="courses-page-inner">

        {/* =================================================
            HEADER
        ================================================== */}

        <header className="courses-header">
          <div>
            <span className="courses-eyebrow">
              YOUR LEARNING ADVENTURE
            </span>

            <h1 className="courses-page-title">
              Ready for your next quest, {welcomeName}?
            </h1>

            <p>
              Every lesson is a chance to discover something amazing.
            </p>
          </div>

          <div className="courses-hero-art" aria-hidden="true">
            <span className="hero-planet"><Orbit size={27} strokeWidth={1.7} /></span>
            <span className="hero-rocket"><Rocket size={34} strokeWidth={1.7} /></span>
            <span className="hero-sparkle">✦</span>
            <span className="hero-star">✧</span>
          </div>

          <div className="courses-header-actions">
            <Link
              href="/student/leaderboard"
              className="courses-header-stat"
            >
              <TrophyIcon />

              <span>
                <strong>
                  {xpPoints ?? 0}
                </strong>
                <small>XP</small>
              </span>
            </Link>

            <div className="courses-header-stat">
              <TargetIcon />

              <span>
                <strong>
                  {streakDays ?? 0}
                </strong>
                <small>Day Streak</small>
              </span>
            </div>
          </div>
        </header>

        {/* =================================================
            JOURNEY OVERVIEW
        ================================================== */}

        <section className="course-overview">
          <div className="overview-main">

            <div className="overview-icon">
              <BookIcon />
            </div>

            <div className="overview-content">
              <span className="overview-label">
                {currentGrade
                  ? currentGrade.toUpperCase()
                  : "STUDENT"}{" "}
                CURRICULUM
              </span>

              <h2>
                Your learning map
              </h2>

              <p>
                {completedTotal} of {totalLessons} lessons completed
              </p>

              <div className="overall-progress">
                <div className="overall-progress-track">
                  <div
                    className="overall-progress-fill"
                    style={{
                      width: `${overallProgress}%`,
                    }}
                  />
                </div>

                <strong>
                  {overallProgress}%
                </strong>
              </div>
            </div>
          </div>

          <div className="overview-stats">
            <div className="overview-stat">
              <strong>
                {courses.length}
              </strong>
              <span>Chapters to explore</span>
            </div>

            <div className="overview-stat">
              <strong>
                {streakDays ?? 0}
              </strong>
              <span>Day streak</span>
            </div>

            <div className="overview-stat">
              <strong>
                {learningGems ?? 0}
              </strong>
              <span>Gems collected</span>
            </div>

            <div className="overview-stat">
              <strong>
                {unlockedBadges.length}
              </strong>
              <span>Badges earned</span>
            </div>
          </div>
        </section>

        {/* =================================================
            CONTINUE LEARNING
        ================================================== */}

        {continueTopic && (
          <section className="continue-card">
            <div className="continue-left">
              <div className="continue-play">
                <PlayIcon />
              </div>

              <div>
                <span className="continue-label">
                  YOUR NEXT ADVENTURE
                </span>

                <h3>
                  {activeLessonData?.title ||
                    "Start your first lesson"}
                </h3>

                <p>
                  Pick up where you left off and keep your streak growing.
                </p>
              </div>
            </div>

            <Link
              href={`/student/lesson/${encodeURIComponent(
                continueTopic
              )}`}
              className="continue-button"
            >
              Continue learning
              <ArrowIcon />
            </Link>
          </section>
        )}

        {/* =================================================
            COURSE GRID
        ================================================== */}

        <section className="courses-section">

          <div className="section-heading">
            <div>
              <span className="section-eyebrow">
                YOUR CURRICULUM
              </span>

              <h2 className="courses-section-title">Choose your next quest</h2>
            </div>

            <span className="course-count">
              {filteredCourses.length} of {courses.length} chapters
            </span>
          </div>

          <div className="course-discovery-controls">
            <label className="course-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search chapters or lessons"
                aria-label="Search chapters and lessons"
              />
            </label>
            <div className="course-filters" role="group" aria-label="Filter chapters by progress">
              {courseFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={courseFilter === filter.value ? "active" : ""}
                  aria-pressed={courseFilter === filter.value}
                  onClick={() => setCourseFilter(filter.value)}
                >
                  {filter.label}
                  {filter.value === "all" && (
                    <span>{courses.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="course-grid">
            {filteredCourses.map(
              (course, index) => {

                const actionTopic =
                  course.topics.find(
                    (topic) =>
                      !completedLessons.includes(
                        topic.id
                      ) &&
                      topic.status !==
                      "locked"
                  ) ||
                  course.topics.find((topic) => topic.status !== "locked");

                const isCompleted =
                  course.total > 0 &&
                  course.completed ===
                  course.total;
                const statusLabel = isCompleted
                  ? "Mastered"
                  : course.completed > 0
                      ? "In progress"
                      : "Ready to explore";
                const CourseIcon = courseIcons[index % courseIcons.length];

                return (
                  <article
                      key={course.id}
                      className={`course-card course-card-theme-${index % courseIcons.length} ${isCompleted ? "course-complete" : ""}`}
                  >
                      {/* 3D CARD TOP */}
                      <div className="course-card-visual">

                        <div className="course-orbit orbit-one" aria-hidden="true" />
                        <div className="course-orbit orbit-two" aria-hidden="true" />

                        <div className="course-cube" aria-hidden="true">
                          <CourseIcon size={40} strokeWidth={1.6} />
                        </div>

                        <span className="course-chapter-number course-chapter-number-large">
                        CHAPTER{" "}
                        {course.chapterNumber}
                      </span>

                      {isCompleted && (
                        <span className="course-completed">
                          ✦ MASTERED
                        </span>
                      )}
                      {!isCompleted && course.completed > 0 && (
                        <span className="course-in-progress-badge">
                          IN PROGRESS
                        </span>
                      )}
                    </div>

                    {/* CONTENT */}
                    <div className="course-card-content">

                      <div className="course-card-title-row">
                        <h3>
                          {course.title}
                        </h3>

                        <span className={`course-status-badge ${course.status}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <p className="course-description course-description-large">
                        {course.total} {course.total === 1 ? "lesson" : "lessons"} to discover
                      </p>

                      {/* PROGRESS */}
                      <div className="course-progress">
                        <div className="course-progress-track">
                          <div
                            className="course-progress-fill"
                            role="progressbar"
                            aria-label={`${course.title} progress`}
                            aria-valuenow={course.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            style={{
                              width: `${course.progress}%`,
                            }}
                          />
                        </div>

                        <span aria-label={`${course.completed} of ${course.total} lessons completed`}>
                          {course.completed}/
                          {course.total}
                        </span>
                      </div>

                      {/* TOPICS PREVIEW */}
                      <div className="course-topics">
                        {course.topics
                          .slice(0, 3)
                          .map(
                            (topic) => {
                              const done =
                                completedLessons.includes(
                                  topic.id
                                );

                              return (
                                <div
                                  key={
                                    topic.id
                                  }
                                  className={
                                    done
                                      ? "topic-done"
                                      : ""
                                  }
                                >
                                  <span className="topic-check">
                                    {done
                                      ? "✓"
                                      : ""}
                                  </span>

                                  <span className="course-topic-title">
                                    {
                                      topic.title
                                    }
                                  </span>
                                </div>
                              );
                            }
                          )}

                        {course.topics
                          .length > 3 && (
                            <span className="more-topics">
                              +
                              {course
                                .topics
                                .length -
                                3}{" "}
                              more
                            </span>
                          )}
                      </div>

                      {/* ACTION */}
                      {actionTopic ? (
                        <Link
                          href={`/student/lesson/${encodeURIComponent(
                            actionTopic.id
                          )}`}
                          className="course-action"
                        >
                          <span>
                            {isCompleted
                              ? "Replay chapter"
                              : course.completed >
                                0
                                ? "Continue quest"
                                : "Start this quest"}
                          </span>

                          <ArrowIcon />
                        </Link>
                      ) : (
                        <div className="course-action disabled">
                          No lessons available
                        </div>
                      )}
                    </div>
                  </article>
                );
              }
            )}
            {filteredCourses.length === 0 && (
              <div className="course-empty-state">
                <span aria-hidden="true">
                  {courses.length ? <Search size={38} strokeWidth={1.6} /> : <Map size={38} strokeWidth={1.6} />}
                </span>
                <h3>{courses.length ? "No quests found" : "Your map is getting ready"}</h3>
                <p>
                  {courses.length
                    ? "Try another search or choose a different progress filter."
                    : "There are no chapters available in this curriculum yet."}
                </p>
                {(searchTerm || courseFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setCourseFilter("all");
                    }}
                  >
                    Show all chapters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* =================================================
            LEARNING PATH
        ================================================== */}

        <section className="learning-path">

          <div className="section-heading">
            <div>
              <span className="section-eyebrow">
                YOUR PROGRESS
              </span>

              <h2 className="courses-path-title">Learning Path</h2>
            </div>
          </div>

          <div className="path-container">

            {courses.map(
              (course, index) => (
                <React.Fragment
                  key={course.id}
                >
                  <div
                    className={`path-node ${course.progress ===
                      100
                      ? "complete"
                      : course.progress >
                        0
                        ? "current"
                        : ""
                      }`}
                  >
                    <span>
                      {course.progress ===
                        100
                        ? "✓"
                        : index + 1}
                    </span>

                    <small>
                      {course.title}
                    </small>
                  </div>

                  {index <
                    courses.length - 1 && (
                      <div
                        className={`path-line ${course.progress ===
                          100
                          ? "complete"
                          : ""
                          }`}
                      />
                    )}
                </React.Fragment>
              )
            )}
          </div>
        </section>

      </div>
    </main>
  );
}