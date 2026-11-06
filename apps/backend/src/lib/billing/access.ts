/**
 * What a learner may use right now, worked out from their purchases and any
 * administrator grants each time it is asked. There is no stored "current
 * tier" to fall out of step with Razorpay.
 *
 * A purchase grants access while:
 *   • auto-renew AUTHENTICATED with a trial — until the trial ends (plus
 *                              TRIAL_BUFFER_MS while Razorpay takes the first charge)
 *   • auto-renew ACTIVE      — its period has not ended (plus RENEWAL_BUFFER_MS
 *                              while Razorpay charges the next one)
 *   • auto-renew PENDING     — a renewal failed: until graceUntil (set only for
 *                              plans that have been paid at least once)
 *   • CANCELLED / COMPLETED  — until the end of the period already paid for, or
 *                              of the trial already started
 *   • pass ACTIVE            — between its start and end
 * and never in CREATED, HALTED, PAUSED, EXPIRED or REFUNDED.
 */
import {
  UNRESTRICTED_LIMITS,
  higherTier,
  type MembershipTier,
} from "@intellia360/shared/billing/plans";
import type { UserRole } from "@intellia360/shared/types/auth";
import type { MembershipAccess } from "@intellia360/shared/types/api/billing";
import { RENEWAL_BUFFER_MS, TRIAL_BUFFER_MS } from "./config";
import { limitsFor, readPlans, salesOpen } from "./state";
import type { BillingDb } from "./deps";
import { dayKey, readAllowance, AI_TUTOR_FEATURE } from "./quota";

export interface SubscriptionRow {
  id: string;
  payerUserId: string;
  product: string;
  tier: string;
  interval: string;
  mode: string;
  currency: string;
  seats: number;
  learnerIds: string[];
  priceId: string;
  amountMinor: number;
  country?: string | null;
  gatewayId: string;
  razorpayPlanId: string | null;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: Date | null;
  trialEndsAt?: Date | null;
  startedAt?: Date | null;
  pendingChange: unknown;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

export interface GrantRow {
  id: string;
  userId: string;
  product: string;
  tier: string;
  validUntil: Date;
  revokedAt: Date | null;
}

/** Statuses that can still grant access; everything else never does. */
export const ACCESS_STATUSES = ["AUTHENTICATED", "ACTIVE", "PENDING", "CANCELLED", "COMPLETED"];

/** A started trial whose first charge has not happened yet. */
export function inTrial(sub: SubscriptionRow, now: Date): boolean {
  return (
    sub.mode === "AUTO_RENEW" &&
    sub.status === "AUTHENTICATED" &&
    !!sub.trialEndsAt &&
    now.getTime() < sub.trialEndsAt.getTime() + TRIAL_BUFFER_MS
  );
}

/** Whether one purchase grants access at `now`, and until when (null: open-ended). */
export function purchaseAccess(sub: SubscriptionRow, now: Date): { grants: boolean; until: Date | null } {
  const t = now.getTime();
  const end = sub.currentPeriodEnd?.getTime() ?? null;

  if (sub.mode === "PASS") {
    const start = sub.currentPeriodStart?.getTime() ?? null;
    const grants = sub.status === "ACTIVE" && start !== null && end !== null && t >= start && t < end;
    return { grants, until: grants ? sub.currentPeriodEnd : null };
  }

  switch (sub.status) {
    case "AUTHENTICATED":
      // Set up but not charged yet: only a free trial gives access meanwhile.
      return inTrial(sub, now) ? { grants: true, until: sub.trialEndsAt ?? null } : { grants: false, until: null };
    case "ACTIVE":
      if (end === null) return { grants: true, until: null };
      return t < end + RENEWAL_BUFFER_MS ? { grants: true, until: sub.currentPeriodEnd } : { grants: false, until: null };
    case "PENDING":
      // A failed charge keeps access only through the grace period, which a
      // plan that was never paid (a trial whose first charge failed) never gets.
      return sub.graceUntil && t < sub.graceUntil.getTime()
        ? { grants: true, until: sub.graceUntil }
        : { grants: false, until: null };
    case "CANCELLED":
    case "COMPLETED":
      return end !== null && t < end ? { grants: true, until: sub.currentPeriodEnd } : { grants: false, until: null };
    default:
      return { grants: false, until: null };
  }
}

export interface LearnerAccess {
  tier: MembershipTier;
  intelliaPlay: boolean;
  membershipEndsAt: Date | null;
  intelliaPlayEndsAt: Date | null;
}

const later = (a: Date | null, b: Date | null) => (a === null || b === null ? null : a > b ? a : b);

/** Combine every purchase and grant covering one learner. */
export function combineAccess(subs: SubscriptionRow[], grants: GrantRow[], now: Date): LearnerAccess {
  const out: LearnerAccess = { tier: "FREE", intelliaPlay: false, membershipEndsAt: null, intelliaPlayEndsAt: null };
  let membershipSeen = false;
  let playSeen = false;

  const take = (product: string, tier: string, until: Date | null) => {
    if (product === "INTELLIAPLAY") {
      out.intelliaPlayEndsAt = playSeen ? later(out.intelliaPlayEndsAt, until) : until;
      out.intelliaPlay = true;
      playSeen = true;
    } else if (tier === "CORE" || tier === "PLUS" || tier === "ULTRA") {
      out.membershipEndsAt = membershipSeen ? later(out.membershipEndsAt, until) : until;
      out.tier = higherTier(out.tier, tier);
      membershipSeen = true;
    }
  };

  for (const sub of subs) {
    const { grants: ok, until } = purchaseAccess(sub, now);
    if (ok) take(sub.product, sub.tier, until);
  }
  for (const grant of grants) {
    if (!grant.revokedAt && grant.validUntil > now) take(grant.product, grant.tier, grant.validUntil);
  }
  return out;
}

/** Every purchase and live grant that could cover any of `userIds`. */
async function coverage(db: BillingDb, userIds: string[], now: Date) {
  const [subs, grants] = await Promise.all([
    db.membershipSubscription.findMany({
      where: { learnerIds: { hasSome: userIds }, status: { in: ACCESS_STATUSES } },
    }) as Promise<SubscriptionRow[]>,
    db.membershipGrant.findMany({
      where: { userId: { in: userIds }, revokedAt: null, validUntil: { gte: now } },
    }) as Promise<GrantRow[]>,
  ]);
  return { subs, grants };
}

export async function learnerAccess(db: BillingDb, userId: string, now: Date): Promise<LearnerAccess> {
  return (await learnerAccessMany(db, [userId], now)).get(userId)!;
}

export async function learnerAccessMany(db: BillingDb, userIds: string[], now: Date): Promise<Map<string, LearnerAccess>> {
  const out = new Map<string, LearnerAccess>();
  if (userIds.length === 0) return out;
  const { subs, grants } = await coverage(db, userIds, now);
  for (const id of userIds) {
    out.set(
      id,
      combineAccess(
        subs.filter((s) => s.learnerIds.includes(id)),
        grants.filter((g) => g.userId === id),
        now
      )
    );
  }
  return out;
}

/**
 * The access summary the API enforces and the portal shows. Administrators,
 * and everyone while sales are closed, get everything, unlimited. Once sales
 * are open, a learner without a membership gets nothing (hasMembership false).
 */
export async function membershipAccess(
  db: BillingDb,
  user: { userId: string; role: UserRole },
  now: Date
): Promise<MembershipAccess> {
  const [enabled, plans, access, used] = await Promise.all([
    salesOpen(db),
    readPlans(db),
    learnerAccess(db, user.userId, now),
    readAllowance(db, user.userId, AI_TUTOR_FEATURE, dayKey(now)),
  ]);
  const open = !enabled || user.role === "ADMIN";

  return {
    billingEnabled: enabled,
    hasMembership: open || access.tier !== "FREE",
    tier: user.role === "ADMIN" ? "ULTRA" : access.tier,
    intelliaPlay: open || access.intelliaPlay,
    limits: open ? UNRESTRICTED_LIMITS : limitsFor(plans, access.tier),
    membershipEndsAt: access.membershipEndsAt?.toISOString() ?? null,
    intelliaPlayEndsAt: access.intelliaPlayEndsAt?.toISOString() ?? null,
    aiTutorUsedToday: used,
  };
}
