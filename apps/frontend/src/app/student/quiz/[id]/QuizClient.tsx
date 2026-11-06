"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteParams } from "@/lib/route-params";
import "../../quiz/quiz.css";
import { apiFetch } from "@/lib/api";
import type {
  QuizAdaptation,
  QuizSubmitResult,
} from "@intellia360/shared/types/api/adaptive-learning";

type QuizOption = {
  id: string;
  text: string;
};

type QuizQuestion = {
  id: string;
  question: string;
  options: QuizOption[];
  /** The question's own hint from the bank, when it has one. */
  hint?: string;
  difficulty?: "easy" | "medium" | "hard" | null;
};

type QuizData = {
  id: string;
  title: string;
  lessonId: string;
  lessonTitle: string;
  durationSeconds: number;
  questions: QuizQuestion[];
  mode?: "practice" | "adaptive";
  /** Pins the served questions server-side; makes the submission idempotent. */
  sessionId?: string | null;
  adaptation?: QuizAdaptation;
};

type QuizResponse = {
  success: boolean;
  message?: string;
  data?: QuizData;
};

/** Older API builds return only the first six fields. */
type SubmitResult = Pick<
  QuizSubmitResult,
  "quizId" | "lessonId" | "scorePercent" | "correctAnswers" | "totalQuestions" | "xpEarned"
> &
  Partial<Omit<QuizSubmitResult, "quizId" | "lessonId" | "scorePercent" | "correctAnswers" | "totalQuestions" | "xpEarned">>;

type SubmitResponse = {
  success: boolean;
  message?: string;
  data?: SubmitResult;
};

/** Practice ids without a real lesson behind them return to the dashboard instead. */
const NON_LESSON_IDS = new Set(["adaptive-practice", "mixed-practice"]);

function returnHref(quiz: QuizData): string {
  return NON_LESSON_IDS.has(quiz.lessonId)
    ? "/student/dashboard"
    : `/student/lesson/${encodeURIComponent(quiz.lessonId)}`;
}

type QuizState = "loading" | "ready" | "submitting" | "completed" | "error";

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 4h8v5a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
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
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 18h6M10 21h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.5 15.5c-1.1-.9-1.8-2.3-1.8-3.9A5.3 5.3 0 0 1 12 6.3a5.3 5.3 0 0 1 5.3 5.3c0 1.6-.7 3-1.8 3.9-.8.7-1.2 1.3-1.3 2.1H9.8c-.1-.8-.5-1.4-1.3-2.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 12H5M11 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m5 12 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StudentQuizPage() {
  const params = useRouteParams<"id">("/student/quiz/:id");
  const router = useRouter();

  const quizId = params.id;

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [quizState, setQuizState] = useState<QuizState>("loading");

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [timeLeft, setTimeLeft] = useState(0);

  const [hintVisible, setHintVisible] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);

  const [result, setResult] =
    useState<NonNullable<SubmitResponse["data"]> | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  // Smart Practice is part of a paid membership: the API answers 402.
  const [needsMembership, setNeedsMembership] = useState(false);

  const currentQuestion = quiz?.questions[currentQuestionIndex];

  const answeredCount = useMemo(() => {
    return Object.keys(answers).length;
  }, [answers]);

  const progressPercent = useMemo(() => {
    if (!quiz || quiz.questions.length === 0) {
      return 0;
    }

    return Math.round(
      ((currentQuestionIndex + 1) / quiz.questions.length) * 100
    );
  }, [currentQuestionIndex, quiz]);

  const loadQuiz = useCallback(async () => {
    if (!quizId) {
      setQuizState("error");
      setErrorMessage("Quiz ID is missing.");
      return;
    }

    try {
      setQuizState("loading");
      setErrorMessage("");
      // A freshly served quiz starts clean, even when navigating between quiz ids.
      setAnswers({});
      setCurrentQuestionIndex(0);
      setHintVisible(false);
      setHintLevel(0);
      setResult(null);

      const response = await apiFetch(`/api/student/quiz/${quizId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (response.status === 402) {
        const locked = (await response.json().catch(() => null)) as { message?: string } | null;
        setNeedsMembership(true);
        throw new Error(locked?.message ?? "This quiz is part of a paid membership.");
      }

      if (!response.ok) {
        throw new Error("Unable to load quiz.");
      }

      const payload = (await response.json()) as QuizResponse;

      if (!payload.success || !payload.data) {
        throw new Error(payload.message || "Quiz data is unavailable.");
      }

      if (payload.data.questions.length === 0) {
        throw new Error("This quiz does not contain any questions.");
      }

      setQuiz(payload.data);
      setTimeLeft(payload.data.durationSeconds);
      setQuizState("ready");
    } catch (error) {
      console.error("[student/quiz] load error:", error);

      setQuizState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the quiz."
      );
    }
  }, [quizId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  useEffect(() => {
    if (
      quizState !== "ready" ||
      !quiz ||
      timeLeft <= 0
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [quizState, quiz, timeLeft]);

  useEffect(() => {
    if (
      quizState === "ready" &&
      quiz &&
      timeLeft === 0
    ) {
      void submitQuiz();
    }
    // submitQuiz intentionally omitted because it is recreated by render.
    // The timer reaching zero is the only trigger required here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, quizState, quiz]);

  const selectAnswer = (optionId: string) => {
    if (!currentQuestion || quizState !== "ready") {
      return;
    }

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: optionId,
    }));
  };

  const goToPrevious = () => {
    if (currentQuestionIndex === 0) {
      return;
    }

    setCurrentQuestionIndex((previous) => previous - 1);
    setHintVisible(false);
  };

  const goToNext = () => {
    if (!quiz) {
      return;
    }

    if (currentQuestionIndex >= quiz.questions.length - 1) {
      return;
    }

    setCurrentQuestionIndex((previous) => previous + 1);
    setHintVisible(false);
  };

  async function submitQuiz() {
    if (!quiz || quizState === "submitting" || quizState === "completed") {
      return;
    }

    try {
      setQuizState("submitting");
      setErrorMessage("");

      const response = await apiFetch("/api/student/quiz/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quizId: quiz.id,
          lessonId: quiz.lessonId,
          ...(quiz.sessionId ? { sessionId: quiz.sessionId } : {}),
          answers,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SubmitResponse | null;

      if (!response.ok || !payload) {
        // The server explains expired sessions and invalid answers; show that.
        throw new Error(payload?.message || "Unable to submit quiz.");
      }

      if (!payload.success || !payload.data) {
        throw new Error(payload.message || "Quiz submission failed.");
      }

      setResult(payload.data);
      setQuizState("completed");
    } catch (error) {
      console.error("[student/quiz] submit error:", error);

      setQuizState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the quiz."
      );
    }
  }

  const requestHint = () => {
    setHintLevel((previous) => Math.min(previous + 1, 3));
    setHintVisible(true);
  };

  const getHintText = (): string => {
    if (!currentQuestion) {
      return "";
    }

    if (hintLevel === 1) {
      // The question's own hint first — it points at the method, not the answer.
      return (
        currentQuestion.hint ||
        "Read the question carefully and identify the key information you need to solve it."
      );
    }

    if (hintLevel === 2) {
      return "Try eliminating the options that clearly do not match the information given in the question.";
    }

    return "Break the problem into smaller steps. Work through the information one part at a time before choosing your answer.";
  };

  const restartQuiz = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setHintVisible(false);
    setHintLevel(0);
    setResult(null);

    // A session can be submitted once; a new attempt needs a freshly served quiz
    // (for adaptive practice, that also means new questions at the new level).
    if (quiz?.sessionId) {
      void loadQuiz();
      return;
    }

    if (quiz) {
      setTimeLeft(quiz.durationSeconds);
      setQuizState("ready");
    } else {
      void loadQuiz();
    }
  };

  if (quizState === "loading") {
    return (
      <main className="student-quiz-page">
        <div className="quiz-loading">
          <div className="quiz-spinner" />
          <h2>Preparing your challenge</h2>
          <p>Loading your quiz questions...</p>
        </div>
      </main>
    );
  }

  if (quizState === "error") {
    return (
      <main className="student-quiz-page">
        <div className="quiz-error-card">
          <div className="quiz-error-icon">
            <CloseIcon />
          </div>

          <h1>{needsMembership ? "Unlock Smart Practice" : "Quiz unavailable"}</h1>
          <p>{errorMessage}</p>

          <div className="quiz-error-actions">
            {needsMembership ? (
              <button
                type="button"
                className="quiz-primary-button"
                onClick={() => router.push("/student/membership")}
              >
                See membership plans
              </button>
            ) : (
              <button
                type="button"
                className="quiz-primary-button"
                onClick={() => void loadQuiz()}
              >
                Try Again
              </button>
            )}

            <button
              type="button"
              className="quiz-secondary-button"
              onClick={() => router.push("/student/dashboard")}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!quiz) {
    return null;
  }

  if (quizState === "completed" && result) {
    const isPerfect = result.scorePercent === 100;

    return (
      <main className="student-quiz-page">
        <section className="quiz-result-page">
          <div className="result-badge">
            <TrophyIcon />
          </div>

          <p className="result-eyebrow">Challenge Complete</p>

          <h1>
            {isPerfect
              ? "Perfect Score!"
              : "Great Work!"}
          </h1>

          <p className="result-description">
            You completed <strong>{quiz.title}</strong>.
          </p>

          {result.alreadySubmitted && (
            <p className="result-replayed">
              This quiz was already submitted — here is your saved result. No extra XP was added.
            </p>
          )}

          <div className="result-score-ring">
            <div className="result-score-inner">
              <strong>{result.scorePercent}%</strong>
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
              <span>XP Earned</span>
              <strong>+{result.xpEarned}</strong>
            </div>

            <div className="result-stat">
              <span>Accuracy</span>
              <strong>{result.scorePercent}%</strong>
            </div>
          </div>

          {result.review && result.review.some((r) => r.explanation || r.correctOptionId) && (
            <section className="result-section" aria-labelledby="quiz-review-heading">
              <h2 id="quiz-review-heading">Review your answers</h2>
              <ol className="result-list">
                {result.review.map((item) => {
                  const question = quiz.questions.find((q) => q.id === item.questionId);
                  const correctText = question?.options.find((o) => o.id === item.correctOptionId)?.text;
                  return (
                    <li
                      key={item.questionId}
                      className={`result-review-item ${item.isCorrect ? "is-correct" : "is-wrong"}`}
                    >
                      <strong>
                        {item.isCorrect ? "✓ Correct" : "✗ Not quite"} — {question?.question}
                      </strong>
                      {!item.isCorrect && correctText && <>Correct answer: {correctText}. </>}
                      {item.explanation}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {result.mastery && result.mastery.length > 0 && (
            <section className="result-section" aria-labelledby="quiz-mastery-heading">
              <h2 id="quiz-mastery-heading">Topic mastery</h2>
              <ul className="result-list">
                {result.mastery.map((m) => (
                  <li key={m.skill} className="result-mastery-item">
                    <span>
                      {m.label} · {m.bandLabel}
                    </span>
                    <span>
                      {m.after === null
                        ? "Keep practising to measure"
                        : m.before === null
                          ? `${m.after}%`
                          : `${m.before}% → ${m.after}%`}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/student/adaptive-learning" className="result-progress-link">
                See all your progress →
              </Link>
            </section>
          )}

          {result.nextStep && (
            <section className="result-section result-next-step" aria-labelledby="quiz-next-heading">
              <h2 id="quiz-next-heading">Next: {result.nextStep.title}</h2>
              <p>{result.nextStep.reason}</p>
              {result.nextStep.actions[0] &&
                (result.nextStep.actions[0].href === `/student/quiz/${encodeURIComponent(quiz.id)}` ? (
                  // Same quiz again: a link to the current URL would do nothing.
                  <button type="button" onClick={restartQuiz}>
                    {result.nextStep.actions[0].label} →
                  </button>
                ) : (
                  <Link href={result.nextStep.actions[0].href}>
                    {result.nextStep.actions[0].label} →
                  </Link>
                ))}
            </section>
          )}

          <div className="result-actions">
            <button
              type="button"
              className="quiz-primary-button"
              onClick={restartQuiz}
            >
              {quiz.mode === "adaptive" ? "New Questions" : "Try Again"}
            </button>

            <button
              type="button"
              className="quiz-secondary-button"
              onClick={() => router.push(returnHref(quiz))}
            >
              {NON_LESSON_IDS.has(quiz.lessonId) ? "Back to Dashboard" : "Return to Lesson"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isLastQuestion =
    currentQuestionIndex === quiz.questions.length - 1;

  return (
    <main className="student-quiz-page">
      <div className="quiz-shell">
        <header className="quiz-header">
          <div className="quiz-header-left">
            <button
              type="button"
              className="quiz-back-button"
              onClick={() => router.push(returnHref(quiz))}
              aria-label={NON_LESSON_IDS.has(quiz.lessonId) ? "Back to dashboard" : "Back to lesson"}
            >
              <ArrowLeftIcon />
            </button>

            <div>
              <span className="quiz-header-label">
                {quiz.mode === "adaptive" ? "Smart Practice" : "Practice Challenge"}
              </span>

              <h1>{quiz.title}</h1>

              <p>{quiz.lessonTitle}</p>
            </div>
          </div>

          <div className="quiz-header-stats">
            <div className="quiz-header-stat">
              <TrophyIcon />
              <div>
                <span>Reward</span>
                <strong>XP</strong>
              </div>
            </div>

            <div
              className={`quiz-timer ${timeLeft <= 30 ? "is-warning" : ""
                }`}
            >
              <ClockIcon />

              <div>
                <span>Time left</span>
                <strong>{formatTime(timeLeft)}</strong>
              </div>
            </div>
          </div>
        </header>

        {quiz.adaptation && (
          <div className="quiz-adaptation" role="note">
            <span>
              <strong>
                {quiz.adaptation.kind === "diagnostic"
                  ? "Placement quiz"
                  : `Focus: ${quiz.adaptation.focusSkillLabel ?? "Mixed topics"}`}
              </strong>
              {quiz.adaptation.kind !== "diagnostic" && <> · Level: {quiz.adaptation.targetDifficulty}</>}
            </span>
            <span className="quiz-adaptation-note">
              {quiz.adaptation.reason}
              {quiz.adaptation.limitedByBank &&
                " There aren't enough questions at this exact level yet, so the closest ones were used."}
            </span>
          </div>
        )}

        <section className="quiz-progress-section">
          <div className="quiz-progress-top">
            <span>
              Question {currentQuestionIndex + 1} of{" "}
              {quiz.questions.length}
            </span>

            <strong>{progressPercent}%</strong>
          </div>

          <div className="quiz-progress-track">
            <div
              className="quiz-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>

        <section className="quiz-content">
          <div className="quiz-main-card">
            <div className="question-meta">
              <span className="question-number">
                {String(currentQuestionIndex + 1).padStart(2, "0")}
              </span>

              <span className="question-label">
                Challenge Question
              </span>

              {currentQuestion?.difficulty && (
                <span className="question-difficulty">{currentQuestion.difficulty}</span>
              )}
            </div>

            <h2 className="question-title">
              {currentQuestion?.question}
            </h2>

            <div className="quiz-options">
              {currentQuestion?.options.map((option, index) => {
                const isSelected =
                  answers[currentQuestion.id] === option.id;

                const optionLetter = String.fromCharCode(
                  65 + index
                );

                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`quiz-option ${isSelected ? "is-selected" : ""
                      }`}
                    onClick={() => selectAnswer(option.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="option-letter">
                      {optionLetter}
                    </span>

                    <span className="option-text">
                      {option.text}
                    </span>

                    <span className="option-check">
                      {isSelected && <CheckIcon />}
                    </span>
                  </button>
                );
              })}
            </div>

            {hintVisible && (
              <div className="quiz-hint">
                <div className="quiz-hint-icon">
                  <LightbulbIcon />
                </div>

                <div>
                  <strong>Learning Hint</strong>
                  <p>{getHintText()}</p>
                </div>

                <button
                  type="button"
                  className="hint-close"
                  onClick={() => setHintVisible(false)}
                  aria-label="Close hint"
                >
                  <CloseIcon />
                </button>
              </div>
            )}

            <div className="quiz-actions">
              <button
                type="button"
                className="hint-button"
                onClick={requestHint}
                disabled={hintLevel >= 3}
              >
                <LightbulbIcon />
                {hintLevel >= 3
                  ? "Hint Used"
                  : "Need a Hint?"}
              </button>

              <div className="quiz-navigation">
                <button
                  type="button"
                  className="quiz-secondary-button"
                  onClick={goToPrevious}
                  disabled={currentQuestionIndex === 0}
                >
                  <ArrowLeftIcon />
                  Previous
                </button>

                {isLastQuestion ? (
                  <button
                    type="button"
                    className="quiz-primary-button"
                    onClick={() => void submitQuiz()}
                    disabled={quizState === "submitting"}
                  >
                    {quizState === "submitting"
                      ? "Submitting..."
                      : "Finish Challenge"}
                    <CheckIcon />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="quiz-primary-button"
                    onClick={goToNext}
                  >
                    Next
                    <ArrowRightIcon />
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="quiz-sidebar">
            <div className="quiz-map-card">
              <div className="quiz-map-header">
                <div>
                  <span>Challenge Map</span>
                  <strong>
                    {answeredCount}/{quiz.questions.length} answered
                  </strong>
                </div>
              </div>

              <div className="quiz-question-map">
                {quiz.questions.map((question, index) => {
                  const isAnswered = Boolean(
                    answers[question.id]
                  );

                  const isCurrent =
                    index === currentQuestionIndex;

                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={`question-map-item ${isCurrent ? "is-current" : ""
                        } ${isAnswered ? "is-answered" : ""
                        }`}
                      onClick={() => {
                        setCurrentQuestionIndex(index);
                        setHintVisible(false);
                      }}
                    >
                      {isAnswered ? (
                        <CheckIcon />
                      ) : (
                        index + 1
                      )}
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
                  Pending
                </span>
              </div>
            </div>

            <div className="quiz-motivation-card">
              <div className="motivation-icon">
                <TrophyIcon />
              </div>

              <h3>Keep going</h3>

              <p>
                Complete the challenge and earn XP toward your
                next learning milestone.
              </p>

              <div className="motivation-progress">
                <div
                  style={{
                    width: `${Math.round(
                      (answeredCount /
                        quiz.questions.length) *
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}