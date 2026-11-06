/**
 * Membership effects on rewards: the gem multiplier (gems only — the
 * leaderboard ranks by XP, so paying never buys a place on it) and the
 * monthly bonus gems, both as administrators set them per plan.
 */
import type { UserRole } from "@intellia360/shared/types/auth";
import { learnerAccess } from "./access";
import { limitsFor, readPlans, salesOpen } from "./state";
import { BONUS_GEMS_FEATURE, claimOncePerPeriod, monthKey } from "./quota";
import type { BillingDb } from "./deps";

/** Multiplier for gems a learner earns now. 1 while billing is off, and on any error. */
export async function gemMultiplier(db: BillingDb, user: { userId: string; role: UserRole }, now: Date): Promise<number> {
  if (user.role === "ADMIN") return 1;
  try {
    if (!(await salesOpen(db))) return 1;
    const [plans, access] = await Promise.all([readPlans(db), learnerAccess(db, user.userId, now)]);
    return limitsFor(plans, access.tier).gemMultiplier;
  } catch (err) {
    console.error("[billing/rewards] multiplier unavailable:", (err as Error).message);
    return 1;
  }
}

/**
 * Credit this month's bonus gems once, when the learner's level includes them.
 * Returns the gems awarded (0 when nothing was due).
 */
export async function awardMonthlyBonusGems(db: BillingDb, user: { userId: string; role: UserRole }, now: Date): Promise<number> {
  if (user.role === "ADMIN") return 0;
  try {
    if (!(await salesOpen(db))) return 0;
    const [plans, access] = await Promise.all([readPlans(db), learnerAccess(db, user.userId, now)]);
    const gems = limitsFor(plans, access.tier).monthlyBonusGems;
    if (gems <= 0) return 0;
    if (!(await claimOncePerPeriod(db, { userId: user.userId, feature: BONUS_GEMS_FEATURE, periodKey: monthKey(now) }))) return 0;
    await db.studentProfile.update({ where: { userId: user.userId }, data: { learningGems: { increment: gems } } });
    await db.notification.create({
      data: {
        userId: user.userId,
        type: "xp",
        tabCategory: "achievements",
        icon: "💎",
        iconBg: "rgba(124, 58, 237, 0.12)",
        title: `Ultra bonus: +${gems} gems`,
        description: "Your monthly Ultra bonus gems have been added to your balance.",
        categoryTag: "Rewards",
        actionUrl: "/student/rewards",
        actionText: "See rewards →",
        isRead: false,
      },
    });
    return gems;
  } catch (err) {
    console.error("[billing/rewards] bonus not awarded:", (err as Error).message);
    return 0;
  }
}
