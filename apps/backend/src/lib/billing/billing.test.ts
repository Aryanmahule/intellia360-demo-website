import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { formatMoney, minorToMajorString, toMinorUnits } from "@intellia360/shared/billing/currencies";
import { allowedCurrencies, searchCountries } from "@intellia360/shared/billing/countries";
import { extraSeatMinor, seatTotalMinor } from "@intellia360/shared/billing/plans";
import { createFakeDb, type Row } from "@/lib/adaptive/test-support/fake-db";
import { hmacHex, verifyOrderSignature, verifySubscriptionSignature, verifyWebhookSignature } from "./signatures";
import {
  activePrices,
  applyPriceChanges,
  buildCatalog,
  completeCurrencies,
  currentPrices,
  ensurePriceBook,
  retireCurrency,
  setTrialDays,
} from "./catalog";
import { combineAccess, learnerAccess, membershipAccess, purchaseAccess, type SubscriptionRow } from "./access";
import { readPlans, salesOpen, savePlans } from "./state";
import { adminCancelPurchase, adminExtendPurchase, createGrantForAllLearners } from "./admin";
import { setSalesSwitch } from "./catalog";
import { consumeAllowance, releaseAllowance } from "./quota";
import { addInterval, subscriptionUpdate } from "./subscriptions";
import { billingOverview, cancelPurchase, schedulePlanChange, startCheckout, verifyCheckout } from "./checkout";
import { handleWebhook } from "./webhooks";
import { createLinkCode, linkWithCode } from "./family";
import { refundLedgerPayment } from "./refunds";
import { BillingError, type BillingDb, type BillingDeps } from "./deps";
import type { RazorpayClient, RazorpaySubscription } from "./razorpay";

const NOW = new Date("2026-10-29T10:00:00Z");
const DAY = 86_400_000;
const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

// ─── Fixtures ────────────────────────────────────────────────────────────────

function fakeRazorpay() {
  const subs = new Map<string, RazorpaySubscription>();
  let n = 0;
  const rp = {
    subs,
    plans: [] as { id: string; amount: number; currency: string }[],
    orders: new Map<string, { id: string; amount: number; currency: string; status: string }>(),
    createPlan: vi.fn(async (input: Parameters<RazorpayClient["createPlan"]>[0]) => {
      const plan = { id: `plan_${++n}`, period: input.period, interval: 1, item: input.item };
      rp.plans.push({ id: plan.id, amount: input.item.amount, currency: input.item.currency });
      return plan;
    }),
    createSubscription: vi.fn(async (input: { plan_id: string }) => {
      const sub: RazorpaySubscription = {
        id: `sub_${++n}`,
        plan_id: input.plan_id,
        status: "created",
        current_start: null,
        current_end: null,
        ended_at: null,
        charge_at: null,
        paid_count: 0,
        total_count: 10,
      };
      subs.set(sub.id, sub);
      return sub;
    }),
    fetchSubscription: vi.fn(async (id: string) => {
      const sub = subs.get(id);
      if (!sub) throw new Error("not found");
      return { ...sub };
    }),
    cancelSubscription: vi.fn(async (id: string, atCycleEnd: boolean) => {
      const sub = subs.get(id)!;
      if (!atCycleEnd) Object.assign(sub, { status: "cancelled", ended_at: unix(NOW) });
      return { ...sub };
    }),
    updateSubscription: vi.fn(async (id: string) => ({ ...subs.get(id)!, has_scheduled_changes: true })),
    createOrder: vi.fn(async (input: { amount: number; currency: string }) => {
      const order = { id: `order_${++n}`, amount: input.amount, currency: input.currency, status: "created" };
      rp.orders.set(order.id, order);
      return { ...order, amount_paid: 0, receipt: null };
    }),
    fetchOrder: vi.fn(async (id: string) => ({ ...rp.orders.get(id)!, amount_paid: 0, receipt: null })),
    fetchOrderPayments: vi.fn(async () => []),
    fetchPayment: vi.fn(async (id: string) => rp.payments.get(id)!),
    payments: new Map<string, Awaited<ReturnType<RazorpayClient["fetchPayment"]>>>(),
    refundPayment: vi.fn(async (id: string) => {
      const p = rp.payments.get(id)!;
      return { id: `rfnd_${++n}`, payment_id: id, amount: p.amount, currency: p.currency, status: "processed", created_at: unix(NOW) };
    }),
  };
  return rp;
}

function setup() {
  const fake = createFakeDb();
  const rp = fakeRazorpay();
  const deps: BillingDeps = {
    db: fake.db as unknown as BillingDb,
    razorpay: rp as unknown as RazorpayClient,
    now: () => NOW,
  };
  const users: Row[] = [
    { id: "parent", name: "Priya", email: "priya@example.com", role: "PARENT", deletedAt: null },
    { id: "kid1", name: "Aarav", email: "aarav@example.com", role: "STUDENT", deletedAt: null },
    { id: "kid2", name: "Diya", email: "diya@example.com", role: "STUDENT", deletedAt: null },
  ];
  fake.table("user").push(...users);
  fake.table("familyLink").push(
    { id: "l1", parentUserId: "parent", learnerUserId: "kid1" },
    { id: "l2", parentUserId: "parent", learnerUserId: "kid2" }
  );
  return { fake, rp, deps, payer: { userId: "parent", name: "Priya", email: "priya@example.com" } };
}

function sub(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "s1",
    payerUserId: "parent",
    product: "MEMBERSHIP",
    tier: "CORE",
    interval: "MONTHLY",
    mode: "AUTO_RENEW",
    currency: "INR",
    seats: 1,
    learnerIds: ["kid1"],
    priceId: "p1",
    amountMinor: 29900,
    gatewayId: "sub_x",
    razorpayPlanId: "plan_a",
    status: "ACTIVE",
    currentPeriodStart: new Date(NOW.getTime() - 10 * DAY),
    currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
    cancelAtPeriodEnd: false,
    graceUntil: null,
    pendingChange: null,
    lastSyncedAt: null,
    createdAt: new Date(NOW.getTime() - 10 * DAY),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.BILLING_ENABLED = "true";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  for (const k of ["BILLING_ENABLED", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) delete process.env[k];
});

// ─── Money and currencies ────────────────────────────────────────────────────

describe("money", () => {
  it("converts major to minor units per currency exponent", () => {
    expect(toMinorUnits("1799", "INR")).toBe(179900);
    expect(toMinorUnits("47.99", "USD")).toBe(4799);
    expect(toMinorUnits("47.9", "USD")).toBe(4790);
    expect(toMinorUnits("1,799", "INR")).toBe(179900);
    expect(toMinorUnits("99", "JPY")).toBe(99);
    expect(toMinorUnits("99.999", "KWD")).toBe(99999);
    expect(toMinorUnits("1.234", "USD")).toBeNull();
    expect(toMinorUnits("9.5", "JPY")).toBeNull();
    expect(toMinorUnits("-1", "USD")).toBeNull();
    expect(toMinorUnits("abc", "USD")).toBeNull();
  });

  it("formats minor units back", () => {
    expect(minorToMajorString(179900, "INR")).toBe("1799.00");
    expect(minorToMajorString(99999, "KWD")).toBe("99.999");
    expect(formatMoney(179900, "INR", "en-IN")).toBe("₹1,799");
    expect(formatMoney(4799, "USD", "en-US")).toBe("$47.99");
  });

  it("prices family seats: first full, the rest discounted", () => {
    expect(extraSeatMinor(419900, 25, 2)).toBe(314900); // ₹3,149 stays whole
    expect(seatTotalMinor(419900, 4, 25, 2)).toBe(1364600); // ₹13,646
    expect(seatTotalMinor(4799, 2, 25, 2)).toBe(4799 + 3599);
    expect(extraSeatMinor(17500, 25, 2)).toBe(13100); // AED 131
    expect(seatTotalMinor(4799, 1, 25, 2)).toBe(4799);
  });
});

describe("countries", () => {
  const priced = ["AED", "AUD", "CAD", "EUR", "GBP", "INR", "SGD", "USD"];
  it("India pays in INR only, everyone else in their currency or USD", () => {
    expect(allowedCurrencies("IN", priced)).toEqual(["INR"]);
    expect(allowedCurrencies("US", priced)).toEqual(["USD"]);
    expect(allowedCurrencies("GB", priced)).toEqual(["GBP", "USD"]);
    expect(allowedCurrencies("DE", priced)).toEqual(["EUR", "USD"]);
    expect(allowedCurrencies("JP", priced)).toEqual(["USD"]);
    expect(allowedCurrencies("IN", ["USD"])).toEqual([]);
  });

  it("finds countries by name or code for the picker", () => {
    expect(searchCountries("ind")[0].code).toBe("IN");
    expect(searchCountries("united").map((c) => c.code)).toEqual(expect.arrayContaining(["GB", "US", "AE"]));
    expect(searchCountries("GB")[0].code).toBe("GB");
    expect(searchCountries("").length).toBeGreaterThan(200);
  });
});

describe("signatures", () => {
  it("accepts Razorpay's signatures and rejects anything else", () => {
    const sig = hmacHex(KEY_SECRET, "pay_1|sub_1");
    expect(verifySubscriptionSignature({ paymentId: "pay_1", subscriptionId: "sub_1", signature: sig, keySecret: KEY_SECRET })).toBe(true);
    expect(verifySubscriptionSignature({ paymentId: "pay_1", subscriptionId: "sub_2", signature: sig, keySecret: KEY_SECRET })).toBe(false);
    const orderSig = hmacHex(KEY_SECRET, "order_1|pay_1");
    expect(verifyOrderSignature({ orderId: "order_1", paymentId: "pay_1", signature: orderSig, keySecret: KEY_SECRET })).toBe(true);
    expect(verifyOrderSignature({ orderId: "order_1", paymentId: "pay_1", signature: "zz", keySecret: KEY_SECRET })).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', hmacHex(WEBHOOK_SECRET, '{"a":1}'), WEBHOOK_SECRET)).toBe(true);
    expect(verifyWebhookSignature('{"a":2}', hmacHex(WEBHOOK_SECRET, '{"a":1}'), WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', null, WEBHOOK_SECRET)).toBe(false);
  });
});

// ─── Price book ──────────────────────────────────────────────────────────────

describe("price book", () => {
  it("seeds once, with every launch currency complete", async () => {
    const { deps, fake } = setup();
    await ensurePriceBook(deps.db);
    await ensurePriceBook(deps.db);
    expect(fake.table("planPrice")).toHaveLength(8 * 4 * 2);
    expect(completeCurrencies(await activePrices(deps.db))).toEqual(["AED", "AUD", "CAD", "EUR", "GBP", "INR", "SGD", "USD"]);
  });

  it("serves a country its allowed currency", async () => {
    const { deps } = setup();
    const india = await buildCatalog(deps.db, { country: "IN", currency: "USD" });
    expect(india.currency).toBe("INR");
    expect(india.allowedCurrencies).toEqual(["INR"]);
    expect(india.prices.find((p) => p.tier === "ULTRA" && p.interval === "ANNUAL")?.amountMinor).toBe(419900);
    expect(india.prices.find((p) => p.tier === "INTELLIAPLAY" && p.interval === "MONTHLY")?.amountMinor).toBe(19900);
    const uk = await buildCatalog(deps.db, { country: "GB", currency: "USD" });
    expect(uk.currency).toBe("USD");
    expect(uk.allowedCurrencies).toEqual(["GBP", "USD"]);
  });

  it("an admin edit versions the price and keeps the old row", async () => {
    const { deps, fake } = setup();
    await ensurePriceBook(deps.db);
    const changed = await applyPriceChanges(
      deps.db,
      [
        { product: "MEMBERSHIP", tier: "CORE", interval: "MONTHLY", currency: "INR", amount: "349" },
        { product: "MEMBERSHIP", tier: "PLUS", interval: "MONTHLY", currency: "INR", amount: "499" }, // unchanged
      ],
      "admin@example.com",
      NOW
    );
    expect(changed).toBe(1);
    const core = fake.table("planPrice").filter((r) => r.tier === "CORE" && r.interval === "MONTHLY" && r.currency === "INR");
    expect(core).toHaveLength(2);
    expect(core.find((r) => r.active)?.amountMinor).toBe(34900);
    expect(core.find((r) => r.active)?.version).toBe(2);
    expect(currentPrices(await activePrices(deps.db))).toHaveLength(64);
  });

  it("rejects bad prices and never removes INR or USD", async () => {
    const { deps } = setup();
    await ensurePriceBook(deps.db);
    await expect(
      applyPriceChanges(deps.db, [{ product: "MEMBERSHIP", tier: "CORE", interval: "MONTHLY", currency: "USD", amount: "7.999" }], "a", NOW)
    ).rejects.toBeInstanceOf(BillingError);
    await expect(
      applyPriceChanges(deps.db, [{ product: "MEMBERSHIP", tier: "SCIENCE", interval: "MONTHLY", currency: "USD", amount: "7" }], "a", NOW)
    ).rejects.toBeInstanceOf(BillingError);
    await expect(retireCurrency(deps.db, "INR", NOW)).rejects.toBeInstanceOf(BillingError);
    await expect(retireCurrency(deps.db, "USD", NOW)).rejects.toBeInstanceOf(BillingError);

    expect(await retireCurrency(deps.db, "SGD", NOW)).toBe(8);
    expect((await buildCatalog(deps.db, { country: "SG" })).allowedCurrencies).toEqual(["USD"]);
  });
});

// ─── Access ──────────────────────────────────────────────────────────────────

describe("access", () => {
  it("grants by status and period", () => {
    expect(purchaseAccess(sub({}), NOW).grants).toBe(true);
    // Renewal window: still active a day after the period ended.
    expect(purchaseAccess(sub({ currentPeriodEnd: new Date(NOW.getTime() - DAY) }), NOW).grants).toBe(true);
    expect(purchaseAccess(sub({ currentPeriodEnd: new Date(NOW.getTime() - 3 * DAY) }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ status: "PENDING", graceUntil: new Date(NOW.getTime() + DAY) }), NOW).grants).toBe(true);
    expect(purchaseAccess(sub({ status: "PENDING", graceUntil: new Date(NOW.getTime() - DAY) }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ status: "HALTED" }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ status: "AUTHENTICATED" }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ status: "CANCELLED" }), NOW).grants).toBe(true); // paid period continues
    expect(purchaseAccess(sub({ status: "CANCELLED", currentPeriodEnd: NOW }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ mode: "PASS", currentPeriodStart: new Date(NOW.getTime() + DAY) }), NOW).grants).toBe(false);
    expect(purchaseAccess(sub({ mode: "PASS", status: "REFUNDED" }), NOW).grants).toBe(false);
  });

  it("takes the highest level and IntelliaPlay separately", () => {
    const access = combineAccess(
      [sub({ tier: "CORE" }), sub({ id: "s2", tier: "INTELLIAPLAY", product: "INTELLIAPLAY" })],
      [{ id: "g", userId: "kid1", product: "MEMBERSHIP", tier: "ULTRA", validUntil: new Date(NOW.getTime() + DAY), revokedAt: null }],
      NOW
    );
    expect(access.tier).toBe("ULTRA");
    expect(access.intelliaPlay).toBe(true);
    const none = combineAccess(
      [sub({ status: "EXPIRED" })],
      [{ id: "g", userId: "kid1", product: "MEMBERSHIP", tier: "ULTRA", validUntil: new Date(NOW.getTime() - 1), revokedAt: null }],
      NOW
    );
    expect(none).toEqual({ tier: "FREE", intelliaPlay: false, membershipEndsAt: null, intelliaPlayEndsAt: null });
  });

  it("reads purchases covering the learner from the database", async () => {
    const { deps, fake } = setup();
    fake.table("membershipSubscription").push(sub({ learnerIds: ["kid1", "kid2"], tier: "PLUS" }) as unknown as Row);
    expect((await learnerAccess(deps.db, "kid2", NOW)).tier).toBe("PLUS");
    expect((await learnerAccess(deps.db, "parent", NOW)).tier).toBe("FREE");
  });
});

describe("daily allowance", () => {
  it("stops at the limit and can give one back", async () => {
    const { deps } = setup();
    const args = { userId: "kid1", feature: "ai-tutor", periodKey: "2026-10-29", limit: 2 };
    expect((await consumeAllowance(deps.db, args)).allowed).toBe(true);
    expect((await consumeAllowance(deps.db, args)).allowed).toBe(true);
    expect(await consumeAllowance(deps.db, args)).toEqual({ allowed: false, used: 2 });
    await releaseAllowance(deps.db, args);
    expect((await consumeAllowance(deps.db, args)).allowed).toBe(true);
    expect((await consumeAllowance(deps.db, { ...args, limit: null })).allowed).toBe(true);
    expect((await consumeAllowance(deps.db, { ...args, periodKey: "2026-10-30" })).used).toBe(1);
  });
});

// ─── Razorpay state ──────────────────────────────────────────────────────────

describe("subscription sync", () => {
  const entity = (over: Partial<RazorpaySubscription>): RazorpaySubscription => ({
    id: "sub_x",
    plan_id: "plan_a",
    status: "active",
    current_start: unix(NOW),
    current_end: unix(new Date(NOW.getTime() + 30 * DAY)),
    ended_at: null,
    charge_at: null,
    paid_count: 1,
    total_count: 120,
    ...over,
  });

  it("maps status and period, and starts a grace period on failure", () => {
    const active = subscriptionUpdate(sub({ status: "CREATED" }), entity({}), NOW);
    expect(active.status).toBe("ACTIVE");
    expect(active.currentPeriodEnd).toEqual(new Date(unix(new Date(NOW.getTime() + 30 * DAY)) * 1000));
    const pending = subscriptionUpdate(sub({}), entity({ status: "pending" }), NOW);
    expect(pending.graceUntil).toEqual(new Date(NOW.getTime() + 7 * DAY));
    const recovered = subscriptionUpdate(sub({ status: "PENDING", graceUntil: NOW }), entity({}), NOW);
    expect(recovered.graceUntil).toBeNull();
  });

  it("never re-opens a finished purchase and ends an immediate cancel at once", () => {
    expect(subscriptionUpdate(sub({ status: "CANCELLED" }), entity({ status: "active" }), NOW).status).toBe("CANCELLED");
    const cancelled = subscriptionUpdate(sub({}), entity({ status: "cancelled", ended_at: unix(NOW) }), NOW);
    expect(cancelled.currentPeriodEnd).toEqual(new Date(unix(NOW) * 1000));
  });

  it("applies a scheduled change once Razorpay is on the new plan", () => {
    const change = { tier: "ULTRA", priceId: "p9", razorpayPlanId: "plan_b", seats: 2, learnerIds: ["kid1", "kid2"], amountMinor: 734800 };
    const before = subscriptionUpdate(sub({ pendingChange: change }), entity({ plan_id: "plan_a" }), NOW);
    expect(before.tier).toBeUndefined();
    const after = subscriptionUpdate(sub({ pendingChange: change }), entity({ plan_id: "plan_b" }), NOW);
    expect(after).toMatchObject({ tier: "ULTRA", seats: 2, learnerIds: ["kid1", "kid2"], pendingChange: null });
  });

  it("adds months without overflowing short months", () => {
    expect(addInterval(new Date("2026-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addInterval(new Date("2026-03-15T00:00:00Z"), "ANNUAL").toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });
});

// ─── Checkout ────────────────────────────────────────────────────────────────

describe("checkout", () => {
  const request = {
    product: "MEMBERSHIP" as const,
    tier: "ULTRA" as const,
    interval: "ANNUAL" as const,
    mode: "AUTO_RENEW" as const,
    learnerIds: ["kid1", "kid2"],
    country: "IN",
    currency: "INR",
  };

  it("charges the server's family price and creates one plan per seat count", async () => {
    const { deps, rp, fake, payer } = setup();
    const session = await startCheckout(deps, payer, request);
    expect(session.kind).toBe("subscription");
    expect(session.amountMinor).toBe(419900 + 314900);
    expect(rp.plans).toEqual([{ id: "plan_1", amount: 734800, currency: "INR" }]);
    expect(fake.table("membershipSubscription")[0]).toMatchObject({ seats: 2, learnerIds: ["kid1", "kid2"], status: "CREATED" });
    expect(fake.table("billingProfile")[0]).toMatchObject({ userId: "parent", country: "IN", currency: "INR" });

    // The same seat count reuses the Razorpay plan.
    await startCheckout(deps, payer, { ...request, learnerIds: ["kid1", "parent"] }).catch(() => undefined);
    expect(rp.createPlan).toHaveBeenCalledTimes(1);
  });

  it("refuses wrong currencies, strangers, closed sales and a second auto-renew plan", async () => {
    const { deps, fake, payer } = setup();
    await expect(startCheckout(deps, payer, { ...request, currency: "USD" })).rejects.toThrow(/cannot pay in USD/);
    await expect(startCheckout(deps, payer, { ...request, learnerIds: ["stranger"] })).rejects.toMatchObject({ status: 403 });

    await startCheckout(deps, payer, request);
    fake.table("membershipSubscription")[0].status = "ACTIVE";
    await expect(startCheckout(deps, payer, { ...request, learnerIds: ["kid2"] })).rejects.toMatchObject({ status: 409 });
    // IntelliaPlay is a separate product: allowed alongside.
    await expect(
      startCheckout(deps, payer, { ...request, product: "INTELLIAPLAY", tier: "INTELLIAPLAY", learnerIds: ["kid2"] })
    ).resolves.toMatchObject({ kind: "subscription" });

    process.env.BILLING_ENABLED = "false";
    await expect(startCheckout(deps, payer, request)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps INR auto-renew charges under the ₹15,000 mandate limit", async () => {
    const { deps, payer } = setup();
    await ensurePriceBook(deps.db);
    await applyPriceChanges(deps.db, [{ product: "MEMBERSHIP", tier: "ULTRA", interval: "ANNUAL", currency: "INR", amount: "9999" }], "a", NOW);
    await expect(startCheckout(deps, payer, request)).rejects.toThrow(/Pay once/);
    await expect(startCheckout(deps, payer, { ...request, mode: "PASS" })).resolves.toMatchObject({ kind: "order" });
  });

  it("verifies a pass payment, starts it and records it once", async () => {
    const { deps, rp, fake, payer } = setup();
    const session = await startCheckout(deps, payer, { ...request, mode: "PASS", learnerIds: ["kid1"], country: "GB", currency: "GBP" });
    rp.payments.set("pay_1", {
      id: "pay_1", amount: session.amountMinor, currency: "GBP", status: "captured", order_id: session.orderId!,
      invoice_id: null, method: "card", base_amount: 820000, base_currency: "INR", created_at: unix(NOW),
    });

    await expect(
      verifyCheckout(deps, payer, { recordId: session.recordId, razorpay_payment_id: "pay_1", razorpay_signature: "0".repeat(64) })
    ).rejects.toMatchObject({ status: 400 });

    const signature = hmacHex(KEY_SECRET, `${session.orderId}|pay_1`);
    const record = await verifyCheckout(deps, payer, { recordId: session.recordId, razorpay_payment_id: "pay_1", razorpay_signature: signature });
    expect(record.status).toBe("ACTIVE");
    expect(record.currentPeriodEnd?.toISOString()).toBe("2027-10-29T10:00:00.000Z");
    await verifyCheckout(deps, payer, { recordId: session.recordId, razorpay_payment_id: "pay_1", razorpay_signature: signature });
    const ledger = fake.table("payment");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ transactionId: "pay_1", currency: "GBP", amountMinor: 7799, amount: 8200, kind: "PASS" });
    expect((await learnerAccess(deps.db, "kid1", NOW)).tier).toBe("ULTRA");
  });

  it("another payer cannot verify someone else's purchase", async () => {
    const { deps, payer } = setup();
    const session = await startCheckout(deps, payer, request);
    await expect(
      verifyCheckout(deps, { userId: "kid1", name: "A", email: "a@x" }, {
        recordId: session.recordId, razorpay_payment_id: "pay_1", razorpay_signature: "0".repeat(64),
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("cancels at the period end and schedules a change for the renewal", async () => {
    const { deps, rp, fake, payer } = setup();
    const session = await startCheckout(deps, payer, { ...request, learnerIds: ["kid1"], tier: "PLUS" });
    const s = rp.subs.get(session.subscriptionId!)!;
    Object.assign(s, { status: "active", current_start: unix(NOW), current_end: unix(new Date(NOW.getTime() + 365 * DAY)) });
    fake.table("membershipSubscription")[0].status = "ACTIVE";

    // A level that is off sale can't be switched to.
    await expect(schedulePlanChange(deps, payer, session.recordId, { tier: "CORE", learnerIds: ["kid1"] })).rejects.toThrow(/not on sale/);
    const changed = await schedulePlanChange(deps, payer, session.recordId, { tier: "ULTRA", learnerIds: ["kid1", "kid2"] });
    expect(changed.pendingChange).toMatchObject({ tier: "ULTRA", seats: 2, amountMinor: 419900 + 314900 });
    expect(rp.updateSubscription).toHaveBeenCalledWith(session.subscriptionId, expect.objectContaining({ schedule_change_at: "cycle_end" }));

    const cancelled = await cancelPurchase(deps, payer, session.recordId);
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(rp.cancelSubscription).toHaveBeenCalledWith(session.subscriptionId, true);
    expect(purchaseAccess(cancelled, NOW).grants).toBe(true);
  });
});

// ─── Webhooks ────────────────────────────────────────────────────────────────

describe("webhooks", () => {
  async function activeSubscription() {
    const ctx = setup();
    const session = await startCheckout(ctx.deps, ctx.payer, {
      product: "INTELLIAPLAY", tier: "INTELLIAPLAY", interval: "MONTHLY", mode: "AUTO_RENEW",
      learnerIds: ["kid1"], country: "US", currency: "USD",
    });
    Object.assign(ctx.rp.subs.get(session.subscriptionId!)!, {
      status: "active", current_start: unix(NOW), current_end: unix(new Date(NOW.getTime() + 30 * DAY)),
    });
    return { ...ctx, session };
  }

  const charged = (subscriptionId: string, paymentId: string) =>
    JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: subscriptionId, status: "active" } },
        payment: { entity: { id: paymentId, amount: 499, currency: "USD", status: "captured", order_id: null, invoice_id: "inv_1", created_at: unix(NOW) } },
      },
    });

  it("applies a charge once, however often it is delivered", async () => {
    const { deps, fake, session } = await activeSubscription();
    const body = charged(session.subscriptionId!, "pay_9");
    const signature = hmacHex(WEBHOOK_SECRET, body);

    expect(await handleWebhook(deps, { rawBody: body, signature, eventId: "evt_1" })).toEqual({ status: 200, message: "PROCESSED" });
    expect(await handleWebhook(deps, { rawBody: body, signature, eventId: "evt_1" })).toEqual({ status: 200, message: "Duplicate" });
    expect(fake.table("membershipSubscription")[0].status).toBe("ACTIVE");
    expect(fake.table("payment")).toHaveLength(1);
    expect(fake.table("payment")[0]).toMatchObject({ amount: 0, currency: "USD", amountMinor: 499 });
    expect((await learnerAccess(deps.db, "kid1", NOW)).intelliaPlay).toBe(true);
    // A different event for the same payment still records it only once.
    const again = charged(session.subscriptionId!, "pay_9");
    await handleWebhook(deps, { rawBody: again, signature: hmacHex(WEBHOOK_SECRET, again), eventId: "evt_2" });
    expect(fake.table("payment")).toHaveLength(1);
  });

  it("rejects a bad signature and retries a failed delivery", async () => {
    const { deps, rp, fake, session } = await activeSubscription();
    const body = charged(session.subscriptionId!, "pay_10");
    expect((await handleWebhook(deps, { rawBody: body, signature: "ab".repeat(32), eventId: "evt_3" })).status).toBe(400);

    // First delivery: Razorpay unreachable (falls back to the payload) and the
    // database write fails, so the event is marked FAILED and Razorpay retries.
    rp.fetchSubscription.mockRejectedValueOnce(new Error("network"));
    const failingDb = new Proxy(deps.db, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (prop !== "membershipSubscription") return value;
        return {
          ...value,
          update: async () => {
            throw new Error("database down");
          },
        };
      },
    });

    const signature = hmacHex(WEBHOOK_SECRET, body);
    const first = await handleWebhook({ ...deps, db: failingDb }, { rawBody: body, signature, eventId: "evt_4" });
    expect(first.status).toBe(500);
    expect(fake.table("webhookEvent").find((e) => e.eventId === "evt_4")?.status).toBe("FAILED");
    expect((await handleWebhook(deps, { rawBody: body, signature, eventId: "evt_4" })).status).toBe(200);
    expect(fake.table("webhookEvent").find((e) => e.eventId === "evt_4")?.status).toBe("PROCESSED");
  });

  it("ignores subscriptions this platform did not create", async () => {
    const { deps } = setup();
    const body = charged("sub_elsewhere", "pay_11");
    expect(await handleWebhook(deps, { rawBody: body, signature: hmacHex(WEBHOOK_SECRET, body), eventId: "evt_5" })).toEqual({
      status: 200,
      message: "IGNORED",
    });
  });
});

// ─── Family and refunds ──────────────────────────────────────────────────────

describe("family links", () => {
  it("links a child with their one-time code", async () => {
    const { deps, fake } = setup();
    fake.table("user").push({ id: "kid3", name: "Kabir", email: "k@x" }, { id: "other", name: "Other", email: "o@x" });
    const { code } = await createLinkCode(deps.db, "kid3", NOW);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(linkWithCode(deps.db, "kid3", code, NOW)).rejects.toThrow(/your own account/);
    expect(await linkWithCode(deps.db, "parent", code.toLowerCase(), NOW)).toBe("kid3");
    await expect(linkWithCode(deps.db, "other", code, NOW)).rejects.toThrow(/not valid/);

    const late = await createLinkCode(deps.db, "kid3", NOW);
    await expect(linkWithCode(deps.db, "other", late.code, NOW)).rejects.toMatchObject({ status: 409 });
    const expired = await createLinkCode(deps.db, "kid3", NOW);
    await expect(linkWithCode(deps.db, "parent", expired.code, new Date(NOW.getTime() + 2 * DAY))).rejects.toThrow(/not valid/);
  });
});

describe("refunds", () => {
  it("writes a REFUNDED row and ends the pass", async () => {
    const { deps, rp, fake, payer } = setup();
    const session = await startCheckout(deps, payer, {
      product: "MEMBERSHIP", tier: "PLUS", interval: "MONTHLY", mode: "PASS", learnerIds: ["kid1"], country: "IN", currency: "INR",
    });
    rp.payments.set("pay_r", {
      id: "pay_r", amount: 49900, currency: "INR", status: "captured", order_id: session.orderId!, invoice_id: null, created_at: unix(NOW),
    });
    await verifyCheckout(deps, payer, {
      recordId: session.recordId, razorpay_payment_id: "pay_r", razorpay_signature: hmacHex(KEY_SECRET, `${session.orderId}|pay_r`),
    });
    const paymentRow = fake.table("payment")[0];
    expect(paymentRow.amount).toBe(499);

    await refundLedgerPayment(deps, { email: "admin@example.com" }, paymentRow.id);
    const refund = fake.table("payment").find((p) => p.kind === "REFUND")!;
    expect(refund).toMatchObject({ status: "REFUNDED", refundOf: paymentRow.id, amountMinor: 49900, amount: 499 });
    expect(fake.table("membershipSubscription")[0].status).toBe("REFUNDED");
    expect((await learnerAccess(deps.db, "kid1", NOW)).tier).toBe("FREE");
    await expect(refundLedgerPayment(deps, { email: "a" }, paymentRow.id)).rejects.toMatchObject({ status: 409 });
  });
});

// ─── Free trial ──────────────────────────────────────────────────────────────

describe("free trial", () => {
  const trialRequest = {
    product: "MEMBERSHIP" as const,
    tier: "PLUS" as const,
    interval: "ANNUAL" as const,
    mode: "AUTO_RENEW" as const,
    learnerIds: ["kid1"],
    country: "IN",
    currency: "INR",
    trial: true,
  };
  const TRIAL_END = new Date(NOW.getTime() + 3 * DAY);

  /** Start a trial and have Razorpay report it authorised (its ₹5 check refunded). */
  async function startedTrial(ctx = setup(), request = trialRequest) {
    const session = await startCheckout(ctx.deps, ctx.payer, request);
    Object.assign(ctx.rp.subs.get(session.subscriptionId!)!, { status: "authenticated", paid_count: 0 });
    ctx.rp.payments.set("pay_auth", {
      id: "pay_auth", amount: 500, currency: request.currency, status: "refunded", order_id: null,
      invoice_id: null, method: "card", created_at: unix(NOW),
    });
    const record = await verifyCheckout(ctx.deps, ctx.payer, {
      recordId: session.recordId,
      razorpay_payment_id: "pay_auth",
      razorpay_signature: hmacHex(KEY_SECRET, `pay_auth|${session.subscriptionId}`),
    });
    return { ...ctx, session, record };
  }

  it("starts billing after the trial and grants access meanwhile", async () => {
    const { rp, fake, deps, session, record } = await startedTrial();
    expect(rp.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ start_at: unix(TRIAL_END) }));
    expect(session.trialEndsAt).toBe(TRIAL_END.toISOString());
    expect(session.description).toMatch(/3-day free trial, then annual/);
    expect(record).toMatchObject({ status: "AUTHENTICATED", trialEndsAt: TRIAL_END });
    expect(record.startedAt).toEqual(NOW);

    // The refundable check is not revenue; the trial notice goes out once.
    expect(fake.table("payment")).toHaveLength(0);
    const notices = () => fake.table("notification").filter((n) => String(n.title).includes("free trial has started"));
    expect(notices()).toHaveLength(1);
    await verifyCheckout(deps, { userId: "parent", name: "Priya", email: "priya@example.com" }, {
      recordId: session.recordId, razorpay_payment_id: "pay_auth",
      razorpay_signature: hmacHex(KEY_SECRET, `pay_auth|${session.subscriptionId}`),
    });
    expect(notices()).toHaveLength(1);

    expect((await learnerAccess(deps.db, "kid1", NOW)).tier).toBe("PLUS");
    expect((await learnerAccess(deps.db, "kid1", new Date(TRIAL_END.getTime() + 6 * 3600_000))).tier).toBe("PLUS");
    expect((await learnerAccess(deps.db, "kid1", new Date(TRIAL_END.getTime() + 13 * 3600_000))).tier).toBe("FREE");
  });

  it("is once per learner, memberships only, and auto-renew only", async () => {
    const ctx = await startedTrial();
    // Same learner again (even after cancelling): no second trial.
    await cancelPurchase(ctx.deps, ctx.payer, ctx.session.recordId);
    await expect(startCheckout(ctx.deps, ctx.payer, trialRequest)).rejects.toMatchObject({ status: 409 });
    // Without the trial they can still buy.
    await expect(startCheckout(ctx.deps, ctx.payer, { ...trialRequest, trial: false })).resolves.toMatchObject({ trialEndsAt: null });
    // Another learner can trial.
    await expect(startCheckout(ctx.deps, ctx.payer, { ...trialRequest, learnerIds: ["kid2"] })).resolves.toMatchObject({
      trialEndsAt: TRIAL_END.toISOString(),
    });

    const other = setup();
    await expect(startCheckout(other.deps, other.payer, { ...trialRequest, mode: "PASS" })).rejects.toThrow(/renew automatically/);
    await expect(
      startCheckout(other.deps, other.payer, { ...trialRequest, product: "INTELLIAPLAY", tier: "INTELLIAPLAY" })
    ).rejects.toThrow(/renew automatically/);
    await setTrialDays(other.deps.db, 0, "admin@example.com");
    await expect(startCheckout(other.deps, other.payer, trialRequest)).rejects.toThrow(/not available/);
  });

  it("cancelling during the trial stops the first charge but keeps the trial", async () => {
    const { deps, rp, payer, session } = await startedTrial();
    const cancelled = await cancelPurchase(deps, payer, session.recordId);
    expect(rp.cancelSubscription).toHaveBeenCalledWith(session.subscriptionId, false);
    expect(cancelled).toMatchObject({ status: "CANCELLED", currentPeriodEnd: TRIAL_END, cancelAtPeriodEnd: true });
    expect((await learnerAccess(deps.db, "kid1", new Date(TRIAL_END.getTime() - DAY))).tier).toBe("PLUS");
    expect((await learnerAccess(deps.db, "kid1", TRIAL_END)).tier).toBe("FREE");
    await expect(schedulePlanChange(deps, payer, session.recordId, { tier: "ULTRA", learnerIds: ["kid1"] })).rejects.toThrow();
  });

  it("gives no grace period when the first charge after a trial fails", async () => {
    const { deps, fake, rp, session } = await startedTrial();
    Object.assign(rp.subs.get(session.subscriptionId!)!, { status: "pending", paid_count: 0 });
    const body = JSON.stringify({ event: "subscription.pending", payload: { subscription: { entity: { id: session.subscriptionId, status: "pending" } } } });
    await handleWebhook(deps, { rawBody: body, signature: hmacHex(WEBHOOK_SECRET, body), eventId: "evt_trial_fail" });
    expect(fake.table("membershipSubscription")[0]).toMatchObject({ status: "PENDING", graceUntil: null });
    expect((await learnerAccess(deps.db, "kid1", NOW)).tier).toBe("FREE");
  });

  it("requires a card outside India and shows who can still trial", async () => {
    const ctx = setup();
    const abroad = await startCheckout(ctx.deps, ctx.payer, { ...trialRequest, country: "GB", currency: "GBP" });
    expect(abroad.cardOnly).toBe(true);
    const india = await startCheckout(ctx.deps, ctx.payer, { ...trialRequest, learnerIds: ["kid2"] });
    expect(india.cardOnly).toBe(false);

    const { deps, payer } = await startedTrial();
    const overview = await billingOverview(deps, payer);
    expect(overview.learners.map((l) => [l.id, l.trialEligible])).toEqual([
      ["parent", true],
      ["kid1", false],
      ["kid2", true],
    ]);
    const view = overview.subscriptions.find((s) => s.inTrial);
    expect(view).toMatchObject({ trialEndsAt: TRIAL_END.toISOString(), canCancel: true, canChange: false, grantsAccess: true });
  });
});

describe("webhook secret rotation", () => {
  it("accepts the previous secret only while it is configured", async () => {
    const { deps } = setup();
    const body = JSON.stringify({ event: "payment.failed", payload: {} });
    const signedWithOld = hmacHex("old_webhook_secret", body);
    expect((await handleWebhook(deps, { rawBody: body, signature: signedWithOld, eventId: "evt_rot_1" })).status).toBe(400);
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = "old_webhook_secret";
    try {
      expect(await handleWebhook(deps, { rawBody: body, signature: signedWithOld, eventId: "evt_rot_2" })).toEqual({
        status: 200,
        message: "IGNORED",
      });
    } finally {
      delete process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
    }
  });
});

// ─── Plans, the paywall and the sales switch ─────────────────────────────────

describe("plans administrators control", () => {
  const plusUpdate = (over: Record<string, unknown> = {}) => ({
    tier: "PLUS",
    name: "Plus",
    tagline: "All of it",
    highlights: ["Every lesson"],
    onSale: true,
    featured: true,
    sortOrder: 2,
    limits: { aiTutorPerDay: 10, learningPath: true, gemMultiplier: 4, monthlyBonusGems: 0, prioritySupport: false },
    ...over,
  });

  it("sells only Plus and Ultra by default, with no prices until a country is chosen", async () => {
    const { deps, payer } = setup();
    const noCountry = await buildCatalog(deps.db, {});
    expect(noCountry.plans.map((p) => p.tier)).toEqual(["PLUS", "ULTRA", "INTELLIAPLAY"]);
    expect(noCountry).toMatchObject({ country: null, currency: null, prices: [], allowedCurrencies: [] });
    const india = await buildCatalog(deps.db, { country: "IN" });
    expect(new Set(india.prices.map((p) => p.tier))).toEqual(new Set(["PLUS", "ULTRA", "INTELLIAPLAY"]));
    await expect(
      startCheckout(deps, payer, {
        product: "MEMBERSHIP", tier: "CORE", interval: "ANNUAL", mode: "AUTO_RENEW", learnerIds: ["kid1"], country: "IN", currency: "INR",
      })
    ).rejects.toThrow(/not on sale/);
  });

  it("applies edited limits and names at once, and keeps one membership on sale", async () => {
    const { deps, fake } = setup();
    fake.table("membershipGrant").push({ id: "g", userId: "kid1", product: "MEMBERSHIP", tier: "PLUS", validUntil: new Date(NOW.getTime() + DAY), revokedAt: null });
    await savePlans(deps.db, [plusUpdate({ name: "Pro" })], "admin@example.com");
    const access = await membershipAccess(deps.db, { userId: "kid1", role: "STUDENT" }, NOW);
    expect(access.limits).toMatchObject({ aiTutorPerDay: 10, gemMultiplier: 4 });
    expect((await readPlans(deps.db)).find((p) => p.tier === "PLUS")?.name).toBe("Pro");

    await expect(
      savePlans(deps.db, [plusUpdate({ onSale: false }), { ...plusUpdate({ onSale: false }), tier: "ULTRA", featured: false, sortOrder: 3 }], "a")
    ).rejects.toThrow(/At least one membership plan/);
    await expect(savePlans(deps.db, [plusUpdate({ name: "  " })], "a")).rejects.toThrow(/name/);
    // Core can be put back on sale.
    await savePlans(deps.db, [{ ...plusUpdate({ name: "Core", featured: false, sortOrder: 1 }), tier: "CORE" }], "a");
    expect((await buildCatalog(deps.db, { country: "IN" })).plans.map((p) => p.tier)).toEqual(["CORE", "PLUS", "ULTRA", "INTELLIAPLAY"]);
  });

  it("locks learners without a membership once sales are open", async () => {
    const { deps, fake } = setup();
    expect(await membershipAccess(deps.db, { userId: "kid1", role: "STUDENT" }, NOW)).toMatchObject({
      billingEnabled: true, hasMembership: false, tier: "FREE", limits: { aiTutorPerDay: 0, learningPath: false },
    });
    expect((await membershipAccess(deps.db, { userId: "admin", role: "ADMIN" }, NOW)).hasMembership).toBe(true);
    fake.table("membershipGrant").push({ id: "g", userId: "kid1", product: "MEMBERSHIP", tier: "ULTRA", validUntil: new Date(NOW.getTime() + DAY), revokedAt: null });
    expect(await membershipAccess(deps.db, { userId: "kid1", role: "STUDENT" }, NOW)).toMatchObject({ hasMembership: true, tier: "ULTRA" });
  });

  it("follows the admin sales switch, which the server can only force off", async () => {
    const { deps } = setup();
    expect(await salesOpen(deps.db)).toBe(true); // BILLING_ENABLED=true and the switch never set
    await setSalesSwitch(deps.db, false, "admin@example.com");
    expect(await salesOpen(deps.db)).toBe(false);
    expect((await membershipAccess(deps.db, { userId: "kid1", role: "STUDENT" }, NOW)).hasMembership).toBe(true);
    await setSalesSwitch(deps.db, true, "admin@example.com");
    process.env.BILLING_ENABLED = "false";
    expect(await salesOpen(deps.db)).toBe(false);
    delete process.env.BILLING_ENABLED;
    expect(await salesOpen(deps.db)).toBe(true); // the switch alone decides when the server says nothing
  });
});

describe("administrators managing a customer", () => {
  it("cancels now, extends and gives everyone access", async () => {
    const { deps, rp, fake, payer } = setup();
    const session = await startCheckout(deps, payer, {
      product: "MEMBERSHIP", tier: "PLUS", interval: "ANNUAL", mode: "AUTO_RENEW", learnerIds: ["kid1"], country: "IN", currency: "INR",
    });
    Object.assign(rp.subs.get(session.subscriptionId!)!, {
      status: "active", paid_count: 1, current_start: unix(NOW), current_end: unix(new Date(NOW.getTime() + 365 * DAY)),
    });
    fake.table("membershipSubscription")[0].status = "ACTIVE";
    fake.table("membershipSubscription")[0].currentPeriodEnd = new Date(NOW.getTime() + 365 * DAY);

    // Extend: 30 days after the paid year, as a grant.
    await adminExtendPurchase(deps, { email: "admin@example.com" }, session.recordId, 30);
    const grant = fake.table("membershipGrant").find((g) => g.userId === "kid1")!;
    expect(grant).toMatchObject({ tier: "PLUS", grantedBy: "admin@example.com" });
    expect((grant.validUntil as Date).getTime()).toBe(NOW.getTime() + 395 * DAY);

    // Cancel now: the purchase stops granting at once (the extension grant is separate).
    const cancelled = await adminCancelPurchase(deps, session.recordId, true);
    expect(rp.cancelSubscription).toHaveBeenCalledWith(session.subscriptionId, false);
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelAtPeriodEnd: false });
    expect(purchaseAccess(cancelled, new Date(NOW.getTime() + 1000)).grants).toBe(false);

    // Everyone: one grant per student and parent account.
    expect(await createGrantForAllLearners(deps.db, { email: "admin@example.com" }, { tier: "PLUS", days: 30, reason: "Launch" }, NOW)).toBe(3);
    expect((await membershipAccess(deps.db, { userId: "kid2", role: "STUDENT" }, NOW)).hasMembership).toBe(true);
  });
});
