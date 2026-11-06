/**
 * Keeping each purchase in step with Razorpay, and the payment ledger.
 *
 * Razorpay is the source of truth for a subscription's status and period.
 * Webhooks, the checkout verify call and the self-sync on /api/billing/me all
 * end in syncPurchase(), which fetches the subscription or order from
 * Razorpay and applies it, so out-of-order or repeated events cannot leave a
 * purchase in the wrong state.
 */
import type { BillingSubscriptionView, SubscriptionStatus } from "@intellia360/shared/types/api/billing";
import type { BillingInterval, BillingMode, BillingProduct, PlanTier } from "@intellia360/shared/billing/plans";
import { DAY_MS, graceDays } from "./config";
import { inTrial, purchaseAccess, type SubscriptionRow } from "./access";
import { isUniqueViolation, type BillingDeps } from "./deps";
import type { RazorpayPayment, RazorpaySubscription } from "./razorpay";
import { notifyPaymentReceived, notifyTrialStarted } from "./notify";

const RZP_STATUS: Record<string, SubscriptionStatus> = {
  created: "CREATED",
  authenticated: "AUTHENTICATED",
  active: "ACTIVE",
  pending: "PENDING",
  halted: "HALTED",
  paused: "PAUSED",
  cancelled: "CANCELLED",
  completed: "COMPLETED",
  expired: "EXPIRED",
};

/** No purchase ever leaves these. */
export const FINAL_STATUSES = new Set(["CANCELLED", "COMPLETED", "EXPIRED", "REFUNDED"]);

export const fromUnix = (seconds: number | null | undefined): Date | null =>
  typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : null;

export interface PendingChange {
  tier: PlanTier;
  priceId: string;
  razorpayPlanId: string;
  seats: number;
  learnerIds: string[];
  amountMinor: number;
}

export function parsePendingChange(value: unknown): PendingChange | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PendingChange>;
  return typeof v.razorpayPlanId === "string" && typeof v.priceId === "string" && Array.isArray(v.learnerIds)
    ? (v as PendingChange)
    : null;
}

/** The fields to write after reading `entity` from Razorpay. */
export function subscriptionUpdate(record: SubscriptionRow, entity: RazorpaySubscription, now: Date) {
  const mapped = RZP_STATUS[entity.status] ?? (record.status as SubscriptionStatus);
  // An older event's copy can never re-open a finished purchase.
  const status = FINAL_STATUSES.has(record.status) && !FINAL_STATUSES.has(mapped) ? record.status : mapped;

  let currentPeriodEnd = fromUnix(entity.current_end) ?? record.currentPeriodEnd;
  const endedAt = fromUnix(entity.ended_at);
  const neverPaid = (entity.paid_count ?? 0) === 0;
  // Cancelled straight away: access ends when it ended, not at the cycle end.
  if (status === "CANCELLED" && endedAt && (!currentPeriodEnd || endedAt < currentPeriodEnd)) {
    currentPeriodEnd = endedAt;
  }
  // A trial cancelled before its first charge still runs to the end of the
  // trial: billing never starts, and the days already offered are kept.
  if (status === "CANCELLED" && neverPaid && record.trialEndsAt && record.startedAt) {
    currentPeriodEnd = record.trialEndsAt;
  }

  const data: Record<string, unknown> = {
    status,
    currentPeriodStart: fromUnix(entity.current_start) ?? record.currentPeriodStart,
    currentPeriodEnd,
    lastSyncedAt: now,
  };

  // Grace after a failed charge is for paying members only: a trial whose first
  // charge fails ends there.
  if (status === "PENDING") {
    data.graceUntil = record.graceUntil ?? (neverPaid ? null : new Date(now.getTime() + graceDays() * DAY_MS));
  } else if (status === "ACTIVE") data.graceUntil = null;

  // A plan change scheduled for the renewal has taken effect.
  const change = parsePendingChange(record.pendingChange);
  if (change && entity.plan_id === change.razorpayPlanId && record.razorpayPlanId !== entity.plan_id) {
    Object.assign(data, {
      tier: change.tier,
      priceId: change.priceId,
      razorpayPlanId: change.razorpayPlanId,
      seats: change.seats,
      learnerIds: change.learnerIds,
      amountMinor: change.amountMinor,
      pendingChange: null,
    });
  }
  return data;
}

export async function applySubscriptionEntity(
  deps: BillingDeps,
  record: SubscriptionRow,
  entity: RazorpaySubscription
): Promise<SubscriptionRow> {
  const updated = (await deps.db.membershipSubscription.update({
    where: { id: record.id },
    data: subscriptionUpdate(record, entity, deps.now()),
  })) as SubscriptionRow;
  if (updated.status === "AUTHENTICATED" || updated.status === "ACTIVE") return markStarted(deps, updated);
  return updated;
}

/**
 * Record the first moment a purchase granted anything. The conditional write
 * makes this happen once even when the verify call and a webhook race, so the
 * "trial started" notice goes out once.
 */
export async function markStarted(deps: BillingDeps, record: SubscriptionRow): Promise<SubscriptionRow> {
  if (record.startedAt) return record;
  const now = deps.now();
  const claimed = await deps.db.membershipSubscription.updateMany({
    where: { id: record.id, startedAt: null },
    data: { startedAt: now },
  });
  const started = { ...record, startedAt: record.startedAt ?? now };
  if (claimed.count === 1 && started.trialEndsAt && started.status === "AUTHENTICATED") {
    await notifyTrialStarted(deps, started);
  }
  return started;
}

export function addInterval(start: Date, interval: string): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  if (interval === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  // 31 Jan + 1 month is 28/29 Feb, not 3 March.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

/**
 * Start a paid pass. A pass bought while an earlier pass for the same
 * learners is still running starts when that one ends, so renewing early never
 * loses days. Idempotent: an already-active pass is returned unchanged.
 */
export async function activatePass(deps: BillingDeps, record: SubscriptionRow): Promise<SubscriptionRow> {
  if (record.status === "ACTIVE" || FINAL_STATUSES.has(record.status)) return record;
  const now = deps.now();
  const running = (await deps.db.membershipSubscription.findMany({
    where: {
      payerUserId: record.payerUserId,
      product: record.product,
      mode: "PASS",
      status: "ACTIVE",
      learnerIds: { hasSome: record.learnerIds },
    },
  })) as SubscriptionRow[];
  const latestEnd = running
    .filter((r) => r.id !== record.id && r.currentPeriodEnd)
    .reduce<Date | null>((max, r) => (!max || r.currentPeriodEnd! > max ? r.currentPeriodEnd : max), null);
  const start = latestEnd && latestEnd > now ? latestEnd : now;

  return (await deps.db.membershipSubscription.update({
    where: { id: record.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: start,
      currentPeriodEnd: addInterval(start, record.interval),
      startedAt: record.startedAt ?? now,
      lastSyncedAt: now,
    },
  })) as SubscriptionRow;
}

/** Whole rupees for the revenue KPIs; see the note on Payment.amount. */
export function inrAmount(payment: Pick<RazorpayPayment, "amount" | "currency" | "base_amount" | "base_currency">): number {
  if (payment.currency === "INR") return Math.round(payment.amount / 100);
  if (payment.base_currency === "INR" && typeof payment.base_amount === "number") return Math.round(payment.base_amount / 100);
  return 0;
}

/** Add a captured Razorpay payment to the ledger once. */
export async function recordPayment(
  deps: BillingDeps,
  record: SubscriptionRow,
  payment: RazorpayPayment,
  kind: "SUBSCRIPTION_CHARGE" | "PASS"
): Promise<void> {
  const { db } = deps;
  if (await db.payment.findUnique({ where: { transactionId: payment.id } })) return;

  const payer = await db.user.findUnique({ where: { id: record.payerUserId }, select: { name: true, email: true } });
  try {
    await db.payment.create({
      data: {
        transactionId: payment.id,
        payerName: payer?.name ?? "Unknown payer",
        schoolOrUser: payer?.email ?? null,
        amount: inrAmount(payment),
        method: payment.method ? `Razorpay · ${payment.method.toUpperCase()}` : "Razorpay",
        status: "COMPLETED",
        date: fromUnix(payment.created_at) ?? deps.now(),
        currency: payment.currency,
        amountMinor: payment.amount,
        kind,
        userId: record.payerUserId,
        subscriptionId: record.id,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return; // another delivery recorded it first
    throw err;
  }
  await notifyPaymentReceived(deps, record, payment.amount, payment.currency);
}

/**
 * Bring one purchase up to date with Razorpay. For a pass that is still
 * CREATED, this finds out whether its order was paid.
 */
export async function syncPurchase(deps: BillingDeps, record: SubscriptionRow): Promise<SubscriptionRow> {
  if (record.mode === "AUTO_RENEW") {
    const entity = await deps.razorpay.fetchSubscription(record.gatewayId);
    return applySubscriptionEntity(deps, record, entity);
  }

  if (record.status !== "CREATED") return record;
  const order = await deps.razorpay.fetchOrder(record.gatewayId);
  if (order.status !== "paid") {
    return (await deps.db.membershipSubscription.update({
      where: { id: record.id },
      data: { lastSyncedAt: deps.now() },
    })) as SubscriptionRow;
  }
  const payments = await deps.razorpay.fetchOrderPayments(record.gatewayId);
  const paid = payments.find((p) => p.status === "captured");
  const activated = await activatePass(deps, record);
  if (paid) await recordPayment(deps, activated, paid, "PASS");
  return activated;
}

/** What a payer (or an administrator) sees for one purchase. */
export function toSubscriptionView(
  record: SubscriptionRow,
  names: Map<string, string>,
  now: Date
): BillingSubscriptionView {
  const change = parsePendingChange(record.pendingChange);
  const live = !FINAL_STATUSES.has(record.status);
  const autoRenew = record.mode === "AUTO_RENEW";
  const trialing = inTrial(record, now);
  return {
    id: record.id,
    product: record.product as BillingProduct,
    tier: record.tier as PlanTier,
    interval: record.interval as BillingInterval,
    mode: record.mode as BillingMode,
    currency: record.currency,
    seats: record.seats,
    amountMinor: record.amountMinor,
    status: record.status as SubscriptionStatus,
    learners: record.learnerIds.map((id) => ({ id, name: names.get(id) ?? "Learner" })),
    currentPeriodEnd: record.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    graceUntil: record.graceUntil?.toISOString() ?? null,
    trialEndsAt: record.trialEndsAt?.toISOString() ?? null,
    inTrial: trialing,
    pendingChange: change
      ? { tier: change.tier, seats: change.seats, amountMinor: change.amountMinor, learnerIds: change.learnerIds }
      : null,
    grantsAccess: purchaseAccess(record, now).grants,
    canCancel: autoRenew && live && !record.cancelAtPeriodEnd && record.status !== "CREATED",
    // During a trial the plan can be cancelled, not changed (cancel and start again).
    canChange: autoRenew && !record.cancelAtPeriodEnd && !trialing && record.status === "ACTIVE",
    createdAt: record.createdAt.toISOString(),
  };
}
