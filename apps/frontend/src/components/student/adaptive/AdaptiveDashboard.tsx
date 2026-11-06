"use client";

/**
 * Adaptive learning dashboard — /student/adaptive-learning.
 *
 * Two reads, both the signed-in student's own data for their profile grade:
 *   GET /api/student/adaptive-learning            mastery, recommendations
 *   GET /api/student/adaptive-learning/progress   history for the chosen range
 *
 * Nothing here is sample data. A new student sees empty states and the
 * placement quiz; every number comes from graded quiz answers.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  ChartLine,
  ChevronDown,
  CircleCheck,
  Compass,
  Flame,
  History,
  Info,
  Layers,
  Lightbulb,
  Minus,
  RotateCcw,
  Route,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  Trophy,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useStudentContext } from "@/context/StudentContext";
import type {
  AdaptiveOverview,
  AdaptiveProgress,
  MasteryBandPolicy,
  NextQuizPreview,
  Recommendation,
  SkillMasteryView,
} from "@intellia360/shared/types/api/adaptive-learning";
import { ActivityChart, MasteryChart } from "./ProgressCharts";
import MistakesReview from "./MistakesReview";
import QuizHistory from "./QuizHistory";
import TopicExplorer, { topicDomId, type TopicFilter } from "./TopicExplorer";
import {
  BAND_CHIP,
  BAND_COLOR,
  BAND_FILL,
  BAND_SHORT,
  DIFFICULTY_TEXT,
  percent,
  plural,
  RECOMMENDATION_CHIP,
  shortDay,
} from "./format";
import styles from "./AdaptiveDashboard.module.css";

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

const ATTENTION_LIMIT = 4;
const RECS_COLLAPSED = 3;
const QUIZZES_COLLAPSED = 5;

async function getData<T>(path: string, signal: AbortSignal, fallback: string): Promise<T> {
  const res = await apiFetch(path, { cache: "no-store", signal });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json.data) throw new Error(json?.message ?? fallback);
  return json.data as T;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function gradeName(grade: string): string {
  const n = grade.match(/\d+/)?.[0];
  return n ? `Grade ${n}` : grade;
}

function bandOf(score: number, bands: MasteryBandPolicy[]): MasteryBandPolicy | undefined {
  return bands.find((b) => score >= b.min && score <= b.max);
}

/* ── Rings ────────────────────────────────────────────────────────────────── */

function Ring({
  value,
  size,
  stroke,
  color,
  track,
}: {
  value: number;
  size: number;
  stroke: number;
  color: string;
  track: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

function OverallChange({ progress }: { progress: AdaptiveProgress | null }) {
  const measured = progress?.masteryHistory.filter((p) => p.overall !== null) ?? [];
  if (measured.length < 2) return null;
  const first = measured[0];
  const last = measured[measured.length - 1];
  const diff = last.overall! - first.overall!;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  return (
    <span className={styles.heroChange}>
      <Icon size={14} aria-hidden />
      {diff === 0
        ? `No change since ${shortDay(first.date)}`
        : `${diff > 0 ? "Up" : "Down"} ${plural(Math.abs(diff), "point")} since ${shortDay(first.date)}`}
    </span>
  );
}

function Summary({ overview, progress }: { overview: AdaptiveOverview; progress: AdaptiveProgress | null }) {
  const { summary, skills, policy } = overview;
  const overall = summary.overallMastery;
  const band = overall === null ? undefined : bandOf(overall, policy.bands);
  const nearly = skills.filter((s) => s.band === "nearly-proficient").length;
  const needsWork = skills.filter((s) => s.band === "foundational" || s.band === "developing").length;
  const correct = skills.reduce((sum, s) => sum + s.correctCount, 0);
  const accuracy = percent(correct, summary.totalResponses);

  const tiles = [
    {
      icon: Trophy,
      tone: styles.iconGreen,
      label: "Topics mastered",
      value: summary.proficientSkills,
      of: summary.totalSkills,
      sub: nearly > 0 ? `${nearly} nearly there` : "Proficient at 85% or more",
    },
    {
      icon: Target,
      tone: styles.iconRed,
      label: "Need attention",
      value: needsWork,
      sub:
        summary.needsSupportSkills > 0
          ? `${summary.needsSupportSkills} need${summary.needsSupportSkills === 1 ? "s" : ""} extra support`
          : needsWork > 0
            ? "Below 70% mastery"
            : "Nothing below 70%",
    },
    {
      icon: CircleCheck,
      tone: styles.iconBlue,
      label: "Answers graded",
      value: summary.totalResponses,
      sub: accuracy === null ? "Take a quiz to begin" : `${accuracy}% correct overall`,
    },
    {
      icon: BookOpen,
      tone: styles.iconViolet,
      label: "Lessons completed",
      value: summary.lessons.available ? summary.lessons.completed : "—",
      of: summary.lessons.available ? summary.lessons.total : undefined,
      sub: "In your grade's curriculum",
    },
    {
      icon: Flame,
      tone: styles.iconOrange,
      label: "Day streak",
      value: summary.streakDays,
      sub: summary.streakDays > 0 ? "Keep it going!" : "Do today's quiz to start one",
    },
    {
      icon: RotateCcw,
      tone: styles.iconAmber,
      label: "Revision due",
      value: summary.revisionDue,
      sub: summary.revisionDue > 0 ? "Topics to refresh" : "Nothing to revise yet",
    },
  ];

  return (
    <section className={styles.summary} aria-label="Summary">
      <div className={styles.heroCard}>
        <span className={styles.heroLabel}>Overall mastery</span>
        <div className={styles.ring}>
          <Ring value={overall ?? 0} size={172} stroke={12} color="#fff" track="rgba(255,255,255,0.18)" />
          <div className={styles.ringCenter}>
            <span className={`${styles.heroValue} ${overall === null ? styles.heroValueSmall : ""}`}>
              {overall === null ? "—" : `${overall}%`}
            </span>
            <span className={styles.heroUnit}>
              {summary.assessedSkills} of {plural(summary.totalSkills, "topic")}
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "center", position: "relative" }}>
          <span className={styles.heroBand}>{band ? band.label : "Not measured yet"}</span>
          <OverallChange progress={progress} />
        </div>
      </div>

      <div className={styles.tiles}>
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className={styles.tile}>
              <div className={styles.tileTop}>
                <span className={`${styles.tileIcon} ${t.tone}`}>
                  <Icon size={19} aria-hidden />
                </span>
                <span className={styles.tileLabel}>{t.label}</span>
              </div>
              <span className={styles.tileValue}>
                {t.value}
                {t.of !== undefined && <small>/{t.of}</small>}
              </span>
              <span className={styles.tileSub}>{t.sub}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Topics that need attention ───────────────────────────────────────────── */

function needsAttention(s: SkillMasteryView): boolean {
  if (s.score === null) return false;
  return (
    s.band === "foundational" ||
    s.band === "developing" ||
    s.trend === "declining" ||
    s.repeatedMistakeCount > 0
  );
}

function AttentionReasons({ skill }: { skill: SkillMasteryView }) {
  const reasons: { key: string; icon: typeof Info; text: string; warn?: boolean }[] = [
    {
      key: "accuracy",
      icon: CircleCheck,
      text: `${skill.correctCount} of ${plural(skill.evidenceCount, "answer")} right`,
    },
  ];
  if (skill.trend === "declining") {
    reasons.push({ key: "trend", icon: TrendingDown, text: "Slipping lately", warn: true });
  }
  if (skill.repeatedMistakeCount > 0) {
    reasons.push({
      key: "repeat",
      icon: RotateCcw,
      text:
        skill.repeatedMistakeCount === 1
          ? "Missed the same question twice"
          : `${skill.repeatedMistakeCount} questions missed more than once`,
      warn: true,
    });
  }
  if (skill.daysSincePractice !== null && skill.daysSincePractice >= 7) {
    reasons.push({ key: "idle", icon: History, text: `Last practised ${skill.daysSincePractice} days ago` });
  }
  reasons.push({
    key: "level",
    icon: Layers,
    text: `Next questions: ${DIFFICULTY_TEXT[skill.recommendedDifficulty]}`,
  });

  return (
    <ul className={styles.reasonList}>
      {reasons.map((r) => {
        const Icon = r.icon;
        return (
          <li key={r.key} className={`${styles.reason} ${r.warn ? styles.reasonWarn : ""}`}>
            <Icon size={13} aria-hidden />
            {r.text}
          </li>
        );
      })}
    </ul>
  );
}

function AttentionCard({
  overview,
  onShowTopic,
}: {
  overview: AdaptiveOverview;
  onShowTopic: (skill: string) => void;
}) {
  const weak = overview.skills.filter(needsAttention);
  const shown = weak.slice(0, ATTENTION_LIMIT);
  const remedialLesson = (skill: string) =>
    overview.recommendations.find((r) => r.skill === skill && r.lesson)?.lesson ?? null;

  return (
    <section className={styles.card} aria-labelledby="attention-heading">
      <div className={styles.cardHead}>
        <div>
          <h2 id="attention-heading" className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon} style={{ background: "#fee2e2", color: "#b91c1c" }}>
              <Target size={16} aria-hidden />
            </span>
            Topics that need your attention
          </h2>
          <p className={styles.sectionLead}>Weakest first, with what we noticed and the best way to improve.</p>
        </div>
      </div>

      {overview.summary.assessedSkills === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} style={{ background: "#ede9fe", color: "#6d28d9" }}>
            <Compass size={22} aria-hidden />
          </span>
          <p className={styles.emptyTitle}>We don&apos;t know your weak spots yet</p>
          <p className={styles.muted}>A few quizzes will show which topics need more work.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Star size={22} aria-hidden />
          </span>
          <p className={styles.emptyTitle}>No weak topics right now</p>
          <p className={styles.muted}>Every topic you&apos;ve practised is at 70% or above. Try a challenge to go further.</p>
        </div>
      ) : (
        <>
          <ul className={styles.attentionList}>
            {shown.map((skill) => {
              const lesson = remedialLesson(skill.skill) ?? skill.lessons[0] ?? null;
              return (
                <li key={skill.skill} className={styles.attentionItem}>
                  <div className={styles.scoreBadge}>
                    <Ring value={skill.score ?? 0} size={58} stroke={6} color={BAND_COLOR[skill.band]} track="#e2e8f0" />
                    <span className={styles.scoreBadgeValue}>{skill.score}%</span>
                  </div>
                  <div className={styles.attentionBody} style={{ minWidth: 0 }}>
                    <div className={styles.attentionHead}>
                      <h3 className={styles.attentionName}>{skill.label}</h3>
                      <span className={`${styles.chip} ${BAND_CHIP[skill.band]}`}>{BAND_SHORT[skill.band]}</span>
                    </div>
                    <AttentionReasons skill={skill} />
                    <div className={styles.attentionActions}>
                      <Link href={skill.practiceHref} className={`${styles.primaryButton} ${styles.smallButton}`}>
                        <Zap size={14} aria-hidden />
                        Practise at {DIFFICULTY_TEXT[skill.recommendedDifficulty].toLowerCase()} level
                      </Link>
                      {lesson && (
                        <Link
                          href={`/student/lesson/${encodeURIComponent(lesson.id)}`}
                          className={`${styles.secondaryButton} ${styles.smallButton}`}
                        >
                          <BookOpen size={14} aria-hidden />
                          Learn: {lesson.title}
                        </Link>
                      )}
                      <button type="button" className={styles.textLink} onClick={() => onShowTopic(skill.skill)}>
                        Details <ArrowRight size={13} aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {weak.length > shown.length && (
            <p className={styles.note}>
              <Info size={13} aria-hidden />
              <span>{`${plural(weak.length - shown.length, "more topic")} also need work. See “All topics” below.`}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ── Smart practice, strengths, revision ──────────────────────────────────── */

function SmartPracticeCard({ nextQuiz }: { nextQuiz: NextQuizPreview }) {
  const total = nextQuiz.mix.reduce((sum, m) => sum + m.questions, 0);
  return (
    <section className={styles.smartCard} aria-labelledby="smart-heading">
      <div className={styles.smartHead}>
        <span className={styles.smartIcon}>
          <Sparkles size={20} aria-hidden />
        </span>
        <div>
          <span className={styles.smartEyebrow}>Your next smart quiz</span>
          <h2 id="smart-heading" className={styles.smartTitle}>
            {nextQuiz.title}
          </h2>
        </div>
      </div>
      <p className={styles.smartReason}>{nextQuiz.reason}</p>
      <ul className={styles.mixList} aria-label={`${total} questions`}>
        {nextQuiz.mix.map((m) => (
          <li key={m.skill ?? "any"} className={styles.mixItem}>
            <span>{m.label}</span>
            <span className={styles.mixDots} aria-label={plural(m.questions, "question")}>
              {Array.from({ length: m.questions }, (_, i) => (
                <span key={i} className={styles.mixDot} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.smartMeta}>
        <span className={`${styles.chip} ${styles.chipDiagnostic}`}>
          <Layers size={12} aria-hidden />
          {nextQuiz.kind === "diagnostic" ? "Easy to hard" : `${DIFFICULTY_TEXT[nextQuiz.targetDifficulty]} level`}
        </span>
        <span className={`${styles.chip} ${styles.chipNeutral}`}>{plural(total, "question")}</span>
      </div>
      <Link href={nextQuiz.href} className={styles.primaryButton} style={{ width: "100%" }}>
        <Zap size={15} aria-hidden />
        {nextQuiz.kind === "diagnostic" ? "Start placement quiz" : "Start smart practice"}
      </Link>
    </section>
  );
}

function StrengthsCard({ overview }: { overview: AdaptiveOverview }) {
  return (
    <section className={styles.card} aria-labelledby="strengths-heading">
      <h2 id="strengths-heading" className={styles.cardTitle} style={{ marginBottom: 12 }}>
        Your strengths
      </h2>
      {overview.strengths.length === 0 ? (
        <p className={styles.muted}>Topics show up here once you reach 70% mastery. Keep going!</p>
      ) : (
        <ul className={styles.miniList}>
          {overview.strengths.map((s) => {
            const view = overview.skills.find((v) => v.skill === s.skill);
            return (
              <li key={s.skill} className={styles.miniItem}>
                <span className={`${styles.miniIcon} ${styles.iconGreen}`}>
                  <Trophy size={15} aria-hidden />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className={styles.miniName}>{s.label}</span>
                  <span className={styles.miniSub}>{view ? BAND_SHORT[view.band] : ""}</span>
                </span>
                <span className={styles.miniValue}>{s.score}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RevisionCard({ skills }: { skills: SkillMasteryView[] }) {
  const due = skills.filter((s) => s.revisionDue);
  if (due.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="revision-heading">
      <h2 id="revision-heading" className={styles.cardTitle}>
        Time to revise
      </h2>
      <p className={styles.cardLead} style={{ marginBottom: 12 }}>
        You know these well. A quick review keeps them fresh.
      </p>
      <ul className={styles.miniList}>
        {due.map((s) => (
          <li key={s.skill} className={styles.miniItem}>
            <span className={`${styles.miniIcon} ${styles.iconAmber}`}>
              <RotateCcw size={15} aria-hidden />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className={styles.miniName}>{s.label}</span>
              <span className={styles.miniSub}>
                {s.daysSincePractice === null ? "Not practised yet" : `Last practised ${s.daysSincePractice} days ago`}
              </span>
            </span>
            <Link href={s.practiceHref} className={styles.textLink}>
              Review <ArrowRight size={13} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Recommendations ──────────────────────────────────────────────────────── */

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const chip = RECOMMENDATION_CHIP[rec.type];
  return (
    <li className={styles.recCard}>
      <div className={styles.recTop}>
        <span className={`${styles.chip} ${chip.className}`}>{chip.text}</span>
        {rec.difficulty && rec.type !== "next-lesson" && (
          <span className={`${styles.chip} ${styles.chipNeutral}`}>{DIFFICULTY_TEXT[rec.difficulty]} level</span>
        )}
      </div>
      <h3 className={styles.recTitle}>{rec.title}</h3>
      <p className={styles.recWhy}>
        <strong>Why: </strong>
        {rec.reason}
      </p>
      <div className={styles.recActions}>
        {rec.actions.map((action, i) => (
          <Link
            key={action.href + action.label}
            href={action.href}
            className={`${i === 0 ? styles.primaryButton : styles.secondaryButton} ${styles.smallButton}`}
          >
            {action.kind === "lesson" ? <BookOpen size={14} aria-hidden /> : <Zap size={14} aria-hidden />}
            {action.label}
          </Link>
        ))}
      </div>
    </li>
  );
}

/* ── How it works ─────────────────────────────────────────────────────────── */

function HowItWorks({ overview }: { overview: AdaptiveOverview }) {
  return (
    <details className={`${styles.card} ${styles.howCard}`}>
      <summary className={styles.howSummary}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Lightbulb size={17} aria-hidden style={{ color: "#b45309" }} />
          How your mastery is measured
        </span>
        <ChevronDown size={17} className={styles.howChevron} aria-hidden />
      </summary>
      <div className={styles.howBody}>
        <div>
          <p className={styles.detailLabel} style={{ margin: "0 0 10px" }}>
            Levels
          </p>
          <ul className={styles.bandList}>
            {overview.policy.bands.map((b) => (
              <li key={b.id} className={styles.bandRow}>
                <span className={`${styles.bandSwatch} ${BAND_FILL[b.id]}`} />
                <span>{b.label}</span>
                <span className={styles.bandRange}>
                  {b.min}–{b.max}%
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className={styles.howList}>
          <li>Your score for each topic comes only from quizzes we mark: smart practice, lesson practice and the daily quiz.</li>
          <li>Recent answers count more than old ones, and getting a hard question right counts more than an easy one.</li>
          <li>
            A topic needs at least {plural(overview.policy.minEvidence, "answer")} before it gets a score, and one good quiz
            can&apos;t make you &ldquo;proficient&rdquo; on its own.
          </li>
          <li>Smart practice picks the questions for you: easier when a topic is hard, harder as you improve.</li>
        </ul>
      </div>
    </details>
  );
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div aria-hidden style={{ display: "grid", gap: 16 }}>
      <div className={styles.summary}>
        <div className={styles.skeleton} style={{ height: 290, borderRadius: 20 }} />
        <div className={styles.tiles}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.skeleton} style={{ height: 136 }} />
          ))}
        </div>
      </div>
      <div className={styles.focusGrid}>
        <div className={styles.skeleton} style={{ height: 360 }} />
        <div className={styles.skeleton} style={{ height: 360 }} />
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

type OverviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AdaptiveOverview };

interface ProgressState {
  data: AdaptiveProgress | null;
  error: string | null;
  loading: boolean;
}

export default function AdaptiveDashboard() {
  const { currentGrade, gradeReady } = useStudentContext();
  const [overview, setOverview] = useState<OverviewState>({ status: "loading" });
  const [progress, setProgress] = useState<ProgressState>({ data: null, error: null, loading: true });
  const [range, setRange] = useState<RangeDays>(30);
  const [reloadKey, setReloadKey] = useState(0);
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [showAllQuizzes, setShowAllQuizzes] = useState(false);

  useEffect(() => {
    if (!gradeReady) return;
    const controller = new AbortController();
    getData<AdaptiveOverview>("/api/student/adaptive-learning", controller.signal, "Your learning data couldn't be loaded.")
      .then((data) => setOverview({ status: "ready", data }))
      .catch((err) => {
        if (isAbort(err)) return;
        setOverview({ status: "error", message: err instanceof Error ? err.message : "Your learning data couldn't be loaded." });
      });
    return () => controller.abort();
  }, [gradeReady, currentGrade, reloadKey]);

  useEffect(() => {
    if (!gradeReady) return;
    const controller = new AbortController();
    getData<AdaptiveProgress>(
      `/api/student/adaptive-learning/progress?days=${range}`,
      controller.signal,
      "Your progress couldn't be loaded."
    )
      .then((data) => setProgress({ data, error: null, loading: false }))
      .catch((err) => {
        if (isAbort(err)) return;
        setProgress((p) => ({
          data: p.data,
          error: err instanceof Error ? err.message : "Your progress couldn't be loaded.",
          loading: false,
        }));
      });
    return () => controller.abort();
  }, [gradeReady, currentGrade, range, reloadKey]);

  const changeRange = (days: RangeDays) => {
    if (days === range) return;
    setProgress((p) => ({ ...p, loading: true }));
    setRange(days);
  };

  const retry = () => {
    setOverview({ status: "loading" });
    setProgress((p) => ({ ...p, error: null, loading: true }));
    setReloadKey((k) => k + 1);
  };

  const showTopic = (skill: string) => {
    setTopicFilter("all");
    setOpenTopic(skill);
    requestAnimationFrame(() =>
      document.getElementById(topicDomId(skill))?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const data = overview.status === "ready" ? overview.data : null;
  const progressData = progress.data;
  const nextQuiz = progressData?.nextQuiz ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <Link href="/student/dashboard" className={styles.backLink}>
            <ArrowLeft size={14} aria-hidden />
            My Learning
          </Link>
          <div className={styles.eyebrow}>
            <Route size={13} aria-hidden />
            Adaptive learning{data ? ` · ${gradeName(data.grade)}` : ""}
          </div>
          <h1 className={styles.title}>Your learning dashboard</h1>
          <p className={styles.subtitle}>
            See how you&apos;re growing, which topics need more work and what to practise next. It&apos;s built from your
            own quiz answers and updates every time you practise.
          </p>
        </div>
        {data?.status !== "unavailable" && (
          <div className={styles.headerActions}>
            <Link href={nextQuiz?.href ?? "/student/quiz/adaptive"} className={styles.primaryButton}>
              <Zap size={15} aria-hidden />
              {data?.status === "insufficient-data" ? "Start placement quiz" : "Start smart practice"}
            </Link>
          </div>
        )}
      </header>

      {overview.status === "loading" && <LoadingSkeleton />}

      {overview.status === "error" && (
        <div className={styles.errorBox} role="alert">
          <span>{overview.message}</span>
          <button type="button" className={styles.secondaryButton} onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {data?.status === "unavailable" && (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon} style={{ background: "#e0f2fe", color: "#0369a1" }}>
              <Info size={22} aria-hidden />
            </span>
            <p className={styles.emptyTitle}>Personalised practice isn&apos;t ready for your grade yet</p>
            <p className={styles.muted}>
              There are no practice questions for {gradeName(data.grade)} so far. Your lessons are still on My Learning.
            </p>
            <Link href="/student/dashboard" className={`${styles.secondaryButton} ${styles.smallButton}`}>
              Go to My Learning
            </Link>
          </div>
        </div>
      )}

      {data && data.status !== "unavailable" && (
        <>
          <Summary overview={data} progress={progressData} />

          {data.status === "insufficient-data" && (
            <div className={styles.notice}>
              <div className={styles.noticeBody}>
                <span className={styles.noticeIcon}>
                  <Compass size={22} aria-hidden />
                </span>
                <div>
                  <p className={styles.noticeTitle}>Let&apos;s find your starting point</p>
                  <p className={styles.noticeText}>
                    We need a few more answers before we can personalise your path (
                    {plural(data.summary.totalResponses, "answer")} so far). A 5-question placement quiz, from easy to
                    hard, is all it takes.
                  </p>
                </div>
              </div>
              <Link href="/student/quiz/adaptive" className={styles.primaryButton}>
                Take the placement quiz <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          )}

          <div className={styles.focusGrid}>
            <AttentionCard overview={data} onShowTopic={showTopic} />
            <div className={styles.sideStack}>
              {nextQuiz && <SmartPracticeCard nextQuiz={nextQuiz} />}
              <StrengthsCard overview={data} />
              <RevisionCard skills={data.skills} />
            </div>
          </div>

          {data.recommendationsLocked && (
            <section className={styles.section} aria-labelledby="recs-locked-heading">
              <div className={styles.sectionHead}>
                <div>
                  <h2 id="recs-locked-heading" className={styles.sectionTitle}>
                    <span className={styles.sectionTitleIcon}>
                      <Route size={16} aria-hidden />
                    </span>
                    Recommended next steps
                  </h2>
                  <p className={styles.sectionLead}>
                    Personalised next steps and Smart Practice come with the Core, Plus and Ultra memberships.{" "}
                    <Link href="/student/membership">See membership plans →</Link>
                  </p>
                </div>
              </div>
            </section>
          )}

          {data.recommendations.length > 0 && (
            <section className={styles.section} aria-labelledby="recs-heading">
              <div className={styles.sectionHead}>
                <div>
                  <h2 id="recs-heading" className={styles.sectionTitle}>
                    <span className={styles.sectionTitleIcon}>
                      <Route size={16} aria-hidden />
                    </span>
                    Recommended next steps
                  </h2>
                  <p className={styles.sectionLead}>Most important first. Each one says why it was picked for you.</p>
                </div>
              </div>
              <ul className={styles.recGrid}>
                {(showAllRecs ? data.recommendations : data.recommendations.slice(0, RECS_COLLAPSED)).map((rec) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </ul>
              {data.recommendations.length > RECS_COLLAPSED && (
                <button
                  type="button"
                  className={`${styles.ghostButton} ${styles.showMore}`}
                  onClick={() => setShowAllRecs((v) => !v)}
                  aria-expanded={showAllRecs}
                >
                  {showAllRecs ? "Show fewer" : `Show ${data.recommendations.length - RECS_COLLAPSED} more`}
                </button>
              )}
            </section>
          )}

          <section className={styles.section} aria-labelledby="progress-heading" aria-busy={progress.loading}>
            <div>
              <h2 id="progress-heading" className={styles.sectionTitle}>
                <span className={styles.sectionTitleIcon}>
                  <ChartLine size={16} aria-hidden />
                </span>
                Your progress
              </h2>
              <p className={styles.sectionLead}>How your mastery and practice have changed over time.</p>
            </div>

            <div className={styles.rangeControl} role="group" aria-label="Time range">
              {RANGES.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`${styles.rangeButton} ${days === range ? styles.rangeButtonActive : ""}`}
                  aria-pressed={days === range}
                  onClick={() => changeRange(days)}
                >
                  Last {days} days
                </button>
              ))}
            </div>

            {progress.error && (
              <div className={styles.errorBox} role="alert">
                <span>{progress.error}</span>
                <button type="button" className={styles.secondaryButton} onClick={retry}>
                  Try again
                </button>
              </div>
            )}

            {!progressData && progress.loading && (
              <div className={styles.chartGrid} aria-hidden>
                <div className={styles.skeleton} style={{ height: 340 }} />
                <div className={styles.skeleton} style={{ height: 340 }} />
              </div>
            )}

            {progressData && (
              <>
                <div className={`${styles.chartGrid} ${progress.loading ? styles.refetching : ""}`}>
                  <MasteryChart
                    history={progressData.masteryHistory}
                    bands={data.policy.bands}
                    historyFrom={progressData.historyFrom}
                  />
                  <ActivityChart activity={progressData.activity} totals={progressData.totals} />
                </div>

                <section
                  className={`${styles.card} ${progress.loading ? styles.refetching : ""}`}
                  aria-labelledby="quizzes-heading"
                >
                  <div className={styles.cardHead}>
                    <div>
                      <h3 id="quizzes-heading" className={styles.cardTitle}>
                        Recent quizzes
                      </h3>
                      <p className={styles.cardLead}>Your latest results and how each one moved your topic scores.</p>
                    </div>
                  </div>
                  {progressData.quizzes.length === 0 ? (
                    <p className={styles.muted}>No quizzes in the last {progressData.days} days.</p>
                  ) : (
                    <>
                      <QuizHistory
                        quizzes={showAllQuizzes ? progressData.quizzes : progressData.quizzes.slice(0, QUIZZES_COLLAPSED)}
                      />
                      {progressData.quizzes.length > QUIZZES_COLLAPSED && (
                        <button
                          type="button"
                          className={styles.ghostButton}
                          style={{ marginTop: 14 }}
                          onClick={() => setShowAllQuizzes((v) => !v)}
                          aria-expanded={showAllQuizzes}
                        >
                          {showAllQuizzes ? "Show fewer" : `Show ${progressData.quizzes.length - QUIZZES_COLLAPSED} more`}
                        </button>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </section>

          {progressData && progressData.mistakes.length > 0 && (
            <section className={styles.section} aria-labelledby="mistakes-heading">
              <div>
                <h2 id="mistakes-heading" className={styles.sectionTitle}>
                  <span className={styles.sectionTitleIcon} style={{ background: "#fef3c7", color: "#b45309" }}>
                    <Lightbulb size={16} aria-hidden />
                  </span>
                  Learn from your mistakes
                </h2>
                <p className={styles.sectionLead}>
                  Questions you missed and haven&apos;t got right since. Try them in your head first, then check.
                </p>
              </div>
              <MistakesReview mistakes={progressData.mistakes} />
            </section>
          )}

          <section className={styles.section} aria-labelledby="topics-heading">
            <div>
              <h2 id="topics-heading" className={styles.sectionTitle}>
                <span className={styles.sectionTitleIcon}>
                  <Layers size={16} aria-hidden />
                </span>
                All topics
              </h2>
              <p className={styles.sectionLead}>Open a topic to see its history and the level of your next questions.</p>
            </div>
            <TopicExplorer
              skills={data.skills}
              progress={progressData?.skills ?? []}
              bands={data.policy.bands}
              filter={topicFilter}
              onFilterChange={setTopicFilter}
              openSkill={openTopic}
              onOpenSkillChange={setOpenTopic}
            />
          </section>

          <HowItWorks overview={data} />
        </>
      )}
    </div>
  );
}
