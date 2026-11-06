"use client";

/**
 * Public pricing page: Free, Core, Plus, Ultra and the IntelliaPlay add-on,
 * in the buyer's chosen country and currency, for 1–4 learners.
 *
 * Buying happens on /student/membership (signed in). The plan buttons link
 * there with the choice in the query string; a signed-out visitor goes through
 * /login and comes back to it.
 */
import React, { useState } from "react";
import Link from "next/link";
import {
  COMPARISON_ROWS,
  INTELLIAPLAY_INFO,
  PAID_TIERS,
  TIER_INFO,
  type BillingInterval,
  type MembershipTier,
  type PlanTier,
} from "@intellia360/shared/billing/plans";
import { currencyExponent, formatMoney } from "@intellia360/shared/billing/currencies";
import type { BillingCatalog } from "@intellia360/shared/types/api/billing";
import RegionPicker from "@/components/billing/RegionPicker";
import { useCatalog } from "@/components/billing/useCatalog";
import { planTotal, viewerLocale } from "@/lib/billing";
import "@/styles/billing.css";

const TIERS: MembershipTier[] = ["FREE", "CORE", "PLUS", "ULTRA"];

/** Largest saving of annual over 12 monthly payments, in whole percent. */
function annualSaving(catalog: BillingCatalog): number {
  let best = 0;
  for (const tier of [...PAID_TIERS, "INTELLIAPLAY" as const]) {
    const monthly = catalog.prices.find((p) => p.tier === tier && p.interval === "MONTHLY")?.amountMinor;
    const annual = catalog.prices.find((p) => p.tier === tier && p.interval === "ANNUAL")?.amountMinor;
    if (monthly && annual) best = Math.max(best, Math.floor((1 - annual / (monthly * 12)) * 100));
  }
  return best;
}

/** A year's price per month, kept to whole units when the price itself is whole (₹149, not ₹149.91). */
function perMonth(totalMinor: number, currency: string): number {
  const unit = 10 ** currencyExponent(currency);
  const monthly = Math.floor(totalMinor / 12);
  return totalMinor % unit === 0 ? Math.floor(monthly / unit) * unit : monthly;
}

function buyHref(tier: PlanTier, interval: BillingInterval, seats: number, trial = false) {
  return `/student/membership?buy=${tier}&interval=${interval}&seats=${seats}${trial ? "&trial=1" : ""}`;
}

function Price({
  catalog,
  tier,
  interval,
  seats,
}: {
  catalog: BillingCatalog;
  tier: PlanTier;
  interval: BillingInterval;
  seats: number;
}) {
  const total = planTotal(catalog, tier, interval, seats);
  if (total === null || !catalog.currency) return <p className="pricing-amount">—</p>;
  const locale = viewerLocale();
  return (
    <>
      <p className="pricing-amount">
        {formatMoney(total, catalog.currency, locale)}
        <span>/{interval === "MONTHLY" ? "month" : "year"}</span>
      </p>
      <p className="pricing-amount-note">
        {interval === "ANNUAL" ? `About ${formatMoney(perMonth(total, catalog.currency), catalog.currency, locale)} a month · ` : ""}
        {seats === 1 ? "1 learner" : `${seats} learners`}
      </p>
    </>
  );
}

export default function PricingClient() {
  const { catalog, error, loading, setCountry, setCurrency } = useCatalog();
  const [interval, setBillingInterval] = useState<BillingInterval>("ANNUAL");
  const [seats, setSeats] = useState(1);
  const saving = catalog ? annualSaving(catalog) : 0;
  const onSale = catalog?.billingEnabled === true && catalog.currency !== null;
  const trialDays = catalog?.trialDays ?? 0;
  const maxSeats = catalog?.maxSeats ?? 4;

  return (
    <>
      {/* HERO + CONTROLS */}
      <section className="site-hero pricing-hero" aria-labelledby="pricing-title">
        <div className="site-container">
          <div className="pricing-hero-head">
            <span className="site-eyebrow">💳 MEMBERSHIPS</span>
            <h1 id="pricing-title">
              Every lesson is free. <span>Membership makes it personal.</span>
            </h1>
            <p className="site-lead">
              Lessons, notes, videos, quizzes and games are free for every learner. Membership adds more AI
              Tutor time, a personalised Learning Path and bigger rewards. IntelliaPlay is a separate add-on.
            </p>
          </div>

          <div className="pricing-controls" aria-label="Pricing options">
            <RegionPicker
              idPrefix="pricing"
              country={catalog?.country ?? "IN"}
              currency={catalog?.currency ?? null}
              allowedCurrencies={catalog?.allowedCurrencies ?? []}
              onCountryChange={setCountry}
              onCurrencyChange={setCurrency}
              disabled={!catalog}
            />

            <div className="pricing-controls-row">
              <div className="billing-toggle" role="group" aria-label="Billing period">
                <button type="button" aria-pressed={interval === "MONTHLY"} onClick={() => setBillingInterval("MONTHLY")}>
                  Monthly
                </button>
                <button type="button" aria-pressed={interval === "ANNUAL"} onClick={() => setBillingInterval("ANNUAL")}>
                  Annually{saving > 0 && <small>save up to {saving}%</small>}
                </button>
              </div>

              <div className="billing-stepper" aria-label="Number of learners">
                <span>Learners</span>
                <button type="button" aria-label="One fewer learner" disabled={seats <= 1} onClick={() => setSeats((n) => n - 1)}>
                  −
                </button>
                <output aria-live="polite">{seats}</output>
                <button
                  type="button"
                  aria-label="One more learner"
                  disabled={seats >= maxSeats}
                  onClick={() => setSeats((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>

            {catalog && catalog.familyDiscountPercent > 0 && (
              <p className="pricing-family-note">
                👨‍👩‍👧 Family pricing: every learner after the first is {catalog.familyDiscountPercent}% off.
                Buying for more than {maxSeats}? <Link href="/support">Contact us</Link>.
              </p>
            )}
            {catalog && trialDays > 0 && (
              <p className="pricing-family-note">
                🎁 Memberships start with a {trialDays}-day free trial.{" "}
                {catalog.cardRequired
                  ? "A card is needed to start it"
                  : "A card or UPI Autopay is needed to start it"}
                , but nothing is charged until the trial ends — cancel before then and you pay nothing. One trial per
                learner.
              </p>
            )}
            {catalog && catalog.cardRequired && (
              <p className="pricing-family-note">💳 Outside India, memberships are paid by card.</p>
            )}
            {catalog && !catalog.currency && (
              <p className="pricing-alert">Memberships are not available in this country yet.</p>
            )}
            {catalog && !catalog.billingEnabled && (
              <p className="pricing-alert">Memberships open soon. Until then every feature is free for every learner.</p>
            )}
            {error && <p className="pricing-alert">{error}</p>}
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section className="site-section pricing-plans" aria-label="Membership plans" aria-busy={loading}>
        <div className="site-container">
          <div className="pricing-grid">
            {TIERS.map((tier) => {
              const info = TIER_INFO[tier];
              const featured = tier === "PLUS";
              return (
                <article key={tier} className={`pricing-card${featured ? " is-featured" : ""}`}>
                  {featured && <span className="pricing-badge">Most popular</span>}
                  <h2>{info.name}</h2>
                  <p className="pricing-tagline">{info.tagline}</p>

                  {tier === "FREE" ? (
                    <>
                      <p className="pricing-amount">{catalog?.currency ? formatMoney(0, catalog.currency, viewerLocale()) : "Free"}</p>
                      <p className="pricing-amount-note">No payment needed</p>
                    </>
                  ) : catalog ? (
                    <>
                      <Price catalog={catalog} tier={tier} interval={interval} seats={seats} />
                      {trialDays > 0 && <p className="pricing-trial">🎁 {trialDays}-day free trial</p>}
                    </>
                  ) : (
                    <p className="pricing-amount pricing-skeleton">&nbsp;</p>
                  )}

                  <ul className="pricing-list">
                    {info.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>

                  {tier === "FREE" ? (
                    <Link href="/register" className="site-btn site-btn--ghost pricing-cta">
                      Create a free account
                    </Link>
                  ) : onSale ? (
                    <Link
                      href={buyHref(tier, interval, seats, trialDays > 0)}
                      className={`site-btn ${featured ? "site-btn--primary" : "site-btn--ghost"} pricing-cta`}
                    >
                      {trialDays > 0 ? `Start ${trialDays}-day free trial` : `Choose ${info.name}`}
                    </Link>
                  ) : (
                    <span className="site-btn site-btn--ghost pricing-cta is-disabled" aria-disabled="true">
                      Available soon
                    </span>
                  )}
                </article>
              );
            })}
          </div>

          {/* INTELLIAPLAY ADD-ON */}
          <article className="pricing-addon" id="intelliaplay" aria-labelledby="addon-title">
            <div>
              <span className="site-kicker">Add-on</span>
              <h2 id="addon-title">🎮 {INTELLIAPLAY_INFO.name}</h2>
              <p>{INTELLIAPLAY_INFO.tagline}</p>
              <ul className="pricing-list">
                {INTELLIAPLAY_INFO.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div className="pricing-addon-buy">
              {catalog ? (
                <Price catalog={catalog} tier="INTELLIAPLAY" interval={interval} seats={seats} />
              ) : (
                <p className="pricing-amount pricing-skeleton">&nbsp;</p>
              )}
              {onSale ? (
                <Link href={buyHref("INTELLIAPLAY", interval, seats)} className="site-btn site-btn--primary pricing-cta">
                  Add IntelliaPlay
                </Link>
              ) : (
                <span className="site-btn site-btn--ghost pricing-cta is-disabled" aria-disabled="true">
                  Available soon
                </span>
              )}
            </div>
          </article>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="site-section is-white" aria-labelledby="compare-title">
        <div className="site-container">
          <div className="site-section-head">
            <span className="site-kicker">Compare</span>
            <h2 id="compare-title">
              What each level <span>includes</span>
            </h2>
          </div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {TIERS.map((t) => (
                    <th scope="col" key={t}>
                      {TIER_INFO[t].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {TIERS.map((t) => {
                      const v = row.values[t];
                      return (
                        <td key={t}>
                          {v === true ? (
                            <span className="pricing-yes" aria-label="Included">✓</span>
                          ) : v === false ? (
                            <span className="pricing-no" aria-label="Not included">—</span>
                          ) : (
                            v
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="site-section" aria-labelledby="pricing-faq-title">
        <div className="site-container">
          <div className="site-section-head">
            <span className="site-kicker">Questions</span>
            <h2 id="pricing-faq-title">
              Memberships, <span>answered</span>
            </h2>
          </div>
          <div className="site-faq">
            <details>
              <summary>Can I cancel any time?</summary>
              <p>
                Yes. Cancel from your membership page and the plan simply won&apos;t renew. You keep everything you paid
                for until the end of the current month or year.
              </p>
            </details>
            <details>
              <summary>What is the difference between auto-renew and pay once?</summary>
              <p>
                Auto-renew charges your card or UPI mandate at the start of each month or year until you cancel. Pay once
                covers one month or one year with a single payment and never charges you again; you can buy another
                period whenever you like.
              </p>
            </details>
            <details>
              <summary>How does family pricing work?</summary>
              <p>
                Each child links their own account to yours with a short code from their membership page. You then buy
                one plan for up to {maxSeats} children; every child after the first gets the family discount.
              </p>
            </details>
            <details>
              <summary>Which currencies can I pay in?</summary>
              <p>
                Pick your country above. Buyers in India pay in Indian rupees. Elsewhere you can pay in your local
                currency where we list one, or in US dollars.
              </p>
            </details>
            <details>
              <summary>Is IntelliaPlay included in a membership?</summary>
              <p>
                No. IntelliaPlay is a separate add-on: buy it on its own or together with any membership, for the
                children you choose.
              </p>
            </details>
            <details>
              <summary>How does the free trial work?</summary>
              <p>
                Choose Core, Plus or Ultra and start the {trialDays || 3}-day free trial. To start it you set up a payment
                method — a card, or in India a card or UPI Autopay — and Razorpay makes a small check that is refunded
                straight away. Nothing is charged during the trial. When it ends, the plan&apos;s price for your country
                is charged and the membership renews until you cancel. Cancel on your membership page before the trial
                ends and you won&apos;t be charged. Each learner can have one free trial.
              </p>
            </details>
            <details>
              <summary>Is my payment secure?</summary>
              <p>
                Payments are handled by Razorpay. Your card and UPI details go straight to Razorpay and are never stored
                by Intellia360. Questions about a payment? <Link href="/support">Contact support</Link>.
              </p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
