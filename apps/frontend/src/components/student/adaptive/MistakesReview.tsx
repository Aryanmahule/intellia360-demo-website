"use client";

/**
 * Questions the student missed and hasn't got right since. The hint and the
 * answer stay folded so the student can have another go first.
 */

import Link from "next/link";
import { useState } from "react";
import { Eye, Lightbulb, Zap } from "lucide-react";
import type { MistakeToReview } from "@intellia360/shared/types/api/adaptive-learning";
import { relativeTime } from "./format";
import styles from "./AdaptiveDashboard.module.css";

const SOURCE_TEXT: Record<MistakeToReview["source"], string> = {
  adaptive: "Smart practice",
  daily: "Daily quiz",
  practice: "Practice",
  test: "Lesson test",
};

function MistakeCard({ mistake }: { mistake: MistakeToReview }) {
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <li className={styles.mistakeCard}>
      <div className={styles.mistakeTop}>
        <span className={`${styles.chip} ${styles.chipNeutral}`}>{mistake.skillLabel}</span>
        <span className={styles.quizMeta}>
          {SOURCE_TEXT[mistake.source]} · {relativeTime(mistake.missedAt)}
        </span>
      </div>

      <p className={styles.mistakeQuestion}>{mistake.question}</p>

      {showHint && mistake.hint && (
        <div className={`${styles.reveal} ${styles.revealHint}`}>
          <strong>Hint: </strong>
          {mistake.hint}
        </div>
      )}

      {showAnswer && (
        <div className={`${styles.reveal} ${styles.revealAnswer}`} aria-live="polite">
          <strong>Answer: {mistake.correctAnswer}</strong>
          {mistake.explanation}
        </div>
      )}

      <div className={styles.mistakeActions}>
        {mistake.hint && !showHint && !showAnswer && (
          <button type="button" className={styles.ghostButton} onClick={() => setShowHint(true)}>
            <Lightbulb size={14} aria-hidden />
            Show a hint
          </button>
        )}
        {!showAnswer && (
          <button type="button" className={styles.ghostButton} onClick={() => setShowAnswer(true)}>
            <Eye size={14} aria-hidden />
            Show the answer
          </button>
        )}
        <Link href={mistake.practiceHref} className={`${styles.secondaryButton} ${styles.smallButton}`}>
          <Zap size={14} aria-hidden />
          Practise {mistake.skillLabel.toLowerCase()}
        </Link>
      </div>
    </li>
  );
}

export default function MistakesReview({ mistakes }: { mistakes: MistakeToReview[] }) {
  return (
    <ul className={styles.mistakeGrid}>
      {mistakes.map((m) => (
        <MistakeCard key={m.questionId} mistake={m} />
      ))}
    </ul>
  );
}
