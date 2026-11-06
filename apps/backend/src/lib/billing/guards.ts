/**
 * Route guards for paid features. A locked feature answers 402 with the plan
 * that unlocks it, so the portal can offer the right upgrade:
 *
 *   { success: false, message, upgrade: { product, tier } }
 *
 * Every learning route calls requireMembership() after the session check:
 * once sales are open, a learner needs a membership (a trial, a paid plan or
 * access an administrator gave) to use the portal. New IntelliaPlay game
 * routes call requireIntelliaPlay() the same way.
 */
import { NextResponse } from "next/server";
import type { BillingProduct, PlanTier } from "@intellia360/shared/billing/plans";
import type { MembershipAccess } from "@intellia360/shared/types/api/billing";
import type { UserRole } from "@intellia360/shared/types/auth";
import { db } from "@/lib/db";
import { membershipAccess } from "./access";

export function upgradeRequired(message: string, product: BillingProduct, tier: PlanTier): NextResponse {
  return NextResponse.json({ success: false, message, upgrade: { product, tier } }, { status: 402 });
}

export async function accessFor(session: { userId: string; role: UserRole }): Promise<MembershipAccess> {
  return membershipAccess(db, session, new Date());
}

export async function requireIntelliaPlay(session: { userId: string; role: UserRole }): Promise<NextResponse | null> {
  const access = await accessFor(session);
  return access.intelliaPlay
    ? null
    : upgradeRequired("IntelliaPlay is a separate add-on. Get it on your membership page.", "INTELLIAPLAY", "INTELLIAPLAY");
}

const NEEDS_MEMBERSHIP = "Start your free trial or choose a membership to keep learning.";

/** 402 unless the learner may use the portal (see MembershipAccess.hasMembership). */
export async function requireMembership(session: { userId: string; role: UserRole }): Promise<NextResponse | null> {
  const access = await accessFor(session);
  return access.hasMembership ? null : upgradeRequired(NEEDS_MEMBERSHIP, "MEMBERSHIP", "PLUS");
}

export async function requireLearningPath(session: { userId: string; role: UserRole }): Promise<NextResponse | null> {
  const access = await accessFor(session);
  if (!access.hasMembership) return upgradeRequired(NEEDS_MEMBERSHIP, "MEMBERSHIP", "PLUS");
  return access.limits.learningPath
    ? null
    : upgradeRequired("Smart Practice isn't part of your membership. Choose a plan that includes it.", "MEMBERSHIP", "PLUS");
}
