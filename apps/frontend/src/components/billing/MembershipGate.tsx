"use client";

/**
 * The student portal's paywall. Once sales are open, a learner without a
 * membership (trial, paid or given by an administrator) sees a "start your
 * free trial" card instead of the page, except on the pages they need to get
 * one. The API refuses the same learner's learning requests (requireMembership),
 * so this only decides what to show.
 */
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMembership } from "@/lib/billing";
import styles from "./MembershipGate.module.css";

/** Pages every signed-in learner can open, membership or not. */
const OPEN_PATHS = ["/student/membership", "/student/profile", "/student/notifications", "/student/demo-lessons"];

const isUnder = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export default function MembershipGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { access, loading } = useMembership();

  // Decide once the answer is known; if it can't be fetched the page shows and
  // its own API calls report the problem.
  if (loading) return null;
  if (!access || !access.billingEnabled || access.hasMembership) return <>{children}</>;
  if (OPEN_PATHS.some((p) => isUnder(pathname, p))) return <>{children}</>;
  if (access.intelliaPlay && isUnder(pathname, "/student/intelliaplay")) return <>{children}</>;

  return (
    <section className={styles.card} aria-labelledby="paywall-title">
      <div className={styles.icon} aria-hidden="true">🔒</div>
      <h1 id="paywall-title" className={styles.title}>
        Start your membership to keep learning
      </h1>
      <p className={styles.text}>
        Lessons, quizzes, games and the AI Tutor are part of an Intellia360 membership. Start with a free trial: nothing
        is charged until it ends, and you can cancel any time before then.
      </p>
      <div className={styles.actions}>
        <Link href="/student/membership" className={styles.primary}>
          Start free trial
        </Link>
        <Link href="/pricing" className={styles.secondary}>
          See plans and prices
        </Link>
      </div>
      <p className={styles.small}>
        At school? Your school can arrange access for you — ask your teacher.
      </p>
    </section>
  );
}
