"use client";

/*
 * ============================================================
 * LESSON TEST  —  the "Test" module of /student/lesson/[id]
 * ============================================================
 *
 * A short test on the lesson's own topic, taken inside the lesson screen after
 * the lesson, its videos and its EduNotes. Every attempt is a fresh set of
 * questions (GET /api/student/quiz/test-<lessonId>), graded on the server
 * (POST /api/student/quiz/submit), which also returns the right answers so the
 * review can teach from mistakes.
 *
 * It reuses the quiz screen's question, option and result styles
 * (student/quiz/quiz.css), so a test looks like every other quiz in the app.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Clock,
  Lightbulb,
  PlayCircle,
  Puzzle,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import type { StudentLessonTest } from "@intellia360/shared/types/api/lesson-resources";
import type { QuizReviewItem, QuizSubmitResult } from "@intellia360/shared/types/api/adaptive-learning";
import { apiFetch } from "@/lib/api";
import "@/app/student/quiz/quiz.css";

type TestQuestion = {
  id: string;
  question: string;
  options: { id: string; text: string }[];
  hint?: string;
  difficulty?: "easy" | "medium" | "hard" | null;
};

type ServedTest = {
  id: string;
  title: string;
  lessonId: string;
  durationSeconds: number;
  questions: TestQuestion[];
  sessionId: string;
};

type Phase = "intro" | "loading" | "ready" | "submitting" | "completed" | "error";

/** Which of the lesson's other modules have something to revise with. */
export interface LessonRevisit {
  lesson: boolean;
  video: boolean;
  eduNotes: boolean;
}

interface LessonTestProps {
  lessonId: string;
  grade: string;
  lessonTitle: string;
  test: StudentLessonTest;
  revisit: LessonRevisit;
}

/** Below this, the result suggests going back over the lesson first. */
const REVISE_BELOW = 80;

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function moduleHref(lessonId: string, grade: string, module: "lesson" | "video" | "edunotes") {
  const params = new URLSearchParams();
  if (module !== "lesson") params.set("module", module);
  if (grade) params.set("grade", grade);
  return `/student/lesson/${encodeURIComponent(lessonId)}?${params.toString()}`;
}

function RevisitLinks({ lessonId, grade, revisit }: { lessonId: string; grade: string; revisit: LessonRevisit }) {
  const links = [
    revisit.video && { href: moduleHref(lessonId, grade, "video"), icon: <PlayCircle size={18} aria-hidden />, label: "Watch the video" },
    revisit.eduNotes && { href: moduleHref(lessonId, grade, "edunotes"), icon: <BookOpen size={18} aria-hidden />, label: "Read the EduNotes" },
    revisit.lesson && { href: moduleHref(lessonId, grade, "lesson"), icon: <Puzzle size={18} aria-hidden />, label: "Try the lesson again" },
  ].filter((l): l is { href: string; icon: JSX.Element; label: string } => Boolean(l));

  if (links.length === 0) return null;
  return (
    <div className="lesson-test-revisit-links">
      {links.map((l) => (
        <Link key={l.label} href={l.href} className="lesson-test-revisit-link">
          {l.icon}
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export default function LessonTest({ lessonId, grade, lessonTitle, test, revisit }: LessonTestProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [served, setServed] = useState<ServedTest | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hintOpen, setHintOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  /** A hand-in that failed: the answers are kept so the student can try again. */
  const [submitError, setSubmitError] = useState("");
  const deadline = useRef(0);
  const autoSubmitted = useRef(false);
  const finishRef = useRef<() => void>(() => {});
  const [stats, setStats] = useState(() =>
    test.available
      ? { attempts: test.attempts, bestScore: test.bestScore, lastScore: test.lastScore }
      : { attempts: 0, bestScore: null as number | null, lastScore: null as number | null }
  );

  const question = served?.questions[current];
  const answeredCount = Object.keys(answers).length;

  async function startTest() {
    if (!test.available) return;
    setPhase("loading");
    setErrorMessage("");
    setAnswers({});
    setCurrent(0);
    setHintOpen(false);
    setResult(null);
    setSubmitError("");

    try {
      const response = await apiFetch(
        `/api/student/quiz/${encodeURIComponent(test.quizId)}?grade=${encodeURIComponent(grade)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload.data?.questions?.length) {
        throw new Error(payload?.message || "This test could not be loaded.");
      }
      setServed(payload.data as ServedTest);
      setTimeLeft(payload.data.durationSeconds);
      deadline.current = Date.now() + payload.data.durationSeconds * 1000;
      autoSubmitted.current = false;
      setPhase("ready");
    } catch (error) {
      console.error("[lesson-test] load error:", error);
      setErrorMessage(error instanceof Error ? error.message : "This test could not be loaded.");
      setPhase("error");
    }
  }

  async function finishTest() {
    if (!served || phase !== "ready") return;
    setPhase("submitting");
    setSubmitError("");
    try {
      const response = await apiFetch("/api/student/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: served.id, sessionId: served.sessionId, lessonId, answers }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload.data) {
        // The server explains expired sessions and invalid answers; show that.
        throw new Error(payload?.message || "Your answers could not be submitted.");
      }
      const graded = payload.data as QuizSubmitResult;
      setResult(graded);
      if (!graded.alreadySubmitted) {
        setStats((s) => ({
          attempts: s.attempts + 1,
          bestScore: Math.max(s.bestScore ?? 0, graded.scorePercent),
          lastScore: graded.scorePercent,
        }));
      }
      setPhase("completed");
    } catch (error) {
      console.error("[lesson-test] submit error:", error);
      setSubmitError(error instanceof Error ? error.message : "Your answers could not be submitted.");
      setPhase("ready");
    }
  }

  // The timer below must hand in the latest answers, not the ones from when it started.
  useEffect(() => {
    finishRef.current = () => void finishTest();
  });

  // Countdown from a fixed deadline, so a throttled background tab stays accurate.
  // When time is up the answers so far are handed in, once; a failed hand-in
  // waits for the student to press Finish again.
  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        window.clearInterval(timer);
        finishRef.current();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const reviewById = useMemo(
    () => new Map<string, QuizReviewItem>((result?.review ?? []).map((r) => [r.questionId, r])),
    [result]
  );

  /* ---------- No test for this lesson ---------- */

  if (!test.available) {
    return (
      <div className="lesson-video-state">
        <div className="lesson-video-state-card">
          <div className="lesson-video-state-icon" aria-hidden="true">📝</div>
          <h2>Test coming soon</h2>
          <p>
            There is no test for this lesson yet. The lesson, its videos and the
            EduNotes are ready to use in the meantime.
          </p>
          <RevisitLinks lessonId={lessonId} grade={grade} revisit={revisit} />
        </div>
      </div>
    );
  }

  /* ---------- Before the test ---------- */

  if (phase === "intro") {
    const minutes = Math.round(test.durationSeconds / 60);
    return (
      <section className="lesson-test-intro" aria-labelledby="lesson-test-title">
        <div className="lesson-test-intro-main">
          <span className="lesson-test-eyebrow">
            <ClipboardCheck size={16} aria-hidden />
            {test.chapterTest ? "Chapter test" : "Lesson test"}
          </span>

          <h2 id="lesson-test-title">{lessonTitle}</h2>

          <p className="lesson-test-lead">
            {test.chapterTest
              ? `${test.questionCount} questions from every lesson in this chapter.`
              : `${test.questionCount} questions on what this lesson teaches.`}{" "}
            Take your time, use a hint if you get stuck, and see every right
            answer when you finish.
          </p>

          {test.covers.length > 0 && (
            <div className="lesson-test-covers">
              <span className="lesson-test-covers-label">{test.chapterTest ? "Lessons in this test" : "This test covers"}</span>
              <ul>
                {test.covers.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <dl className="lesson-test-stats">
            <div>
              <dt>Questions</dt>
              <dd>{test.questionCount}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{minutes} min</dd>
            </div>
            <div>
              <dt>Best score</dt>
              <dd>{stats.bestScore === null ? "—" : `${stats.bestScore}%`}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{stats.attempts}</dd>
            </div>
          </dl>

          <button type="button" className="quiz-primary-button lesson-test-start" onClick={() => void startTest()}>
            {stats.attempts > 0 ? "Take a new test" : "Start the test"}
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>

        <aside className="lesson-test-tip" aria-label="Get ready">
          <div className="lesson-test-tip-icon" aria-hidden="true">💡</div>
          <h3>Get ready first</h3>
          <p>
            {test.chapterTest
              ? "The questions come from every lesson in this chapter. If one of them feels new, go back over it before you start."
              : "The questions are about this lesson. If anything feels new, go over it before you start."}
          </p>
          <RevisitLinks lessonId={lessonId} grade={grade} revisit={revisit} />
        </aside>
      </section>
    );
  }

  /* ---------- Loading / error ---------- */

  if (phase === "loading") {
    return (
      <div className="lesson-test-panel">
        <div className="quiz-loading">
          <div className="quiz-spinner" />
          <h2>Writing your test…</h2>
          <p>Picking questions about {lessonTitle}.</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="lesson-video-state">
        <div className="lesson-video-state-card">
          <div className="lesson-video-state-icon" aria-hidden="true">😕</div>
          <h2>Something went wrong</h2>
          <p>{errorMessage}</p>
          <button type="button" className="edunotes-retry-button" onClick={() => void startTest()}>
            🔄 Start a new test
          </button>
        </div>
      </div>
    );
  }

  if (!served) return null;

  /* ---------- Result ---------- */

  if (phase === "completed" && result) {
    const score = result.scorePercent;
    const needsRevision = score < REVISE_BELOW;
    return (
      <section className="quiz-result-page lesson-test-result" aria-labelledby="lesson-test-result-title">
        <div className="result-badge">
          <Trophy size={24} aria-hidden />
        </div>
        <p className="result-eyebrow">{test.chapterTest ? "Chapter test complete" : "Lesson test complete"}</p>
        <h1 id="lesson-test-result-title">
          {score === 100 ? "Perfect score!" : score >= REVISE_BELOW ? "Great work!" : score >= 50 ? "Good effort!" : "Keep going!"}
        </h1>
        <p className="result-description">
          You finished the test on <strong>{lessonTitle}</strong>.
        </p>

        {result.alreadySubmitted && (
          <p className="result-replayed">This test was already handed in — here is your saved result. No extra XP was added.</p>
        )}

        <div className="result-score-ring" style={{ "--score": `${score}%` } as CSSProperties}>
          <div className="result-score-inner">
            <strong>{score}%</strong>
            <span>Score</span>
          </div>
        </div>

        <div className="result-stats">
          <div className="result-stat">
            <span>Correct</span>
            <strong>
              {result.correctAnswers}/{result.totalQuestions}
            </strong>
          </div>
          <div className="result-stat">
            <span>XP earned</span>
            <strong>+{result.xpEarned}</strong>
          </div>
          <div className="result-stat">
            <span>Best score</span>
            <strong>{stats.bestScore ?? score}%</strong>
          </div>
        </div>

        {needsRevision && (
          <section className="result-section lesson-test-revisit" aria-labelledby="lesson-test-revisit-heading">
            <h2 id="lesson-test-revisit-heading">Go over the lesson again</h2>
            <p>Look at the questions you missed below, then revise and take a new test.</p>
            <RevisitLinks lessonId={lessonId} grade={grade} revisit={revisit} />
          </section>
        )}

        <section className="result-section" aria-labelledby="lesson-test-review-heading">
          <h2 id="lesson-test-review-heading">Your answers</h2>
          <ol className="result-list lesson-test-review">
            {served.questions.map((q) => {
              const review = reviewById.get(q.id);
              const chosen = q.options.find((o) => o.id === answers[q.id])?.text;
              const right = q.options.find((o) => o.id === review?.correctOptionId)?.text;
              const correct = review?.isCorrect ?? false;
              return (
                <li key={q.id} className={`result-review-item ${correct ? "is-correct" : "is-wrong"}`}>
                  <strong>
                    {correct ? "✓" : "✗"} {q.question}
                  </strong>
                  <span className="lesson-test-review-answer">
                    {chosen ? <>Your answer: {chosen}</> : <>Not answered</>}
                    {!correct && right && <> · Right answer: {right}</>}
                  </span>
                  {review?.explanation && <span className="lesson-test-review-why">{review.explanation}</span>}
                </li>
              );
            })}
          </ol>
        </section>

        {result.mastery && result.mastery.length > 0 && (
          <section className="result-section" aria-labelledby="lesson-test-mastery-heading">
            <h2 id="lesson-test-mastery-heading">Topic mastery</h2>
            <ul className="result-list">
              {result.mastery.map((m) => (
                <li key={m.skill} className="result-mastery-item">
                  <span>
                    {m.label} · {m.bandLabel}
                  </span>
                  <span>
                    {m.after === null ? "Keep practising to measure" : m.before === null ? `${m.after}%` : `${m.before}% → ${m.after}%`}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/student/adaptive-learning" className="result-progress-link">
              See all your progress →
            </Link>
          </section>
        )}

        <div className="result-actions">
          <button type="button" className="quiz-primary-button" onClick={() => void startTest()}>
            <RotateCcw size={18} aria-hidden />
            Take a new test
          </button>
          <Link href={moduleHref(lessonId, grade, "lesson")} className="quiz-secondary-button">
            Back to the lesson
          </Link>
        </div>
      </section>
    );
  }

  /* ---------- Taking the test ---------- */

  const total = served.questions.length;
  const isLast = current === total - 1;
  const unanswered = total - answeredCount;
  const progress = Math.round(((current + 1) / total) * 100);

  return (
    <div className="lesson-test-run">
      <div className="lesson-test-bar">
        <div className="lesson-test-bar-title">
          <span className="quiz-header-label">{test.chapterTest ? "Chapter test" : "Lesson test"}</span>
          <strong>{lessonTitle}</strong>
        </div>
        <div className={`quiz-timer ${timeLeft <= 30 ? "is-warning" : ""}`} role="timer" aria-live="off">
          <Clock size={20} aria-hidden />
          <div>
            <span>Time left</span>
            <strong>{formatTime(timeLeft)}</strong>
          </div>
        </div>
      </div>

      <section className="quiz-progress-section">
        <div className="quiz-progress-top">
          <span>
            Question {current + 1} of {total}
          </span>
          <strong>{progress}%</strong>
        </div>
        <div className="quiz-progress-track">
          <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="quiz-content">
        <div className="quiz-main-card">
          <div className="question-meta">
            <span className="question-number">{String(current + 1).padStart(2, "0")}</span>
            <span className="question-label">Test question</span>
            {question?.difficulty && <span className="question-difficulty">{question.difficulty}</span>}
          </div>

          <h2 className="question-title">{question?.question}</h2>

          <div className="quiz-options">
            {question?.options.map((option, index) => {
              const selected = answers[question.id] === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`quiz-option ${selected ? "is-selected" : ""}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                  aria-pressed={selected}
                  disabled={phase !== "ready"}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="option-text">{option.text}</span>
                  <span className="option-check">{selected && <Check size={18} aria-hidden />}</span>
                </button>
              );
            })}
          </div>

          {hintOpen && question?.hint && (
            <div className="quiz-hint">
              <div className="quiz-hint-icon">
                <Lightbulb size={20} aria-hidden />
              </div>
              <div>
                <strong>Hint</strong>
                <p>{question.hint}</p>
              </div>
              <button type="button" className="hint-close" onClick={() => setHintOpen(false)} aria-label="Close hint">
                <X size={20} aria-hidden />
              </button>
            </div>
          )}

          <div className="quiz-actions">
            <button
              type="button"
              className="hint-button"
              onClick={() => setHintOpen(true)}
              disabled={!question?.hint || hintOpen}
            >
              <Lightbulb size={18} aria-hidden />
              Need a hint?
            </button>

            <div className="quiz-navigation">
              <button
                type="button"
                className="quiz-secondary-button"
                onClick={() => {
                  setCurrent((c) => c - 1);
                  setHintOpen(false);
                }}
                disabled={current === 0}
              >
                <ArrowLeft size={18} aria-hidden />
                Previous
              </button>

              {isLast ? (
                <button
                  type="button"
                  className="quiz-primary-button"
                  onClick={() => void finishTest()}
                  disabled={phase === "submitting"}
                >
                  {phase === "submitting" ? "Handing in…" : "Finish test"}
                  <Check size={18} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className="quiz-primary-button"
                  onClick={() => {
                    setCurrent((c) => c + 1);
                    setHintOpen(false);
                  }}
                >
                  Next
                  <ArrowRight size={18} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {submitError && (
            <p className="lesson-test-submit-error" role="alert">
              {submitError} Your answers are still here — press Finish test to try again.
            </p>
          )}

          {isLast && unanswered > 0 && phase === "ready" && (
            <p className="lesson-test-unanswered" role="status">
              {unanswered === 1 ? "1 question is" : `${unanswered} questions are`} not answered yet — use the map to go back.
            </p>
          )}
        </div>

        <aside className="quiz-sidebar">
          <div className="quiz-map-card">
            <div className="quiz-map-header">
              <div>
                <span>Question map</span>
                <strong>
                  {answeredCount}/{total} answered
                </strong>
              </div>
            </div>
            <div className="quiz-question-map">
              {served.questions.map((q, index) => {
                const isAnswered = Boolean(answers[q.id]);
                return (
                  <button
                    type="button"
                    key={q.id}
                    className={`question-map-item ${index === current ? "is-current" : ""} ${isAnswered ? "is-answered" : ""}`}
                    onClick={() => {
                      setCurrent(index);
                      setHintOpen(false);
                    }}
                    aria-label={`Question ${index + 1}${isAnswered ? ", answered" : ""}`}
                    aria-current={index === current ? "step" : undefined}
                  >
                    {isAnswered ? <Check size={16} aria-hidden /> : index + 1}
                  </button>
                );
              })}
            </div>
            <div className="quiz-map-legend">
              <span>
                <i className="legend-dot current" />
                Current
              </span>
              <span>
                <i className="legend-dot answered" />
                Answered
              </span>
              <span>
                <i className="legend-dot pending" />
                To do
              </span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
