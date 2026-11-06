/**
 * Buying, verifying, cancelling and changing a plan.
 *
 * The browser only ever says WHAT to buy (plan, period, learners, country,
 * currency). Every amount comes from the price book here, and access is only
 * granted after Razorpay's signature checks out and Razorpay itself confirms
 * the subscription or order.
 */
import crypto from "crypto";
import {
  BILLING_INTERVALS,
  BILLING_MODES,
  INR_AUTODEBIT_LIMIT_MINOR,
  MAX_SEATS,
  isValidPlan,
  planDisplayName,
  productForTier,
  seatTotalMinor,
  trialAvailableFor,
  type BillingInterval,
  type BillingMode,
  type BillingProduct,
  type PlanTier,
} from "@intellia360/shared/billing/plans";
import { currencyExponent, formatMoney } from "@intellia360/shared/billing/currencies";
import { allowedCurrencies, cardRequired, getCountry } from "@intellia360/shared/billing/countries";
import type {
  BillingOverview,
  CheckoutRequest,
  CheckoutSession,
  VerifyCheckoutRequest,
} from "@intellia360/shared/types/api/billing";
import { DAY_MS, razorpayKeys, SELF_SYNC_AFTER_MS, SUBSCRIPTION_TOTAL_COUNT } from "./config";
import { findPlan, plansOnSale, readPlans, salesOpen } from "./state";
import { BillingError, type BillingDeps } from "./deps";
import { activePrices, completeCurrencies, ensurePriceBook, findPrice, type PriceRow } from "./catalog";
import { payableLearners } from "./family";
import { inTrial, learnerAccessMany, type SubscriptionRow } from "./access";
import {
  FINAL_STATUSES,
  activatePass,
  applySubscriptionEntity,
  parsePendingChange,
  recordPayment,
  syncPurchase,
  toSubscriptionView,
  type PendingChange,
} from "./subscriptions";
import { verifyOrderSignature, verifySubscriptionSignature } from "./signatures";
import { RazorpayError } from "./razorpay";

export interface Payer {
  userId: string;
  name: string;
  email: string;
}

/** Statuses in which an auto-renewing purchase still counts as "in place". */
const LIVE_AUTO_RENEW = ["CREATED", "AUTHENTICATED", "ACTIVE", "PENDING"];

/** Statuses that mean a purchase got going at some point (older rows may lack startedAt). */
const STARTED_STATUSES = new Set(["ACTIVE", "PENDING", "HALTED", "COMPLETED", "REFUNDED"]);

/**
 * Which of `learnerIds` have already used their free trial for `product`: any
 * purchase of it that ever started (a trial, a paid period or a pass), bought
 * by anyone. Abandoned checkouts don't count.
 */
export async function trialUsedBy(deps: BillingDeps, product: string, learnerIds: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  if (learnerIds.length === 0) return used;
  const rows = (await deps.db.membershipSubscription.findMany({
    where: { product, learnerIds: { hasSome: learnerIds } },
  })) as SubscriptionRow[];
  for (const row of rows) {
    if (!row.startedAt && !row.currentPeriodStart && !STARTED_STATUSES.has(row.status)) continue;
    for (const id of row.learnerIds) if (learnerIds.includes(id)) used.add(id);
  }
  return used;
}

function requireKeys() {
  const keys = razorpayKeys();
  if (!keys) throw new BillingError("Payments are not set up yet. Please try again later.", 503);
  return keys;
}

async function requireOpen(deps: BillingDeps) {
  if (!(await salesOpen(deps.db))) throw new BillingError("Memberships are not on sale yet.", 403);
}

/** Learner ids must be distinct, between 1 and MAX_SEATS, and ones this payer may buy for. */
async function validateLearners(deps: BillingDeps, payer: Payer, learnerIds: string[]) {
  const ids = [...new Set(learnerIds)];
  if (ids.length === 0) throw new BillingError("Choose at least one learner.");
  if (ids.length > MAX_SEATS) throw new BillingError(`One purchase covers up to ${MAX_SEATS} learners. For more, contact us.`);
  const allowed = await payableLearners(deps.db, payer);
  const names = new Map(allowed.map((l) => [l.id, l.name]));
  for (const id of ids) {
    if (!names.has(id)) throw new BillingError("You can only buy for yourself and children linked to your account.", 403);
  }
  return { ids, names };
}

/** Refuse a second auto-renewing purchase of the same product for any learner already on one. */
async function assertNotAlreadyCovered(
  deps: BillingDeps,
  product: string,
  learnerIds: string[],
  names: Map<string, string>,
  ignoreId?: string
) {
  const live = (await deps.db.membershipSubscription.findMany({
    where: { product, mode: "AUTO_RENEW", status: { in: LIVE_AUTO_RENEW }, learnerIds: { hasSome: learnerIds } },
  })) as SubscriptionRow[];
  const now = deps.now().getTime();
  const blocking = live.find(
    (s) =>
      s.id !== ignoreId &&
      !s.cancelAtPeriodEnd &&
      // An abandoned checkout older than a day no longer blocks.
      !(s.status === "CREATED" && now - s.createdAt.getTime() > 86_400_000)
  );
  if (blocking) {
    const who = blocking.learnerIds.filter((id) => learnerIds.includes(id)).map((id) => names.get(id) ?? "A learner");
    const what = product === "INTELLIAPLAY" ? "IntelliaPlay" : "a membership";
    throw new BillingError(
      `${who.join(", ")} already ${who.length === 1 ? "has" : "have"} ${what} that renews automatically. Change or cancel it on this page instead.`,
      409
    );
  }
}

/** The Razorpay plan for `seats` learners at this price, created the first time it is needed. */
export async function ensureRazorpayPlan(
  deps: BillingDeps,
  price: PriceRow,
  seats: number,
  amountMinor: number
): Promise<string> {
  const known = (price.razorpayPlans ?? {}) as Record<string, string>;
  if (known[String(seats)]) return known[String(seats)];

  const plan = await deps.razorpay.createPlan({
    period: price.interval === "MONTHLY" ? "monthly" : "yearly",
    interval: 1,
    item: {
      name: `${planDisplayName(price.tier as PlanTier, await readPlans(deps.db))} · ${seats} learner${seats === 1 ? "" : "s"}`,
      amount: amountMinor,
      currency: price.currency,
      description: `Intellia360 price ${price.id} v${price.version}`,
    },
    notes: { priceId: price.id, seats: String(seats) },
  });

  // Re-read before writing so a plan another request added for a different
  // seat count is kept.
  const fresh = await deps.db.planPrice.findUnique({ where: { id: price.id } });
  const merged = { ...((fresh?.razorpayPlans ?? {}) as Record<string, string>), [String(seats)]: plan.id };
  await deps.db.planPrice.update({ where: { id: price.id }, data: { razorpayPlans: merged } });
  price.razorpayPlans = merged;
  return plan.id;
}

function describe(
  plans: Parameters<typeof planDisplayName>[1],
  tier: PlanTier,
  interval: BillingInterval,
  mode: BillingMode,
  seats: number,
  trialDays = 0
) {
  const period = interval === "MONTHLY" ? "monthly" : "annual";
  const kind = mode === "AUTO_RENEW" ? `${period}, renews automatically` : `${period}, one payment`;
  const trial = trialDays > 0 ? `${trialDays}-day free trial, then ` : "";
  return `${planDisplayName(tier, plans)} (${trial}${kind}) for ${seats} learner${seats === 1 ? "" : "s"}`;
}

/** New purchases and plan changes are only for plans an administrator has on sale. */
async function requireOnSale(deps: BillingDeps, tier: string) {
  const plans = await readPlans(deps.db);
  if (!findPlan(plans, tier)?.onSale) throw new BillingError("That plan is not on sale.");
  return plans;
}

async function priceFor(
  deps: BillingDeps,
  plan: { product: BillingProduct; tier: PlanTier; interval: BillingInterval; currency: string },
  seats: number,
  mode: BillingMode
) {
  const settings = await ensurePriceBook(deps.db);
  const rows = await activePrices(deps.db);
  const price = findPrice(rows, plan);
  if (!price) throw new BillingError("That plan is not on sale in this currency.");
  const amountMinor = seatTotalMinor(price.amountMinor, seats, settings.familyDiscountPercent, currencyExponent(plan.currency));
  if (mode === "AUTO_RENEW" && plan.currency === "INR" && amountMinor > INR_AUTODEBIT_LIMIT_MINOR) {
    throw new BillingError(
      `Indian banks only auto-renew up to ${formatMoney(INR_AUTODEBIT_LIMIT_MINOR, "INR", "en-IN")} a charge. Choose "Pay once" for this plan.`
    );
  }
  return { price, amountMinor, rows, settings };
}

export async function startCheckout(deps: BillingDeps, payer: Payer, req: CheckoutRequest): Promise<CheckoutSession> {
  await requireOpen(deps);
  const keys = requireKeys();

  if (!isValidPlan(req.product, req.tier) || productForTier(req.tier) !== req.product) {
    throw new BillingError("Unknown plan.");
  }
  const plans = await requireOnSale(deps, req.tier);
  if (!BILLING_INTERVALS.includes(req.interval)) throw new BillingError("Unknown billing period.");
  if (!BILLING_MODES.includes(req.mode)) throw new BillingError("Choose auto-renew or pay once.");

  const country = getCountry(req.country);
  if (!country) throw new BillingError("Choose your country.");
  const currency = req.currency.toUpperCase();

  const { ids, names } = await validateLearners(deps, payer, req.learnerIds);
  const { price, amountMinor, rows, settings } = await priceFor(
    deps,
    { product: req.product, tier: req.tier, interval: req.interval, currency },
    ids.length,
    req.mode
  );
  if (!allowedCurrencies(country.code, completeCurrencies(rows, plansOnSale(plans).map((p) => p.tier))).includes(currency)) {
    throw new BillingError(`Buyers in ${country.name} cannot pay in ${currency}.`);
  }
  if (req.mode === "AUTO_RENEW") await assertNotAlreadyCovered(deps, req.product, ids, names);

  // Free trial: the subscription starts trialDays from now. The buyer still
  // authorises a payment method today (a card abroad; a card, UPI Autopay or a
  // bank mandate in India) and Razorpay refunds its small check charge.
  let trialEndsAt: Date | null = null;
  if (req.trial) {
    if (!trialAvailableFor(req.product, req.mode)) {
      throw new BillingError("The free trial is for memberships that renew automatically.");
    }
    if (settings.trialDays <= 0) throw new BillingError("Free trials are not available right now.");
    const used = await trialUsedBy(deps, req.product, ids);
    if (used.size > 0) {
      const who = [...used].map((id) => names.get(id) ?? "A learner").join(", ");
      throw new BillingError(
        `${who} already had a free trial or a membership, so this purchase can't start with a trial. Choose the plan without the trial.`,
        409
      );
    }
    trialEndsAt = new Date(deps.now().getTime() + settings.trialDays * DAY_MS);
  }

  await deps.db.billingProfile.upsert({
    where: { userId: payer.userId },
    create: { userId: payer.userId, country: country.code, currency },
    update: { country: country.code, currency },
  });

  const notes = { payerUserId: payer.userId, product: req.product, tier: req.tier, seats: String(ids.length) };
  const base = {
    payerUserId: payer.userId,
    product: req.product,
    tier: req.tier,
    interval: req.interval,
    mode: req.mode,
    currency,
    seats: ids.length,
    learnerIds: ids,
    priceId: price.id,
    amountMinor,
    country: country.code,
    trialEndsAt,
    status: "CREATED",
  };
  const description = describe(plans, req.tier, req.interval, req.mode, ids.length, trialEndsAt ? settings.trialDays : 0);
  const session = {
    keyId: keys.keyId,
    amountMinor,
    currency,
    name: "Intellia360",
    description,
    prefill: { name: payer.name, email: payer.email },
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    // Outside India a card is mandatory, for a trial and for any purchase.
    cardOnly: cardRequired(country.code),
  };

  try {
    if (req.mode === "AUTO_RENEW") {
      const planId = await ensureRazorpayPlan(deps, price, ids.length, amountMinor);
      const sub = await deps.razorpay.createSubscription({
        plan_id: planId,
        total_count: SUBSCRIPTION_TOTAL_COUNT[req.interval],
        ...(trialEndsAt ? { start_at: Math.floor(trialEndsAt.getTime() / 1000) } : {}),
        quantity: 1,
        customer_notify: 1,
        notes,
      });
      const record = await deps.db.membershipSubscription.create({
        data: { ...base, gatewayId: sub.id, razorpayPlanId: planId },
      });
      return { ...session, recordId: record.id, kind: "subscription", subscriptionId: sub.id };
    }

    const order = await deps.razorpay.createOrder({
      amount: amountMinor,
      currency,
      receipt: `pass_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      notes,
    });
    const record = await deps.db.membershipSubscription.create({ data: { ...base, gatewayId: order.id } });
    return { ...session, recordId: record.id, kind: "order", orderId: order.id };
  } catch (err) {
    if (err instanceof RazorpayError) {
      console.error("[billing/checkout] Razorpay refused:", err.status, err.code, err.message);
      throw new BillingError("The payment could not be started. Please try again.", 502);
    }
    throw err;
  }
}

async function ownPurchase(deps: BillingDeps, payerId: string, id: string): Promise<SubscriptionRow> {
  const record = (await deps.db.membershipSubscription.findUnique({ where: { id } })) as SubscriptionRow | null;
  if (!record || record.payerUserId !== payerId) throw new BillingError("Purchase not found.", 404);
  return record;
}

/** POST /api/billing/verify: the checkout success handler's result. */
export async function verifyCheckout(deps: BillingDeps, payer: Payer, body: VerifyCheckoutRequest): Promise<SubscriptionRow> {
  const keys = requireKeys();
  const record = await ownPurchase(deps, payer.userId, body.recordId);
  const paymentId = body.razorpay_payment_id;

  if (record.mode === "AUTO_RENEW") {
    const ok = verifySubscriptionSignature({
      paymentId,
      subscriptionId: record.gatewayId,
      signature: body.razorpay_signature,
      keySecret: keys.keySecret,
    });
    if (!ok) throw new BillingError("The payment could not be verified.", 400);

    const synced = await syncPurchase(deps, record);
    // The authorisation payment is the first charge when it is for the full
    // amount; token authorisations (e-mandates) are left to the webhook.
    const payment = await deps.razorpay.fetchPayment(paymentId).catch(() => null);
    if (payment && payment.status === "captured" && payment.amount === record.amountMinor) {
      await recordPayment(deps, synced, payment, "SUBSCRIPTION_CHARGE");
    }
    return synced;
  }

  const ok = verifyOrderSignature({
    orderId: record.gatewayId,
    paymentId,
    signature: body.razorpay_signature,
    keySecret: keys.keySecret,
  });
  if (!ok) throw new BillingError("The payment could not be verified.", 400);

  const payment = await deps.razorpay.fetchPayment(paymentId);
  if (payment.order_id !== record.gatewayId) throw new BillingError("The payment could not be verified.", 400);
  if (payment.status !== "captured") return record; // captured later: order.paid arrives by webhook
  const activated = await activatePass(deps, record);
  await recordPayment(deps, activated, payment, "PASS");
  return activated;
}

/**
 * Stop auto-renewal. Access continues to the end of the period already paid
 * for. Cancelling during a free trial means the first charge never happens,
 * and the trial still runs to its end.
 */
export async function cancelPurchase(deps: BillingDeps, payer: Payer, id: string): Promise<SubscriptionRow> {
  requireKeys();
  const record = await ownPurchase(deps, payer.userId, id);
  if (record.mode !== "AUTO_RENEW") throw new BillingError("A one-time pass does not renew, so there is nothing to cancel.");
  return cancelRecord(deps, record, { endAccessNow: false });
}

/**
 * Cancel one purchase. `endAccessNow: false` stops renewal and keeps the paid
 * period (or trial); `true` (administrators only) also ends access now. A pass
 * never renews, so it can only be ended now.
 */
export async function cancelRecord(
  deps: BillingDeps,
  record: SubscriptionRow,
  { endAccessNow }: { endAccessNow: boolean }
): Promise<SubscriptionRow> {
  if (FINAL_STATUSES.has(record.status)) throw new BillingError("This plan has already ended.");
  const now = deps.now();

  if (record.mode === "PASS") {
    if (!endAccessNow) throw new BillingError("A one-time pass does not renew, so there is nothing to cancel. End it now instead.");
    return (await deps.db.membershipSubscription.update({
      where: { id: record.id },
      data: { currentPeriodEnd: now, lastSyncedAt: now },
    })) as SubscriptionRow;
  }
  if (record.cancelAtPeriodEnd && !endAccessNow) return record;

  // Never authorised, or still in its trial: billing hasn't started, so it is
  // cancelled on Razorpay straight away. A trial keeps its access to the end.
  const trialing = inTrial(record, now);
  const immediately = endAccessNow || record.status === "CREATED" || trialing;
  try {
    const entity = await deps.razorpay.cancelSubscription(record.gatewayId, !immediately);
    const updated = await applySubscriptionEntity(deps, record, entity);
    return (await deps.db.membershipSubscription.update({
      where: { id: updated.id },
      data: endAccessNow
        ? { status: "CANCELLED", currentPeriodEnd: now, cancelAtPeriodEnd: false, graceUntil: null, pendingChange: null }
        : {
            cancelAtPeriodEnd: trialing || !immediately,
            pendingChange: null,
            ...(trialing && record.trialEndsAt ? { currentPeriodEnd: record.trialEndsAt } : {}),
          },
    })) as SubscriptionRow;
  } catch (err) {
    if (err instanceof RazorpayError) {
      console.error("[billing/cancel] Razorpay refused:", err.status, err.message);
      throw new BillingError("The plan could not be cancelled right now. Please try again.", 502);
    }
    throw err;
  }
}

/**
 * Switch level or learners from the next renewal. Razorpay cannot change
 * subscriptions authorised by UPI or e-mandate; those are cancelled at the
 * period end and bought again.
 */
export async function schedulePlanChange(
  deps: BillingDeps,
  payer: Payer,
  id: string,
  input: { tier: PlanTier; learnerIds: string[] }
): Promise<SubscriptionRow> {
  await requireOpen(deps);
  requireKeys();
  const record = await ownPurchase(deps, payer.userId, id);
  if (record.mode === "AUTO_RENEW" && inTrial(record, deps.now())) {
    throw new BillingError("A plan can't be changed during its free trial. Cancel it and choose the plan you want instead.");
  }
  if (record.mode !== "AUTO_RENEW" || record.cancelAtPeriodEnd || record.status !== "ACTIVE") {
    throw new BillingError("Only an active plan that renews automatically can be changed.");
  }
  if (!isValidPlan(record.product, input.tier)) throw new BillingError("That level is not part of this plan.");
  if (input.tier !== record.tier) await requireOnSale(deps, input.tier);

  const { ids, names } = await validateLearners(deps, payer, input.learnerIds);
  const sameLearners = ids.length === record.learnerIds.length && ids.every((l) => record.learnerIds.includes(l));
  if (input.tier === record.tier && sameLearners) throw new BillingError("That is the plan you already have.");

  const added = ids.filter((l) => !record.learnerIds.includes(l));
  if (added.length) await assertNotAlreadyCovered(deps, record.product, added, names, record.id);

  const { price, amountMinor } = await priceFor(
    deps,
    {
      product: record.product as BillingProduct,
      tier: input.tier,
      interval: record.interval as BillingInterval,
      currency: record.currency,
    },
    ids.length,
    "AUTO_RENEW"
  );
  const planId = await ensureRazorpayPlan(deps, price, ids.length, amountMinor);

  try {
    await deps.razorpay.updateSubscription(record.gatewayId, {
      plan_id: planId,
      schedule_change_at: "cycle_end",
      customer_notify: 1,
    });
  } catch (err) {
    if (err instanceof RazorpayError) {
      const upi = /upi|emandate|e-mandate/i.test(err.message);
      throw new BillingError(
        upi
          ? "This plan was set up with UPI or a bank mandate, which cannot be changed. Cancel it, and buy the new plan when it ends."
          : "The plan could not be changed right now. Please try again.",
        upi ? 409 : 502
      );
    }
    throw err;
  }

  const change: PendingChange = {
    tier: input.tier,
    priceId: price.id,
    razorpayPlanId: planId,
    seats: ids.length,
    learnerIds: ids,
    amountMinor,
  };
  return (await deps.db.membershipSubscription.update({
    where: { id: record.id },
    data: { pendingChange: change as never },
  })) as SubscriptionRow;
}

/** GET /api/billing/me: everything the membership page shows a payer. */
export async function billingOverview(deps: BillingDeps, payer: Payer): Promise<BillingOverview> {
  const { db } = deps;
  const now = deps.now();
  const learners = await payableLearners(db, payer);

  let subs = (await db.membershipSubscription.findMany({
    where: { payerUserId: payer.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as SubscriptionRow[];

  // Self-healing: refresh this payer's open purchases from Razorpay when they
  // have not been synced for a while (a webhook may have been missed).
  if (razorpayKeys()) {
    const stale = subs
      .filter(
        (s) =>
          !FINAL_STATUSES.has(s.status) &&
          !(s.status === "CREATED" && now.getTime() - s.createdAt.getTime() > 2 * 86_400_000) &&
          (!s.lastSyncedAt || now.getTime() - s.lastSyncedAt.getTime() > SELF_SYNC_AFTER_MS)
      )
      .slice(0, 5);
    for (const s of stale) {
      try {
        const fresh = await syncPurchase(deps, s);
        subs = subs.map((x) => (x.id === fresh.id ? fresh : x));
      } catch (err) {
        console.error("[billing/me] sync failed for", s.id, (err as Error).message);
      }
    }
  }

  // Abandoned checkouts are noise on the page.
  const visible = subs.filter((s) => s.status !== "CREATED" || now.getTime() - s.createdAt.getTime() < 86_400_000);

  const names = new Map(learners.map((l) => [l.id, l.name]));
  const unknown = [
    ...new Set(
      visible.flatMap((s) => [...s.learnerIds, ...(parsePendingChange(s.pendingChange)?.learnerIds ?? [])])
    ),
  ].filter((id) => !names.has(id));
  if (unknown.length) {
    const users = await db.user.findMany({ where: { id: { in: unknown } }, select: { id: true, name: true } });
    users.forEach((u) => names.set(u.id, u.name));
  }

  const access = await learnerAccessMany(db, learners.map((l) => l.id), now);
  const trialUsed = await trialUsedBy(deps, "MEMBERSHIP", learners.map((l) => l.id));
  const plans = await readPlans(db);
  const [profile, payments] = await Promise.all([
    db.billingProfile.findUnique({ where: { userId: payer.userId } }),
    db.payment.findMany({ where: { userId: payer.userId }, orderBy: { date: "desc" }, take: 20 }),
  ]);
  const subById = new Map(subs.map((s) => [s.id, s]));

  return {
    billingEnabled: await salesOpen(db),
    gatewayConfigured: razorpayKeys() !== null,
    profile: profile ? { country: profile.country, currency: profile.currency } : null,
    learners: learners.map((l) => ({
      ...l,
      membershipTier: access.get(l.id)?.tier ?? "FREE",
      intelliaPlay: access.get(l.id)?.intelliaPlay ?? false,
      trialEligible: !trialUsed.has(l.id),
    })),
    subscriptions: visible.map((s) => toSubscriptionView(s, names, now)),
    payments: payments.map((p) => {
      const sub = p.subscriptionId ? subById.get(p.subscriptionId) : undefined;
      return {
        id: p.id,
        transactionId: p.transactionId,
        amountMinor: p.amountMinor ?? p.amount * 100,
        currency: p.currency ?? "INR",
        status: p.status,
        description:
          p.kind === "REFUND"
            ? "Refund"
            : sub
              ? describe(plans, sub.tier as PlanTier, sub.interval as BillingInterval, sub.mode as BillingMode, sub.seats)
              : p.method,
        date: p.date.toISOString(),
      };
    }),
  };
}
