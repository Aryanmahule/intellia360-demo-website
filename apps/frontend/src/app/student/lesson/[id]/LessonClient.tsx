"use client";

import {
  Suspense,
  useRef,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRouteParams } from "@/lib/route-params";
import { useStudent } from "@/context/StudentContext";
import LessonResourceNav, {
  type LessonResourceKey,
} from "@/components/student/LessonResourceNav";
import LessonTest from "@/components/student/LessonTest";
import type {
  LessonVideoResources,
  StudentLessonResources,
} from "@intellia360/shared/types/api/lesson-resources";
import "@/styles/lesson-resources.css";
import { apiFetch, apiUrl } from "@/lib/api";


/*
 * ============================================================
 * LESSON SCREEN
 * ============================================================
 *
 * The parent shell for every lesson module. Architecture, Videos, EduNotes
 * and the Test are switched with ?module= and rendered here from the lesson's
 * own data (/api/student/lesson-resources), so no student route is ever
 * framed inside another.
 */

const LESSON_MODULES: LessonResourceKey[] = ["lesson", "video", "edunotes", "test"];

/*
 * react-pdf uses browser APIs such as DOMMatrix.
 * Therefore EduNotesBookViewer must be loaded client-side only.
 */
const EduNotesBookViewer = dynamic(
  () => import("@/components/student/EduNotesBookViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="edunotes-state">
        <div className="edunotes-loader">📚</div>

        <h2>Opening your learning book...</h2>

        <p>Preparing your EduNotes ✨</p>
      </div>
    ),
  }
);


/*
 * ============================================================
 * SHARED STATES
 * ============================================================
 */

function LessonLoadingScreen() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7ff",
      }}
    >
      <div
        style={{
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
          }}
        >
          📚
        </div>

        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#172554",
          }}
        >
          Loading lesson...
        </h2>
      </div>
    </main>
  );
}

function LessonErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        minHeight: "750px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        textAlign: "center",
        background:
          "linear-gradient(135deg, #fff7ed, #fff)",
        borderRadius: "20px",
        padding: "40px",
      }}
    >
      <div
        style={{
          fontSize: "60px",
          marginBottom: "20px",
        }}
      >
        😕
      </div>

      <h2
        style={{
          fontSize: "28px",
          fontWeight: 800,
          color: "#172554",
          marginBottom: "10px",
        }}
      >
        Lesson Could Not Be Loaded
      </h2>

      <p
        style={{
          color: "#64748b",
          maxWidth: "500px",
          lineHeight: 1.6,
        }}
      >
        We couldn&apos;t load this lesson
        architecture. Please try again.
      </p>

      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: "20px",
          padding: "12px 24px",
          border: "none",
          borderRadius: "12px",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Try Again
      </button>
    </div>
  );
}

const lessonCardStyle = {
  position: "relative",
  width: "100%",
  background: "#ffffff",
  borderRadius: "24px",
  padding: "12px",
  boxShadow:
    "0 10px 40px rgba(37, 99, 235, 0.08)",
  overflow: "hidden",
} as const;

/*
 * ============================================================
 * VIDEO MODULE
 * ============================================================
 */

function StateCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="lesson-video-state">
      <div className="lesson-video-state-card">
        <div className="lesson-video-state-icon" aria-hidden="true">
          {icon}
        </div>

        <h2>{title}</h2>

        {children}
      </div>
    </div>
  );
}

function LessonVideoModule({
  lessonId,
  grade,
  lessonTitle,
  video,
}: {
  lessonId: string;
  grade: string;
  lessonTitle: string;
  video: LessonVideoResources;
}) {
  const [selected, setSelected] = useState(0);

  /* ---------- A non-YouTube video URL from the lesson data ---------- */

  if (video.embedUrl) {
    return (
      <div className="lesson-video-layout">
        <section className="lesson-video-main" aria-label="Video player">
          <div className="lesson-video-frame">
            <iframe
              key={video.embedUrl}
              src={video.embedUrl}
              title={`${lessonTitle} — lesson video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>

          <div className="lesson-video-caption">
            <h2>{lessonTitle}</h2>
          </div>
        </section>
      </div>
    );
  }

  const videos = video.videos;
  const activeVideo = videos[selected];

  if (!activeVideo) {
    return (
      <StateCard icon="🎬" title="Videos coming soon">
        <p>
          No videos are published for this topic yet. The EduNotes book and
          the interactive lesson are ready to use in the meantime.
        </p>

        <LessonResourceNav
          lessonId={lessonId}
          grade={grade}
          active="video"
        />
      </StateCard>
    );
  }

  return (
    <div className="lesson-video-layout">

      <section className="lesson-video-main" aria-label="Video player">
        <div className="lesson-video-frame">
          <iframe
            key={activeVideo.videoId}
            src={
              "https://www.youtube-nocookie.com/embed/" +
              activeVideo.videoId +
              "?rel=0"
            }
            title={activeVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>

        <div className="lesson-video-caption">
          <h2>{activeVideo.title}</h2>

          {activeVideo.description && <p>{activeVideo.description}</p>}
        </div>
      </section>

      {videos.length > 1 && (
        <aside
          className="lesson-video-side"
          aria-label="Videos in this topic"
        >
          <h3>In this topic</h3>

          <ul className="lesson-video-list">
            {videos.map((item, index) => (
              <li key={item.videoId}>
                <button
                  type="button"
                  className={
                    "lesson-video-item" +
                    (index === selected ? " is-active" : "")
                  }
                  aria-current={index === selected ? "true" : undefined}
                  onClick={() => setSelected(index)}
                >
                  <span
                    className="lesson-video-item-index"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>

                  <span className="lesson-video-item-body">
                    <strong>{item.title}</strong>
                    {item.durationLabel && (
                      <small>{item.durationLabel}</small>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}


/*
 * ============================================================
 * EDUNOTES MODULE
 * ============================================================
 */

function LessonEduNotesModule({
  lessonId,
  grade,
  available,
}: {
  lessonId: string;
  grade: string;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="edunotes-state">
        <div className="edunotes-state-icon">
          📚
        </div>

        <h2>EduNotes not available</h2>

        <p>
          Notes for this lesson are not
          available yet.
        </p>

        <LessonResourceNav
          lessonId={lessonId}
          grade={grade}
          active="edunotes"
        />
      </div>
    );
  }

  const pdfUrl = apiUrl(
    `/api/student/edunotes/content` +
    `?lessonId=${encodeURIComponent(lessonId)}` +
    `&grade=${encodeURIComponent(grade)}`);

  return (
    <EduNotesBookViewer
      pdfUrl={pdfUrl}
      lessonId={lessonId}
    />
  );
}


/*
 * ============================================================
 * LESSON CONTENT
 * ============================================================
 */

function StudentLessonContent() {
  const params = useRouteParams<"id">("/student/lesson/:id");
  const searchParams = useSearchParams();
  const { currentGrade, gradeReady } = useStudent();
  const lessonViewerRef = useRef<HTMLDivElement>(null);

  const lessonId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  const moduleParam = searchParams.get("module") as LessonResourceKey | null;
  const activeModule: LessonResourceKey =
    moduleParam && LESSON_MODULES.includes(moduleParam)
      ? moduleParam
      : "lesson";

  // The grade carried by the module buttons, otherwise the student's grade
  // from StudentContext once their profile has loaded — reading it earlier
  // briefly loaded the default grade's lesson.
  const grade = searchParams.get("grade") || (gradeReady ? currentGrade : "");

  const [isLoading, setIsLoading] =
    useState(true);

  const [hasError, setHasError] =
    useState(false);

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [reloadKey, setReloadKey] =
    useState(0);

  const [result, setResult] = useState<{
    key: string;
    data: StudentLessonResources | null;
  } | null>(null);

  const requestKey = `${grade}:${lessonId ?? ""}:${reloadKey}`;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === lessonViewerRef.current
      );
    };
    const handleFullscreenEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        document.fullscreenElement !== lessonViewerRef.current
      ) {
        return;
      }

      void document.exitFullscreen().catch((error: unknown) => {
        console.error("[Lesson fullscreen] Unable to exit fullscreen mode:", error);
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleFullscreenEscape);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleFullscreenEscape);
    };
  }, []);

  const toggleLessonFullscreen = async () => {
    const viewer = lessonViewerRef.current;
    if (!viewer) return;

    try {
      if (document.fullscreenElement === viewer) {
        await document.exitFullscreen();
      } else {
        await viewer.requestFullscreen();
      }
    } catch (error) {
      console.error("[Lesson fullscreen] Unable to change fullscreen mode:", error);
    }
  };


  /*
   * ----------------------------------------------------------
   * LOAD LESSON DATA
   * ----------------------------------------------------------
   */

  useEffect(() => {
    if (!lessonId || !grade) return;

    const controller = new AbortController();

    const url =
      "/api/student/lesson-resources" +
      "?lessonId=" + encodeURIComponent(lessonId) +
      "&grade=" + encodeURIComponent(grade);

    apiFetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          throw new Error(json?.message ?? `HTTP ${response.status}`);
        }

        setResult({ key: requestKey, data: json.data as StudentLessonResources });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Lesson resources error:", error);
        setResult({ key: requestKey, data: null });
      });

    return () => controller.abort();
  }, [lessonId, grade, requestKey]);


  /*
   * ----------------------------------------------------------
   * LESSON NOT FOUND
   * ----------------------------------------------------------
   */

  if (!lessonId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f7ff",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
          }}
        >
          <div
            style={{
              fontSize: "64px",
              marginBottom: "20px",
            }}
          >
            📚
          </div>

          <h1
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "#172554",
              marginBottom: "12px",
            }}
          >
            Lesson not found
          </h1>

          <p
            style={{
              color: "#64748b",
              fontSize: "16px",
            }}
          >
            Please select a lesson from the
            student dashboard.
          </p>
        </div>
      </main>
    );
  }

  const settled = result?.key === requestKey ? result : null;

  if (!settled) {
    return <LessonLoadingScreen />;
  }

  const resources = settled.data;
  const architectureUrl = resources?.architectureUrl ?? null;


  /*
   * ----------------------------------------------------------
   * ARCHITECTURE NOT CONFIGURED
   * ----------------------------------------------------------
   */

  if (resources && activeModule === "lesson" && !architectureUrl) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f5f7ff",
          padding: "40px",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            background: "#ffffff",
            borderRadius: "24px",
            padding: "50px",
            textAlign: "center",
            boxShadow:
              "0 10px 40px rgba(37, 99, 235, 0.08)",
          }}
        >
          <div
            style={{
              fontSize: "64px",
              marginBottom: "20px",
            }}
          >
            🚧
          </div>

          <h1
            style={{
              fontSize: "32px",
              fontWeight: 800,
              color: "#172554",
              marginBottom: "12px",
            }}
          >
            Lesson Architecture Coming Soon
          </h1>

          <p
            style={{
              color: "#64748b",
              fontSize: "16px",
              marginBottom: "10px",
            }}
          >
            This lesson does not have an architecture
            configured yet.
          </p>

          <p
            style={{
              color: "#2563eb",
              fontWeight: 600,
            }}
          >
            Lesson: {lessonId}
          </p>

          {/* The interactive module is not ready, but the topic videos and
              EduNotes for this lesson still are. */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LessonResourceNav lessonId={lessonId} grade={grade} active="lesson" />
          </div>
        </div>
      </main>
    );
  }


  /*
   * ----------------------------------------------------------
   * LESSON PLAYER
   * ----------------------------------------------------------
   */

  return (
    <main className="student-lesson-page">
      <div className="student-lesson-page__content">
        <div className="student-lesson-shell">

          {/* ==================================================
              LESSON HEADER
          ================================================== */}

          <div className="student-lesson-header">
            <h1 className="student-lesson-title">
              Lesson Player
            </h1>

            <p className="student-lesson-subtitle">
              Current Lesson:{" "}
              <strong
                style={{
                  color: "#2563eb",
                }}
              >
                {lessonId}
              </strong>
            </p>

            {/* Topic-wise resources for this lesson */}
            <LessonResourceNav lessonId={lessonId} grade={grade} active={activeModule} />
          </div>


          {/* ==================================================
              LESSON DATA COULD NOT BE LOADED
          ================================================== */}

          {!resources && (
            <div style={lessonCardStyle}>
              <LessonErrorScreen
                onRetry={() => setReloadKey((key) => key + 1)}
              />
            </div>
          )}


          {/* ==================================================
              ARCHITECTURE CARD
          ================================================== */}

          {resources && activeModule === "lesson" && architectureUrl && (
            <div
              ref={lessonViewerRef}
              className="lesson-architecture-viewer"
            >
              <div className="lesson-architecture-toolbar">
                <span className="lesson-architecture-toolbar-title">
                  Interactive Lesson
                </span>
                <button
                  type="button"
                  className="lesson-architecture-fullscreen"
                  onClick={toggleLessonFullscreen}
                  aria-pressed={isFullscreen}
                  aria-label={
                    isFullscreen
                      ? "Exit full screen lesson"
                      : "View lesson full screen"
                  }
                  title={
                    isFullscreen
                      ? "Exit full screen"
                      : "Full screen"
                  }
                >
                  <span aria-hidden="true">{isFullscreen ? "⊠" : "⛶"}</span>
                  {isFullscreen ? "Exit Full Screen" : "Full Screen"}
                </button>
              </div>

              {/* ------------------------------------------------
                  LOADING SCREEN
              ------------------------------------------------ */}

              {isLoading && (
                <div className="lesson-architecture-loading">
                  <div
                    style={{
                      fontSize: "64px",
                      marginBottom: "20px",
                    }}
                  >
                    🚀
                  </div>

                  <h2 className="lesson-architecture-loading-title">
                    Preparing Your Lesson...
                  </h2>

                  <p className="lesson-architecture-loading-copy">
                    Get ready for your learning
                    adventure! ✨
                  </p>
                </div>
              )}


              {/* ------------------------------------------------
                  ERROR SCREEN
              ------------------------------------------------ */}

              {hasError && (
                <LessonErrorScreen
                  onRetry={() => {
                    setHasError(false);
                    setIsLoading(true);
                  }}
                />
              )}


              {/* ==================================================
                  ACTUAL LESSON ARCHITECTURE
              ================================================== */}

              {!hasError && (
                <iframe
                  key={architectureUrl}
                  className="lesson-architecture-frame"
                  src={architectureUrl}
                  title={`${lessonId} Lesson Architecture`}
                  onLoad={() => {
                    setIsLoading(false);
                  }}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                  allow="
                    fullscreen;
                    autoplay;
                    clipboard-write;
                    encrypted-media;
                    picture-in-picture;
                  "
                  allowFullScreen
                  scrolling="auto"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}

            </div>
          )}


          {/* ==================================================
              VIDEO MODULE
          ================================================== */}

          {resources && activeModule === "video" && (
            <LessonVideoModule
              key={requestKey}
              lessonId={lessonId}
              grade={grade}
              lessonTitle={resources.title ?? lessonId}
              video={resources.video}
            />
          )}


          {/* ==================================================
              EDUNOTES MODULE
          ================================================== */}

          {resources && activeModule === "edunotes" && (
            <LessonEduNotesModule
              lessonId={lessonId}
              grade={grade}
              available={resources.eduNotes.available}
            />
          )}


          {/* ==================================================
              TEST MODULE
          ================================================== */}

          {resources && activeModule === "test" && (
            <LessonTest
              key={requestKey}
              lessonId={lessonId}
              grade={grade}
              lessonTitle={resources.title ?? lessonId}
              // Older API builds have no test field.
              test={resources.test ?? { available: false }}
              revisit={{
                lesson: Boolean(architectureUrl),
                video: resources.video.videos.length > 0 || Boolean(resources.video.embedUrl),
                eduNotes: resources.eduNotes.available,
              }}
            />
          )}

        </div>
      </div>
    </main>
  );
}


/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function StudentLessonPage() {
  return (
    <Suspense fallback={<LessonLoadingScreen />}>
      <StudentLessonContent />
    </Suspense>
  );
}
