"use client";

/**
 * /admin/pricing — the price book. Administrators set the price of every plan
 * (Core, Plus, Ultra and the IntelliaPlay add-on; monthly and annual) in every
 * currency on sale, add or remove currencies, and set the family discount.
 *
 * Prices are for ONE learner; each extra learner gets the family discount.
 * A new price applies to new purchases only — existing subscribers keep theirs.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { IndianRupee } from "@/components/admin/icons";
import { apiFetch } from "@/lib/api";
import {
  BILLING_INTERVALS,
  INR_AUTODEBIT_LIMIT_MINOR,
  MAX_SEATS,
  MAX_TRIAL_DAYS,
  PRICED_PLANS,
  planDisplayName,
  seatTotalMinor,
  type BillingInterval,
  type PlanTier,
} from "@intellia360/shared/billing/plans";
import {
  CURRENCIES,
  FALLBACK_CURRENCY,
  SUPPORTED_CURRENCY_CODES,
  currencyExponent,
  formatMoney,
  minorToMajorString,
  toMinorUnits,
} from "@intellia360/shared/billing/currencies";
import { HOME_CURRENCY } from "@intellia360/shared/billing/countries";
import type { AdminPriceBook } from "@intellia360/shared/types/api/billing";

const cellKey = (tier: string, interval: string, currency: string) => `${tier}|${interval}|${currency}`;
const PERMANENT = new Set([HOME_CURRENCY, FALLBACK_CURRENCY]);

// admin.css redefines Tailwind's `.border` with a 0px width, so form fields
// set their border inline (as the invoice modal on /admin/payments does).
const FIELD: React.CSSProperties = { border: "1.5px solid #cbd5e1", background: "#ffffff" };

/** Major units for an input: "1799" for whole amounts, "47.99" otherwise. */
function toInput(amountMinor: number, currency: string): string {
  const unit = 10 ** currencyExponent(currency);
  return amountMinor % unit === 0 ? String(amountMinor / unit) : minorToMajorString(amountMinor, currency);
}

export default function AdminPricingPage() {
  const [book, setBook] = useState<AdminPriceBook | null>(null);
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [discount, setDiscount] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [addPick, setAddPick] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((data: AdminPriceBook) => {
    setBook(data);
    const next: Record<string, string> = {};
    for (const p of data.prices) next[cellKey(p.tier, p.interval, p.currency)] = toInput(p.amountMinor, p.currency);
    setValues(next);
    setAdded([]);
    setRemoved([]);
    setDiscount(String(data.familyDiscountPercent));
    setTrialDays(String(data.trialDays));
  }, []);

  useEffect(() => {
    apiFetch("/api/admin/billing/prices", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && json.data) apply(json.data as AdminPriceBook);
        else setLoadError(json?.message ?? "Could not load the price book.");
      })
      .catch(() => setLoadError("Could not load the price book."));
  }, [apply]);

  const saved = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of book?.prices ?? []) map.set(cellKey(p.tier, p.interval, p.currency), p.amountMinor);
    return map;
  }, [book]);

  const currencies = useMemo(() => {
    const onSale = [...new Set((book?.prices ?? []).map((p) => p.currency))];
    return [...onSale, ...added].filter((c) => !removed.includes(c)).sort((a, b) => {
      if (a === HOME_CURRENCY) return -1;
      if (b === HOME_CURRENCY) return 1;
      if (a === FALLBACK_CURRENCY) return -1;
      if (b === FALLBACK_CURRENCY) return 1;
      return a.localeCompare(b);
    });
  }, [book, added, removed]);

  const addable = SUPPORTED_CURRENCY_CODES.filter((c) => !currencies.includes(c));

  /** Invalid cells, and cells that differ from what is saved. */
  const { invalid, changes } = useMemo(() => {
    const bad = new Set<string>();
    const out: { product: string; tier: string; interval: string; currency: string; amount: string }[] = [];
    for (const currency of currencies) {
      for (const { product, tier } of PRICED_PLANS) {
        for (const interval of BILLING_INTERVALS) {
          const k = cellKey(tier, interval, currency);
          const text = values[k] ?? "";
          const minor = toMinorUnits(text, currency);
          if (minor === null || minor <= 0) {
            bad.add(k);
            continue;
          }
          if (saved.get(k) !== minor) out.push({ product, tier, interval, currency, amount: text });
        }
      }
    }
    return { invalid: bad, changes: out };
  }, [currencies, values, saved]);

  const discountNumber = Number(discount);
  const discountValid = Number.isInteger(discountNumber) && discountNumber >= 0 && discountNumber <= 90;
  const trialNumber = Number(trialDays);
  const trialValid = trialDays.trim() !== "" && Number.isInteger(trialNumber) && trialNumber >= 0 && trialNumber <= MAX_TRIAL_DAYS;
  const dirty =
    changes.length > 0 ||
    removed.length > 0 ||
    (book !== null && discountValid && discountNumber !== book.familyDiscountPercent) ||
    (book !== null && trialValid && trialNumber !== book.trialDays);

  // Indian mandates auto-debit only up to ₹15,000 a charge.
  const inrWarnings = useMemo(() => {
    if (!currencies.includes(HOME_CURRENCY) || !discountValid) return [];
    const out: string[] = [];
    for (const { tier } of PRICED_PLANS) {
      for (const interval of BILLING_INTERVALS) {
        const minor = toMinorUnits(values[cellKey(tier, interval, HOME_CURRENCY)] ?? "", HOME_CURRENCY);
        if (minor === null) continue;
        const family = seatTotalMinor(minor, MAX_SEATS, discountNumber, 2);
        if (family > INR_AUTODEBIT_LIMIT_MINOR) {
          out.push(
            `${planDisplayName(tier as PlanTier)} ${interval === "MONTHLY" ? "monthly" : "annual"} for ${MAX_SEATS} learners is ${formatMoney(family, "INR", "en-IN")} — above the ₹15,000 auto-debit limit, so those families can only pay once.`
          );
        }
      }
    }
    return out;
  }, [currencies, values, discountNumber, discountValid]);

  const save = async () => {
    if (invalid.size > 0 || !discountValid || !trialValid) {
      setMessage({ ok: false, text: "Fix the highlighted prices first: every plan needs a monthly and an annual price." });
      return;
    }
    if (removed.length > 0 && !window.confirm(`Take ${removed.join(", ")} off sale? Buyers who used it will be offered USD instead. Existing subscriptions keep running.`)) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/admin/billing/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, removeCurrencies: removed, familyDiscountPercent: discountNumber, trialDays: trialNumber }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data) {
        apply(json.data as AdminPriceBook);
        setMessage({ ok: true, text: json.message ?? "Prices saved." });
      } else {
        setMessage({ ok: false, text: json?.message ?? `Save failed (${res.status}).` });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the API." });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => book && apply(book);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <IndianRupee className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-orange-600">Finance & Billing</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Pricing</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Price of one learner for each plan, per currency. Extra learners get the family discount. New prices apply
              to new purchases only; current subscribers keep the price they signed up at.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="admin-btn-secondary" onClick={reset} disabled={!dirty || saving}>
              Discard
            </button>
            <button type="button" className="admin-btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save prices"}
            </button>
          </div>
        </div>

        {book && (
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className={`rounded-full px-3 py-1 ${book.billingEnabled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {book.billingEnabled ? "Sales open (BILLING_ENABLED=true)" : "Sales closed — BILLING_ENABLED is not true"}
            </span>
            <span className={`rounded-full px-3 py-1 ${book.gatewayConfigured ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {book.gatewayConfigured ? "Razorpay keys configured" : "Razorpay keys missing"}
            </span>
          </div>
        )}

        {message && (
          <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} role="status">
            {message.text}
          </p>
        )}
        {loadError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{loadError}</p>}

        <div className="admin-card p-5 space-y-3">
          <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700">
            Family discount on each learner after the first
            <input
              type="number"
              min={0}
              max={90}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-20 rounded-lg px-3 py-2"
              style={{ ...FIELD, borderColor: discountValid ? "#cbd5e1" : "#f87171" }}
              aria-label="Family discount percent"
            />
            %
          </label>
          <p className="text-xs text-slate-500">Up to {MAX_SEATS} learners per purchase. 0 turns the discount off.</p>
          <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700">
            Free trial for new members (Core, Plus, Ultra)
            <input
              type="number"
              min={0}
              max={MAX_TRIAL_DAYS}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="w-20 rounded-lg px-3 py-2"
              style={{ ...FIELD, borderColor: trialValid ? "#cbd5e1" : "#f87171" }}
              aria-label="Free trial days"
            />
            days
          </label>
          <p className="text-xs text-slate-500">
            One trial per learner. Buyers set up a payment method to start it (card only outside India) and are charged
            when it ends unless they cancel. 0 turns trials off.
          </p>
        </div>

        <div className="admin-card p-0 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3" rowSpan={2}>Currency</th>
                {PRICED_PLANS.map(({ tier }) => (
                  <th key={tier} className="px-2 py-2 text-center" colSpan={2}>
                    {planDisplayName(tier)}
                  </th>
                ))}
                <th className="px-2 py-3" rowSpan={2} />
              </tr>
              <tr className="bg-slate-50 text-xs text-slate-500">
                {PRICED_PLANS.flatMap(({ tier }) =>
                  BILLING_INTERVALS.map((interval: BillingInterval) => (
                    <th key={`${tier}-${interval}`} className="px-2 pb-2 text-center font-semibold">
                      {interval === "MONTHLY" ? "Monthly" : "Annual"}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {!book && !loadError && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={10}>Loading prices…</td>
                </tr>
              )}
              {currencies.map((currency) => (
                <tr key={currency} className="border-t border-slate-100">
                  <th scope="row" className="px-4 py-3 text-left">
                    <div className="font-bold text-slate-900">{currency}</div>
                    <div className="text-xs font-normal text-slate-500">{CURRENCIES[currency]?.name}</div>
                  </th>
                  {PRICED_PLANS.flatMap(({ tier }) =>
                    BILLING_INTERVALS.map((interval) => {
                      const k = cellKey(tier, interval, currency);
                      const bad = invalid.has(k);
                      const minor = toMinorUnits(values[k] ?? "", currency);
                      const changed = !bad && saved.get(k) !== minor;
                      return (
                        <td key={k} className="px-1.5 py-2">
                          <input
                            inputMode="decimal"
                            value={values[k] ?? ""}
                            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                            aria-label={`${planDisplayName(tier)} ${interval.toLowerCase()} price in ${currency}`}
                            className="w-full rounded-lg px-2 py-1.5 text-right font-semibold"
                            style={{
                              border: `1.5px solid ${bad ? "#f87171" : changed ? "#818cf8" : "#cbd5e1"}`,
                              background: bad ? "#fef2f2" : changed ? "#eef2ff" : "#ffffff",
                            }}
                          />
                        </td>
                      );
                    })
                  )}
                  <td className="px-2 py-2 text-right">
                    {!PERMANENT.has(currency) && (
                      <button
                        type="button"
                        className="text-xs font-bold text-red-600 hover:underline"
                        onClick={() =>
                          added.includes(currency)
                            ? setAdded((a) => a.filter((c) => c !== currency))
                            : setRemoved((r) => [...r, currency])
                        }
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin-card p-5 flex flex-wrap items-end gap-3" style={{ justifyContent: "flex-start" }}>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Add a currency
            <select
              value={addPick}
              onChange={(e) => setAddPick(e.target.value)}
              className="rounded-lg px-3 py-2"
              style={FIELD}
            >
              <option value="">Choose…</option>
              {addable.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCIES[c].name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={!addPick}
            onClick={() => {
              setRemoved((r) => r.filter((c) => c !== addPick));
              if (!currencies.includes(addPick)) setAdded((a) => [...a, addPick]);
              setAddPick("");
            }}
          >
            Add row
          </button>
          <p className="text-xs text-slate-500 basis-full">
            A currency goes on sale once all eight prices are filled in and saved. Buyers in a country whose currency is
            priced can choose it or USD; India always pays in INR.
            {removed.length > 0 && ` Will be removed on save: ${removed.join(", ")}.`}
          </p>
        </div>

        {inrWarnings.length > 0 && (
          <div className="admin-card p-5 space-y-1 border border-amber-200 bg-amber-50">
            {inrWarnings.map((w) => (
              <p key={w} className="text-sm text-amber-800">⚠️ {w}</p>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
