"use client";

/**
 * Adaptive Learning — the student's learning path on the dashboard.
 *
 * Everything shown comes from GET /api/student/adaptive-learning, which works
 * from the student's own graded quiz answers. Nothing here is sample data:
 * with no answers yet the panel says so and offers the placement quiz.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useStudentContext } from "@/context/StudentContext";
import type {
  AdaptiveOverview,
  MasteryBandOrInsufficient,
  Recommendation,
  RecommendationType,
  SkillMasteryView,
} from "@intellia360/shared/types/api/adaptive-learning";
import styles from "./AdaptiveLearningPanel.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AdaptiveOverview };

const SKILLS_COLLAPSED = 6;

const TYPE_LABEL: Record<RecommendationType, { text: string; className: string }> = {
  diagnostic: { text: "Get started", className: styles.chipDiagnostic },
  remedial: { text: "Needs support", className: styles.chipRemedial },
  "targeted-practice": { text: "Practice", className: styles.chipPractice },
  "next-lesson": { text: "Next lesson", className: styles.chipLesson },
  revision: { text: "Revision", className: styles.chipRevision },
  challenge: { text: "Challenge", className: styles.chipChallenge },
};

const BAND_CLASS: Record<MasteryBandOrInsufficient, string> = {
  foundational: styles.bandFoundational,
  developing: styles.bandDeveloping,
  "nearly-proficient": styles.bandNearly,
  proficient: styles.bandProficient,
  "insufficient-data": styles.bandUnknown,
};

const TREND_TEXT: Record<SkillMasteryView["trend"], string | null> = {
  improving: "↑ improving",
  declining: "↓ slipping",
  steady: "→ steady",
  unknown: null,
};

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const type = TYPE_LABEL[rec.type];
  return (
    <li className={styles.rec}>
      <div className={styles.recTop}>
        <span className={`${styles.chip} ${type.className}`}>{type.text}</span>
        {rec.difficulty && rec.type !== "next-lesson" && (
          <span className={`${styles.chip} ${styles.chipLesson}`}>Level: {rec.difficulty}</span>
        )}
      </div>
      <h4 className={styles.recTitle}>{rec.title}</h4>
      <p className={styles.why}>
        <span className={styles.whyLabel}>Why: </span>
        {rec.reason}
      </p>
      <div className={styles.actions}>
        {rec.actions.map((action, i) => (
          <Link
            key={action.href + action.label}
            href={action.href}
            className={i === 0 ? styles.primaryAction : styles.secondaryAction}
          >
            {action.label} →
          </Link>
        ))}
      </div>
    </li>
  );
}

function SkillRow({ skill }: { skill: SkillMasteryView }) {
  const assessed = skill.score !== null;
  const trend = TREND_TEXT[skill.trend];
  return (
    <li className={styles.skillRow}>
      <div className={styles.skillHead}>
        <span className={styles.skillName}>{skill.label}</span>
        <span className={styles.skillScore}>{assessed ? `${skill.score}%` : "—"}</span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label={`${skill.label} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={skill.score ?? undefined}
        aria-valuetext={assessed ? `${skill.score}% — ${skill.bandLabel}` : "Not enough data yet"}
      >
        <div className={`${styles.barFill} ${BAND_CLASS[skill.band]}`} style={{ width: `${skill.score ?? 0}%` }} />
      </div>
      <div className={styles.skillMeta}>
        <span>{skill.bandLabel}</span>
        {assessed ? (
          <span>
            {skill.correctCount}/{skill.evidenceCount} correct · {skill.confidenceLabel} confidence
          </span>
        ) : (
          <span>
            {skill.evidenceCount} answer{skill.evidenceCount === 1 ? "" : "s"} so far
          </span>
        )}
        {trend && <span>{trend}</span>}
        {skill.revisionDue && <span className={styles.revisionTag}>Revision due</span>}
      </div>
    </li>
  );
}

function LoadingState() {
  return (
    <div className={styles.skeletonBlock} aria-hidden="true">
      <div className={styles.skeleton} style={{ width: "40%" }} />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} style={{ width: "85%" }} />
      <div className={styles.skeleton} style={{ width: "65%" }} />
    </div>
  );
}

export default function AdaptiveLearningPanel() {
  const { currentGrade, gradeReady } = useStudentContext();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllSkills, setShowAllSkills] = useState(false);

  useEffect(() => {
    if (!gradeReady) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await apiFetch("/api/student/adaptive-learning", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.data) {
          throw new Error(json?.message ?? "Your learning path couldn't be loaded.");
        }
        setState({ status: "ready", data: json.data as AdaptiveOverview });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Your learning path couldn't be loaded.",
        });
      }
    })();

    return () => controller.abort();
  }, [gradeReady, currentGrade, reloadKey]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  };

  const data = state.status === "ready" ? state.data : null;
  const summary = data?.summary;
  const skills = data?.skills ?? [];
  const visibleSkills = showAllSkills ? skills : skills.slice(0, SKILLS_COLLAPSED);

  return (
    <section className={styles.panel} aria-labelledby="adaptive-learning-heading" aria-busy={state.status === "loading"}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Adaptive Learning</div>
          <h2 id="adaptive-learning-heading" className={styles.title}>
            Your Learning Path
          </h2>
          <p className={styles.subtitle}>
            Built from your quiz answers — it updates every time you practise.
          </p>
        </div>

        <div className={styles.headerAside}>
          {summary && summary.overallMastery !== null && (
            <div className={styles.overall}>
              <span className={styles.overallValue}>{summary.overallMastery}%</span>
              <span className={styles.overallLabel}>
                overall
                <br />
                mastery
              </span>
            </div>
          )}
          <Link href="/student/adaptive-learning" className={styles.secondaryAction}>
            Open full dashboard →
          </Link>
        </div>
      </div>

      {state.status === "loading" && <LoadingState />}

      {state.status === "error" && (
        <div className={styles.errorBox} role="alert">
          <span>{state.message}</span>
          <button type="button" className={styles.retry} onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {data && data.status === "unavailable" && (
        <p className={styles.muted}>
          Personalised practice isn&apos;t available for your grade yet — there are no practice
          questions for it. Your lessons are still on the dashboard above.
        </p>
      )}

      {data && data.status !== "unavailable" && summary && (
        <>
          {data.status === "insufficient-data" && (
            <div className={styles.notice}>
              <strong>Let&apos;s find your starting point.</strong> We need a few quiz answers before we
              can personalise your path ({summary.totalResponses} so far). A 5-question placement quiz is
              all it takes.
            </div>
          )}

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {summary.assessedSkills}/{summary.totalSkills}
              </span>
              <span className={styles.statLabel}>Topics measured</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.proficientSkills}</span>
              <span className={styles.statLabel}>Proficient topics</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {summary.lessons.available ? `${summary.lessons.completed}/${summary.lessons.total}` : "—"}
              </span>
              <span className={styles.statLabel}>Lessons completed</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.revisionDue}</span>
              <span className={styles.statLabel}>
                Revision due{summary.streakDays > 0 ? ` · 🔥 ${summary.streakDays}-day streak` : ""}
              </span>
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.column}>
              <h3 className={styles.sectionTitle}>Recommended for you</h3>
              {data.recommendationsLocked ? (
                <p className={styles.muted}>
                  Personalised recommendations and Smart Practice come with the Core, Plus and Ultra
                  memberships.{" "}
                  <Link href="/student/membership" className={styles.linkButton}>
                    See plans →
                  </Link>
                </p>
              ) : data.recommendations.length === 0 ? (
                <p className={styles.muted}>
                  You&apos;re all caught up. Keep practising to keep your topics fresh.
                </p>
              ) : (
                <ul className={styles.recList}>
                  {data.recommendations.map((rec) => (
                    <RecommendationCard key={rec.id} rec={rec} />
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.column}>
              <h3 className={styles.sectionTitle}>Topic mastery</h3>
              {skills.length === 0 ? (
                <p className={styles.muted}>No topics to measure yet.</p>
              ) : (
                <>
                  <ul className={styles.skillList}>
                    {visibleSkills.map((skill) => (
                      <SkillRow key={skill.skill} skill={skill} />
                    ))}
                  </ul>
                  {skills.length > SKILLS_COLLAPSED && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setShowAllSkills((v) => !v)}
                      aria-expanded={showAllSkills}
                    >
                      {showAllSkills ? "Show fewer topics" : `Show all ${skills.length} topics`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {(data.strengths.length > 0 || data.needsWork.length > 0) && (
            <div className={styles.highlights}>
              <div className={styles.highlightBox}>
                <h3 className={styles.highlightTitle}>💪 Strengths</h3>
                {data.strengths.length ? (
                  <ul className={styles.tagList}>
                    {data.strengths.map((s) => (
                      <li key={s.skill} className={styles.tag}>
                        {s.label} · {s.score}%
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Keep practising — strengths show up at 70% and above.</p>
                )}
              </div>
              <div className={styles.highlightBox}>
                <h3 className={styles.highlightTitle}>🎯 Needs improvement</h3>
                {data.needsWork.length ? (
                  <ul className={styles.tagList}>
                    {data.needsWork.map((s) => (
                      <li key={s.skill} className={styles.tag}>
                        {s.label} · {s.score}%
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Nothing below 70% right now. 🎉</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
