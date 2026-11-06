"use client";

/** Recent graded quizzes, each with the mastery change it caused. */

import { ArrowDown, ArrowUp, CalendarCheck, ClipboardCheck, Compass, Minus, PencilLine, Sparkles, Target } from "lucide-react";
import type { QuizHistoryItem, QuizHistoryKind } from "@intellia360/shared/types/api/adaptive-learning";
import { relativeTime } from "./format";
import styles from "./AdaptiveDashboard.module.css";

const KIND: Record<QuizHistoryKind, { icon: typeof Sparkles; className: string; text: string }> = {
  placement: { icon: Compass, className: styles.iconViolet, text: "Placement" },
  smart: { icon: Sparkles, className: styles.iconBlue, text: "Smart practice" },
  topic: { icon: Target, className: styles.iconOrange, text: "Topic practice" },
  practice: { icon: PencilLine, className: styles.iconAmber, text: "Lesson practice" },
  daily: { icon: CalendarCheck, className: styles.iconGreen, text: "Daily quiz" },
  test: { icon: ClipboardCheck, className: styles.iconRed, text: "Lesson test" },
};

function MasteryDelta({ change }: { change: QuizHistoryItem["mastery"][number] }) {
  if (change.after === null) {
    return <span className={styles.delta}>{change.label}: measuring</span>;
  }
  if (change.before === null) {
    return (
      <span className={styles.delta}>
        {change.label}: first score {change.after}%
      </span>
    );
  }
  const diff = change.after - change.before;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  return (
    <span className={`${styles.delta} ${diff > 0 ? styles.deltaUp : diff < 0 ? styles.deltaDown : ""}`}>
      <Icon size={12} aria-hidden />
      {change.label} {change.before}% → {change.after}%
      <span className={styles.srOnly}>{diff > 0 ? `, up ${diff}` : diff < 0 ? `, down ${-diff}` : ", no change"}</span>
    </span>
  );
}

export default function QuizHistory({ quizzes }: { quizzes: QuizHistoryItem[] }) {
  return (
    <ul className={styles.quizList}>
      {quizzes.map((q) => {
        const kind = KIND[q.kind];
        const Icon = kind.icon;
        return (
          <li key={q.id} className={styles.quizRow}>
            <span className={`${styles.quizIcon} ${kind.className}`}>
              <Icon size={18} aria-hidden />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className={styles.quizTitle}>
                <span className={styles.srOnly}>{kind.text}: </span>
                {q.title}
              </p>
              <span className={styles.quizMeta}>{relativeTime(q.submittedAt)}</span>
              {q.mastery.length > 0 && (
                <div className={styles.deltaList}>
                  {q.mastery.map((m) => (
                    <MasteryDelta key={m.skill} change={m} />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.scorePill}>
              <span className={styles.scorePillValue}>{q.scorePercent}%</span>
              <span className={styles.scorePillSub}>
                {q.correct}/{q.total} correct
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
