"use client";

/**
 * /student/membership — the payer's billing home.
 *
 *  • What each learner on the account has (membership level, IntelliaPlay).
 *  • Their plans: renewal dates, cancel, change at the next renewal.
 *  • Buy: membership or IntelliaPlay, monthly/annual, auto-renew/pay once,
 *    for themselves and linked children, in their country's currency.
 *  • Family: link a child with the child's code, or get a code for a parent.
 *  • Payment history.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  INTELLIAPLAY_INFO,
  PAID_TIERS,
  TIER_INFO,
  extraSeatMinor,
  intervalLabel,
  planDisplayName,
  type BillingInterval,
  type BillingMode,
  type BillingProduct,
  type MembershipTier,
  type PlanTier,
} from "@intellia360/shared/billing/plans";
import { currencyExponent, formatMoney } from "@intellia360/shared/billing/currencies";
import type {
  BillingOverview,
  BillingSubscriptionView,
  FamilyLinkCode,
} from "@intellia360/shared/types/api/billing";
import RegionPicker from "@/components/billing/RegionPicker";
import { useCatalog } from "@/components/billing/useCatalog";
import {
  CheckoutDismissed,
  cancelSubscription,
  changeSubscription,
  createCheckout,
  createFamilyCode,
  fetchBillingOverview,
  linkFamilyMember,
  openRazorpayCheckout,
  planTotal,
  unlinkFamilyMember,
  useMembership,
  verifyCheckout,
  viewerLocale,
} from "@/lib/billing";
import "@/styles/billing.css";
import styles from "./membership.module.css";

type Notice = { kind: "ok" | "error" | "info"; text: string } | null;

const TIER_CHOICES = PAID_TIERS;

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(viewerLocale(), { day: "numeric", month: "short", year: "numeric" }) : "";

const money = (minor: number, currency: string) => formatMoney(minor, currency, viewerLocale(), { keepDecimals: true });

function tierLabel(tier: MembershipTier) {
  return TIER_INFO[tier].name;
}

function statusLine(sub: BillingSubscriptionView): { text: string; tone: "good" | "warn" | "muted" } {
  const end = date(sub.currentPeriodEnd);
  switch (sub.status) {
    case "ACTIVE":
      if (sub.mode === "PASS") return { text: end ? `Paid until ${end}` : "Active", tone: "good" };
      if (sub.cancelAtPeriodEnd) return { text: end ? `Cancelled — ends on ${end}` : "Cancelled", tone: "warn" };
      return { text: end ? `Renews on ${end}` : "Active", tone: "good" };
    case "AUTHENTICATED":
      if (sub.inTrial && sub.trialEndsAt) {
        return {
          text: `Free trial — ends on ${date(sub.trialEndsAt)}, then ${money(sub.amountMinor, sub.currency)} a ${intervalLabel(sub.interval)}`,
          tone: "good",
        };
      }
      return { text: "Set up — first charge pending", tone: "muted" };
    case "PENDING":
      return {
        text: `Renewal failed — access continues until ${date(sub.graceUntil) || "the retry period ends"} while the payment is retried`,
        tone: "warn",
      };
    case "HALTED":
      return { text: "Renewal failed — plan stopped. Buy again below to restore access.", tone: "warn" };
    case "CREATED":
      return { text: "Waiting for payment", tone: "muted" };
    case "CANCELLED":
      if (sub.trialEndsAt && sub.grantsAccess && end) {
        return { text: `Trial cancelled — access until ${end}. Nothing will be charged.`, tone: "muted" };
      }
      return { text: sub.grantsAccess && end ? `Cancelled — ends on ${end}` : "Ended", tone: "muted" };
    case "REFUNDED":
      return { text: "Refunded", tone: "muted" };
    default:
      return { text: "Ended", tone: "muted" };
  }
}

function useInitialChoice() {
  const params = useSearchParams();
  return useMemo(() => {
    const buy = params.get("buy")?.toUpperCase();
    const interval = params.get("interval")?.toUpperCase();
    const seats = Number(params.get("seats"));
    const trial = params.get("trial");
    const tier: PlanTier | null =
      buy === "CORE" || buy === "PLUS" || buy === "ULTRA" || buy === "INTELLIAPLAY" ? buy : null;
    return {
      tier,
      interval: interval === "MONTHLY" || interval === "ANNUAL" ? (interval as BillingInterval) : null,
      seats: Number.isInteger(seats) && seats > 0 ? seats : null,
      trial: trial === null ? null : trial === "1",
    };
  }, [params]);
}

export default function MembershipClient() {
  const initial = useInitialChoice();
  const { refresh: refreshAccess } = useMembership();
  const { catalog, error: catalogError, setCountry, setCurrency } = useCatalog();

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  // Buy form
  const [tier, setTier] = useState<PlanTier>(initial.tier ?? "PLUS");
  const [interval, setBillingInterval] = useState<BillingInterval>(initial.interval ?? "ANNUAL");
  const [mode, setMode] = useState<BillingMode>("AUTO_RENEW");
  // Start with the free trial when every chosen learner can have one.
  const [wantTrial, setWantTrial] = useState(initial.trial ?? true);
  // When the page opened: the first-charge date shown before checkout (the
  // server sets the real one when the trial starts).
  const [openedAt] = useState(() => Date.now());
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const buyRef = useRef<HTMLElement>(null);

  const product: BillingProduct = tier === "INTELLIAPLAY" ? "INTELLIAPLAY" : "MEMBERSHIP";

  const applyOverview = useCallback((res: Awaited<ReturnType<typeof fetchBillingOverview>>) => {
    if (!res.ok || !res.data) {
      setLoadError(res.message);
      return null;
    }
    setLoadError("");
    setOverview(res.data);
    return res.data;
  }, []);

  const reload = useCallback(() => fetchBillingOverview().then(applyOverview), [applyOverview]);

  useEffect(() => {
    void fetchBillingOverview().then(applyOverview);
  }, [applyOverview]);

  // Arriving from /pricing with a plan chosen: bring the buy panel into view, once.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!initial.tier || !overview || scrolled.current) return;
    scrolled.current = true;
    buyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initial.tier, overview]);

  const learners = useMemo(() => overview?.learners ?? [], [overview]);
  const children = learners.filter((l) => !l.self);
  const self = learners.find((l) => l.self);

  // Default learners: the linked children (or yourself when there are none),
  // trimmed to the number chosen on /pricing.
  const learnerIds = useMemo(() => {
    if (selected) return selected;
    const base = children.length > 0 ? children.map((c) => c.id) : self ? [self.id] : [];
    const max = catalog?.maxSeats ?? 4;
    return base.slice(0, Math.min(initial.seats ?? base.length, max));
  }, [selected, children, self, catalog?.maxSeats, initial.seats]);

  const toggleLearner = (id: string) => {
    const next = learnerIds.includes(id) ? learnerIds.filter((x) => x !== id) : [...learnerIds, id];
    setSelected(next);
  };

  const seats = learnerIds.length;
  const total = catalog && seats > 0 ? planTotal(catalog, tier, interval, seats) : null;
  const base = catalog?.prices.find((p) => p.tier === tier && p.interval === interval)?.amountMinor ?? null;
  const extra =
    base !== null && catalog?.currency
      ? extraSeatMinor(base, catalog.familyDiscountPercent, currencyExponent(catalog.currency))
      : null;

  const trialDays = catalog?.trialDays ?? 0;
  const trialOffered = trialDays > 0 && product === "MEMBERSHIP" && mode === "AUTO_RENEW";
  const usedTrial = learners.filter((l) => learnerIds.includes(l.id) && !l.trialEligible);
  const trialPossible = trialOffered && seats > 0 && usedTrial.length === 0;
  const trialOn = trialPossible && wantTrial;
  const firstCharge = new Date(openedAt + trialDays * 86_400_000).toISOString();

  const canBuy =
    overview?.billingEnabled === true &&
    overview.gatewayConfigured &&
    !!catalog?.currency &&
    seats > 0 &&
    seats <= (catalog?.maxSeats ?? 4) &&
    total !== null &&
    !busy;

  /** After a payment, wait (briefly) for Razorpay to confirm and access to switch on. */
  const waitForAccess = async (recordId: string) => {
    for (let i = 0; i < 6; i++) {
      const data = await reload();
      if (data?.subscriptions.find((s) => s.id === recordId)?.grantsAccess) return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const pay = async () => {
    if (!catalog?.currency || !canBuy) return;
    setBusy(true);
    setNotice({ kind: "info", text: "Opening secure payment…" });

    const session = await createCheckout({
      product,
      tier,
      interval,
      mode,
      learnerIds,
      country: catalog.country,
      currency: catalog.currency,
      trial: trialOn,
    });
    if (!session.ok || !session.data) {
      setNotice({ kind: "error", text: session.message });
      setBusy(false);
      return;
    }

    let result;
    try {
      result = await openRazorpayCheckout(session.data);
    } catch (err) {
      setNotice(
        err instanceof CheckoutDismissed
          ? { kind: "info", text: "Payment window closed. Nothing was charged." }
          : { kind: "error", text: (err as Error).message }
      );
      setBusy(false);
      void reload();
      return;
    }

    setNotice({ kind: "info", text: "Payment received. Confirming with Razorpay…" });
    const verified = await verifyCheckout({ recordId: session.data.recordId, ...result });
    if (!verified.ok) {
      setNotice({
        kind: "error",
        text: "Your payment went through but we couldn't confirm it yet. It will appear here within a few minutes — please don't pay again.",
      });
      setBusy(false);
      void reload();
      return;
    }

    const live = await waitForAccess(session.data.recordId);
    await refreshAccess();
    setSelected(null);
    const trialEnd = session.data.trialEndsAt;
    setNotice(
      trialEnd && live
        ? {
            kind: "ok",
            text: `Your free trial of ${planDisplayName(tier)} has started. Nothing is charged until ${date(trialEnd)} — cancel before then and you pay nothing.`,
          }
        : live
          ? { kind: "ok", text: `Thank you! ${planDisplayName(tier)} is now active.` }
          : { kind: "info", text: "Payment confirmed. Access switches on as soon as Razorpay confirms — usually within a minute." }
    );
    setBusy(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Membership</p>
          <h1 className={styles.title}>Plans & billing</h1>
          <p className={styles.lead}>
            Manage memberships and IntelliaPlay for you and your children.{" "}
            <Link href="/pricing">Compare plans →</Link>
          </p>
        </div>
      </header>

      {notice && (
        <p className={`${styles.notice} ${styles[`notice_${notice.kind}`]}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {loadError && <p className={`${styles.notice} ${styles.notice_error}`} role="alert">{loadError}</p>}
      {overview && !overview.billingEnabled && (
        <p className={`${styles.notice} ${styles.notice_info}`}>
          Memberships are not on sale yet. Until they are, every feature is open to every learner.
        </p>
      )}

      {/* WHO HAS WHAT */}
      <section className={styles.card} aria-labelledby="learners-title">
        <h2 id="learners-title" className={styles.cardTitle}>Learners on this account</h2>
        {!overview ? (
          <p className={styles.muted}>Loading…</p>
        ) : (
          <ul className={styles.learnerList}>
            {learners.map((l) => (
              <li key={l.id} className={styles.learnerRow}>
                <span className={styles.learnerName}>
                  {l.name}
                  {l.self && <span className={styles.muted}> (you)</span>}
                </span>
                <span className={`${styles.badge} ${l.membershipTier === "FREE" ? styles.badgeMuted : styles.badgeTier}`}>
                  {tierLabel(l.membershipTier)}
                </span>
                <span className={`${styles.badge} ${l.intelliaPlay ? styles.badgePlay : styles.badgeMuted}`}>
                  {l.intelliaPlay ? "IntelliaPlay" : "No IntelliaPlay"}
                </span>
                {!l.self && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${l.name} from your account? Plans you already bought for them keep running until they end.`)) return;
                      const res = await unlinkFamilyMember(l.id);
                      setNotice({ kind: res.ok ? "ok" : "error", text: res.ok ? `${l.name} was removed.` : res.message });
                      void reload();
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PLANS */}
      {overview && overview.subscriptions.length > 0 && (
        <section className={styles.card} aria-labelledby="plans-title">
          <h2 id="plans-title" className={styles.cardTitle}>Your plans</h2>
          <ul className={styles.planList}>
            {overview.subscriptions.map((sub) => (
              <PlanRow
                key={sub.id}
                sub={sub}
                learners={learners}
                onDone={async (n) => {
                  setNotice(n);
                  await reload();
                  await refreshAccess();
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {/* BUY */}
      <section ref={buyRef} className={styles.card} aria-labelledby="buy-title">
        <h2 id="buy-title" className={styles.cardTitle}>Buy a plan</h2>

        <div className={styles.field}>
          <span className={styles.label}>Plan</span>
          <div className={styles.choiceGrid} role="radiogroup" aria-label="Plan">
            {[...TIER_CHOICES, "INTELLIAPLAY" as const].map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tier === t}
                className={`${styles.choice} ${tier === t ? styles.choiceOn : ""}`}
                onClick={() => setTier(t)}
              >
                <strong>{t === "INTELLIAPLAY" ? `🎮 ${INTELLIAPLAY_INFO.name}` : TIER_INFO[t].name}</strong>
                <small>{t === "INTELLIAPLAY" ? "Add-on" : TIER_INFO[t].tagline}</small>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <span className={styles.label}>Billing period</span>
            <div className="billing-toggle" role="group" aria-label="Billing period">
              <button type="button" aria-pressed={interval === "MONTHLY"} onClick={() => setBillingInterval("MONTHLY")}>Monthly</button>
              <button type="button" aria-pressed={interval === "ANNUAL"} onClick={() => setBillingInterval("ANNUAL")}>Annually</button>
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Payment</span>
            <div className="billing-toggle" role="group" aria-label="Payment type">
              <button type="button" aria-pressed={mode === "AUTO_RENEW"} onClick={() => setMode("AUTO_RENEW")}>Auto-renew</button>
              <button type="button" aria-pressed={mode === "PASS"} onClick={() => setMode("PASS")}>Pay once</button>
            </div>
          </div>
        </div>
        <p className={styles.hint}>
          {mode === "AUTO_RENEW"
            ? `Charged every ${intervalLabel(interval)} until you cancel. Cancel any time and keep access until the period ends.`
            : `One payment for one ${intervalLabel(interval)}. Nothing renews; buy again whenever you like.`}
        </p>

        <div className={styles.field}>
          <span className={styles.label}>Who is it for?</span>
          {learners.length === 0 ? (
            <p className={styles.muted}>Loading…</p>
          ) : (
            <div className={styles.checkList}>
              {learners.map((l) => (
                <label key={l.id} className={styles.check}>
                  <input type="checkbox" checked={learnerIds.includes(l.id)} onChange={() => toggleLearner(l.id)} />
                  <span>
                    {l.name}
                    {l.self ? " (you)" : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
          {seats > (catalog?.maxSeats ?? 4) && (
            <p className={styles.errorText}>One purchase covers up to {catalog?.maxSeats ?? 4} learners.</p>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Where are you paying from?</span>
          <RegionPicker
            idPrefix="membership"
            country={catalog?.country ?? "IN"}
            currency={catalog?.currency ?? null}
            allowedCurrencies={catalog?.allowedCurrencies ?? []}
            onCountryChange={setCountry}
            onCurrencyChange={setCurrency}
            disabled={!catalog || busy}
          />
          {catalogError && <p className={styles.errorText}>{catalogError}</p>}
          {catalog && !catalog.currency && <p className={styles.errorText}>Plans are not on sale in this country yet.</p>}
        </div>

        {trialOffered && seats > 0 && (
          <div className={styles.field}>
            {trialPossible ? (
              <label className={styles.check}>
                <input type="checkbox" checked={wantTrial} onChange={(e) => setWantTrial(e.target.checked)} />
                <span>
                  Start with a {trialDays}-day free trial — nothing is charged until {date(firstCharge)}
                </span>
              </label>
            ) : (
              <p className={styles.hint}>
                {usedTrial.map((l) => l.name).join(", ")} already had a free trial or a membership, so this purchase
                starts paid. Choose other learners to use a trial.
              </p>
            )}
          </div>
        )}

        <div className={styles.summary}>
          <div>
            {catalog?.currency && base !== null && seats > 0 ? (
              <>
                {trialOn && (
                  <p className={styles.trialLine}>
                    Free for {trialDays} days, then from {date(firstCharge)}:
                  </p>
                )}
                <p className={styles.total}>
                  {total !== null ? money(total, catalog.currency) : "—"}
                  <span> / {intervalLabel(interval)}</span>
                </p>
                <p className={styles.muted}>
                  {planDisplayName(tier)} · {money(base, catalog.currency)} for the first learner
                  {seats > 1 && extra !== null
                    ? ` + ${seats - 1} × ${money(extra, catalog.currency)} (${catalog.familyDiscountPercent}% family discount)`
                    : ""}
                </p>
              </>
            ) : (
              <p className={styles.muted}>Choose at least one learner to see the price.</p>
            )}
          </div>
          <button type="button" className={styles.payButton} disabled={!canBuy} onClick={() => void pay()}>
            {busy ? "Please wait…" : trialOn ? "Start free trial" : "Pay securely"}
          </button>
        </div>
        {overview && overview.billingEnabled && !overview.gatewayConfigured && (
          <p className={styles.errorText}>Payments are being set up. Please check back soon.</p>
        )}
        <p className={styles.hint}>
          {catalog?.cardRequired
            ? "Outside India you pay by card"
            : "Pay by card, UPI, UPI Autopay or netbanking"}
          {trialOn
            ? catalog?.cardRequired
              ? " — a card is required to start the trial. Razorpay makes a small check, refunded at once."
              : " — a card or UPI Autopay is required to start the trial. Razorpay makes a small check, refunded at once."
            : "."}{" "}
          Payments are processed by Razorpay; your card and UPI details never reach Intellia360.
        </p>
      </section>

      {/* FAMILY */}
      <FamilyCard onChanged={async (n) => { setNotice(n); await reload(); }} />

      {/* PAYMENTS */}
      {overview && overview.payments.length > 0 && (
        <section className={styles.card} aria-labelledby="payments-title">
          <h2 id="payments-title" className={styles.cardTitle}>Payment history</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Reference</th>
                </tr>
              </thead>
              <tbody>
                {overview.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.date)}</td>
                    <td>{p.description}</td>
                    <td>{p.status === "REFUNDED" ? "−" : ""}{money(p.amountMinor, p.currency)}</td>
                    <td className={styles.mono}>{p.transactionId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── One plan ────────────────────────────────────────────────────────────────

function PlanRow({
  sub,
  learners,
  onDone,
}: {
  sub: BillingSubscriptionView;
  learners: BillingOverview["learners"];
  onDone: (notice: Notice) => Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newTier, setNewTier] = useState<PlanTier>(sub.tier);
  const [newLearners, setNewLearners] = useState<string[]>(sub.learners.map((l) => l.id));
  const status = statusLine(sub);

  const cancel = async () => {
    const end = date(sub.inTrial ? sub.trialEndsAt : sub.currentPeriodEnd);
    const question = sub.inTrial
      ? `Cancel your free trial of ${planDisplayName(sub.tier)}? Nothing will be charged${end ? ` and you keep access until ${end}` : ""}.`
      : `Stop auto-renewal of ${planDisplayName(sub.tier)}?${end ? ` You keep access until ${end}.` : ""}`;
    if (!window.confirm(question)) return;
    setBusy(true);
    const res = await cancelSubscription(sub.id);
    setBusy(false);
    await onDone({
      kind: res.ok ? "ok" : "error",
      text: res.ok ? (sub.inTrial ? "Free trial cancelled. You won't be charged." : "Auto-renewal cancelled.") : res.message,
    });
  };

  const change = async () => {
    setBusy(true);
    const res = await changeSubscription(sub.id, { tier: newTier, learnerIds: newLearners });
    setBusy(false);
    if (res.ok) setChanging(false);
    await onDone({
      kind: res.ok ? "ok" : "error",
      text: res.ok ? `Done. Your plan changes on ${date(sub.currentPeriodEnd) || "the next renewal"}.` : res.message,
    });
  };

  return (
    <li className={styles.planRow}>
      <div className={styles.planMain}>
        <p className={styles.planName}>
          {planDisplayName(sub.tier)}
          <span className={styles.muted}>
            {" "}· {sub.interval === "MONTHLY" ? "Monthly" : "Annual"} · {sub.mode === "AUTO_RENEW" ? "Auto-renew" : "Paid once"}
          </span>
        </p>
        <p className={styles.muted}>
          {money(sub.amountMinor, sub.currency)} / {intervalLabel(sub.interval)} · {sub.learners.map((l) => l.name).join(", ")}
        </p>
        <p className={`${styles.status} ${styles[`status_${status.tone}`]}`}>{status.text}</p>
        {sub.pendingChange && (
          <p className={styles.muted}>
            From the next renewal: {planDisplayName(sub.pendingChange.tier)} for {sub.pendingChange.seats} learner
            {sub.pendingChange.seats === 1 ? "" : "s"}, {money(sub.pendingChange.amountMinor, sub.currency)}.
          </p>
        )}
      </div>

      <div className={styles.planActions}>
        {sub.canChange && (
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setChanging((v) => !v)}>
            {changing ? "Close" : "Change plan"}
          </button>
        )}
        {sub.canCancel && (
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => void cancel()}>
            {sub.inTrial ? "Cancel free trial" : "Cancel auto-renewal"}
          </button>
        )}
      </div>

      {changing && (
        <div className={styles.changeBox}>
          {sub.product === "MEMBERSHIP" && (
            <label className={styles.field}>
              <span className={styles.label}>Level</span>
              <select className={styles.select} value={newTier} onChange={(e) => setNewTier(e.target.value as PlanTier)}>
                {TIER_CHOICES.map((t) => (
                  <option key={t} value={t}>{TIER_INFO[t].name}</option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.field}>
            <span className={styles.label}>Learners</span>
            <div className={styles.checkList}>
              {learners.map((l) => (
                <label key={l.id} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={newLearners.includes(l.id)}
                    onChange={() =>
                      setNewLearners((ids) => (ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id]))
                    }
                  />
                  <span>{l.name}{l.self ? " (you)" : ""}</span>
                </label>
              ))}
            </div>
          </div>
          <p className={styles.hint}>Changes start at your next renewal. Plans set up with UPI or a bank mandate can&apos;t be changed: cancel and buy the new plan instead.</p>
          <button type="button" className={styles.payButton} disabled={busy || newLearners.length === 0} onClick={() => void change()}>
            Save change
          </button>
        </div>
      )}
    </li>
  );
}

// ─── Family links ────────────────────────────────────────────────────────────

function FamilyCard({ onChanged }: { onChanged: (notice: Notice) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [myCode, setMyCode] = useState<FamilyLinkCode | null>(null);
  const [busy, setBusy] = useState(false);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const res = await linkFamilyMember(code.trim());
    setBusy(false);
    if (res.ok) setCode("");
    await onChanged({ kind: res.ok ? "ok" : "error", text: res.ok ? "Child linked. You can now buy plans for them." : res.message });
  };

  const getCode = async () => {
    setBusy(true);
    const res = await createFamilyCode();
    setBusy(false);
    if (res.ok && res.data) setMyCode(res.data);
    else await onChanged({ kind: "error", text: res.message });
  };

  return (
    <section className={styles.card} aria-labelledby="family-title">
      <h2 id="family-title" className={styles.cardTitle}>Family</h2>
      <div className={styles.familyGrid}>
        <form className={styles.familyBox} onSubmit={(e) => void link(e)}>
          <h3 className={styles.boxTitle}>Paying for a child?</h3>
          <p className={styles.muted}>
            On your child&apos;s account, open Membership and choose &quot;Get a link code&quot;. Enter that code here.
          </p>
          <div className={styles.inline}>
            <input
              className={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD-EFGH"
              aria-label="Child's link code"
              autoComplete="off"
              maxLength={12}
            />
            <button type="submit" className={styles.secondaryButton} disabled={busy || !code.trim()}>
              Link child
            </button>
          </div>
        </form>

        <div className={styles.familyBox}>
          <h3 className={styles.boxTitle}>Is a parent paying for you?</h3>
          <p className={styles.muted}>Get a code and give it to your parent. It works once and expires in 24 hours.</p>
          {myCode ? (
            <p className={styles.code}>
              <span className={styles.mono}>{myCode.code}</span>
              <small className={styles.muted}>expires {new Date(myCode.expiresAt).toLocaleString(viewerLocale())}</small>
            </p>
          ) : (
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void getCode()}>
              Get a link code
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
