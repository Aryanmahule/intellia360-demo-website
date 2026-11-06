"use client";

/**
 * /student/intelliaplay — the IntelliaPlay section, a separately paid add-on.
 *
 * Without the add-on the learner sees what it is, its price in their currency
 * and a way to buy it. With it (or while billing is switched off) the section
 * opens. The API checks the same thing: GET /api/student/intelliaplay answers
 * 402 without the add-on, and game routes added here use requireIntelliaPlay().
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { INTELLIAPLAY_INFO } from "@intellia360/shared/billing/plans";
import { formatMoney } from "@intellia360/shared/billing/currencies";
import { apiFetch } from "@/lib/api";
import { planTotal, viewerLocale } from "@/lib/billing";
import { useCatalog } from "@/components/billing/useCatalog";
import styles from "./intelliaplay.module.css";

type Gate = { state: "loading" } | { state: "open"; endsAt: string | null; billingEnabled: boolean } | { state: "locked" } | { state: "error" };

export default function IntelliaPlaySectionPage() {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const { catalog } = useCatalog();

  useEffect(() => {
    let live = true;
    apiFetch("/api/student/intelliaplay", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!live) return;
        if (res.status === 402) setGate({ state: "locked" });
        else if (res.ok && json?.success) {
          setGate({ state: "open", endsAt: json.data?.endsAt ?? null, billingEnabled: json.data?.billingEnabled === true });
        } else setGate({ state: "error" });
      })
      .catch(() => live && setGate({ state: "error" }));
    return () => {
      live = false;
    };
  }, []);

  const monthly = catalog?.currency ? planTotal(catalog, "INTELLIAPLAY", "MONTHLY", 1) : null;
  const annual = catalog?.currency ? planTotal(catalog, "INTELLIAPLAY", "ANNUAL", 1) : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>🎮 IntelliaPlay</span>
        <h1 className={styles.title}>IntelliaPlay</h1>
        <p className={styles.lead}>{INTELLIAPLAY_INFO.tagline}</p>
      </section>

      {gate.state === "loading" && <p className={styles.muted}>Checking your access…</p>}

      {gate.state === "error" && (
        <p className={styles.muted}>IntelliaPlay couldn&apos;t be opened right now. Please refresh the page to try again.</p>
      )}

      {gate.state === "locked" && (
        <section className={styles.lockCard} aria-labelledby="play-locked-title">
          <div className={styles.lockIcon} aria-hidden="true">🔒</div>
          <h2 id="play-locked-title" className={styles.cardTitle}>IntelliaPlay is an add-on</h2>
          <p className={styles.muted}>
            It isn&apos;t part of Free, Core, Plus or Ultra. Get it on its own or alongside any membership, for
            yourself or for each child you choose.
          </p>
          {catalog?.currency && monthly !== null && annual !== null && (
            <p className={styles.price}>
              {formatMoney(monthly, catalog.currency, viewerLocale())}/month
              <span> or {formatMoney(annual, catalog.currency, viewerLocale())}/year</span>
            </p>
          )}
          <div className={styles.actions}>
            <Link href="/student/membership?buy=INTELLIAPLAY&interval=ANNUAL" className={styles.primary}>
              Get IntelliaPlay
            </Link>
            <Link href="/pricing#intelliaplay" className={styles.secondary}>
              See all plans
            </Link>
          </div>
        </section>
      )}

      {gate.state === "open" && (
        <section className={styles.openCard} aria-labelledby="play-open-title">
          <h2 id="play-open-title" className={styles.cardTitle}>Welcome to IntelliaPlay</h2>
          {gate.billingEnabled && gate.endsAt && (
            <p className={styles.muted}>Your IntelliaPlay access runs until {new Date(gate.endsAt).toLocaleDateString(viewerLocale())}.</p>
          )}
          <div className={styles.empty}>
            <div aria-hidden="true" className={styles.emptyIcon}>🕹️</div>
            <p className={styles.emptyTitle}>IntelliaPlay games will appear here</p>
            <p className={styles.muted}>
              New IntelliaPlay challenges are added to this section as they are released. Until then, keep earning XP
              in your <Link href="/student/quiz">quizzes</Link> and the <Link href="/student/daily-quiz">Daily Quiz</Link>.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
