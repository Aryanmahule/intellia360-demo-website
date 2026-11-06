/**
 * Allowances counted per learner per period: AI Tutor questions per UTC day,
 * Ultra's bonus gems per UTC month.
 *
 * consumeAllowance only increments while the count is under the limit
 * (a conditional updateMany), so two requests racing for the last question
 * cannot both get it.
 */
import { isUniqueViolation, type BillingDb } from "./deps";

export const AI_TUTOR_FEATURE = "ai-tutor";
export const BONUS_GEMS_FEATURE = "bonus-gems";

export const dayKey = (now: Date) => now.toISOString().slice(0, 10);
export const monthKey = (now: Date) => now.toISOString().slice(0, 7);

export async function readAllowance(db: BillingDb, userId: string, feature: string, periodKey: string): Promise<number> {
  const row = await db.usageCounter.findUnique({
    where: { userId_feature_periodKey: { userId, feature, periodKey } },
  });
  return row?.count ?? 0;
}

/**
 * Spend one unit of an allowance. `limit` null means unlimited (still counted).
 * Returns whether it was allowed and the count afterwards.
 */
export async function consumeAllowance(
  db: BillingDb,
  args: { userId: string; feature: string; periodKey: string; limit: number | null }
): Promise<{ allowed: boolean; used: number }> {
  const { userId, feature, periodKey, limit } = args;
  if (limit !== null && limit <= 0) return { allowed: false, used: await readAllowance(db, userId, feature, periodKey) };

  for (let attempt = 0; attempt < 2; attempt++) {
    const where = { userId, feature, periodKey, ...(limit === null ? {} : { count: { lt: limit } }) };
    const updated = await db.usageCounter.updateMany({ where, data: { count: { increment: 1 } } });
    if (updated.count === 1) return { allowed: true, used: await readAllowance(db, userId, feature, periodKey) };

    const existing = await readAllowance(db, userId, feature, periodKey);
    if (existing > 0) return { allowed: false, used: existing };

    try {
      await db.usageCounter.create({ data: { userId, feature, periodKey, count: 1 } });
      return { allowed: true, used: 1 };
    } catch (err) {
      // Another request created the counter first: go round once more.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return { allowed: false, used: await readAllowance(db, userId, feature, periodKey) };
}

/** Give back one unit — the work it paid for failed (the AI Tutor was unreachable). */
export async function releaseAllowance(db: BillingDb, args: { userId: string; feature: string; periodKey: string }): Promise<void> {
  const { userId, feature, periodKey } = args;
  await db.usageCounter.updateMany({
    where: { userId, feature, periodKey, count: { gte: 1 } },
    data: { count: { increment: -1 } },
  });
}

/**
 * Claim a once-per-period award (Ultra's monthly bonus gems). True only for
 * the single request that creates the period's counter.
 */
export async function claimOncePerPeriod(
  db: BillingDb,
  args: { userId: string; feature: string; periodKey: string }
): Promise<boolean> {
  const { userId, feature, periodKey } = args;
  try {
    await db.usageCounter.create({ data: { userId, feature, periodKey, count: 1 } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}
