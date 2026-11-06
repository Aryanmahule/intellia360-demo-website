/**
 * Administrator views and actions: the price book and sales switch, every
 * purchase (cancel, extend, change), complimentary grants and a manual sync
 * with Razorpay.
 */
import { isValidPlan, productForTier, type BillingProduct, type PlanTier } from "@intellia360/shared/billing/plans";
import type {
  AdminGrantRow,
  AdminPriceBook,
  AdminSubscriptionRow,
} from "@intellia360/shared/types/api/billing";
import { DAY_MS, razorpayKeys, serverLocksSales } from "./config";
import { BillingError, type BillingDb, type BillingDeps } from "./deps";
import { activePrices, currentPrices, ensurePriceBook } from "./catalog";
import { FINAL_STATUSES, syncPurchase, toSubscriptionView } from "./subscriptions";
import { purchaseAccess, type SubscriptionRow } from "./access";
import { cancelRecord, schedulePlanChange } from "./checkout";
import { salesOpen } from "./state";

export async function adminPriceBook(db: BillingDb): Promise<AdminPriceBook> {
  const settings = await ensurePriceBook(db);
  const prices = currentPrices(await activePrices(db));
  return {
    prices: prices
      .map((p) => ({
        id: p.id,
        product: p.product as BillingProduct,
        tier: p.tier as PlanTier,
        interval: p.interval as AdminPriceBook["prices"][number]["interval"],
        currency: p.currency,
        amountMinor: p.amountMinor,
        version: p.version,
        createdAt: p.createdAt.toISOString(),
        createdBy: p.createdBy,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    familyDiscountPercent: settings.familyDiscountPercent,
    trialDays: settings.trialDays,
    gatewayConfigured: razorpayKeys() !== null,
    billingEnabled: await salesOpen(db),
    salesSwitch: settings.salesSwitch,
    serverLocked: serverLocksSales(),
  };
}

async function userNames(db: BillingDb, ids: string[]) {
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, email: true } })
    : [];
  return new Map(users.map((u) => [u.id, u]));
}

export async function adminSubscriptions(
  db: BillingDb,
  filter: { status?: string | null; product?: string | null },
  now: Date
): Promise<AdminSubscriptionRow[]> {
  const rows = (await db.membershipSubscription.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : { status: { not: "CREATED" } }),
      ...(filter.product ? { product: filter.product } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })) as SubscriptionRow[];
  const users = await userNames(db, rows.flatMap((r) => [r.payerUserId, ...r.learnerIds]));
  const names = new Map([...users.values()].map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...toSubscriptionView(r, names, now),
    payer: users.get(r.payerUserId) ?? { id: r.payerUserId, name: "Deleted account", email: "" },
    gatewayId: r.gatewayId,
  }));
}

export async function adminGrants(db: BillingDb): Promise<AdminGrantRow[]> {
  const rows = await db.membershipGrant.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const users = await userNames(db, rows.map((r) => r.userId));
  return rows.map((r) => ({
    id: r.id,
    user: users.get(r.userId) ?? { id: r.userId, name: "Deleted account", email: "" },
    product: r.product as BillingProduct,
    tier: r.tier as PlanTier,
    validUntil: r.validUntil.toISOString(),
    reason: r.reason,
    grantedBy: r.grantedBy,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createGrant(
  db: BillingDb,
  admin: { email: string },
  input: { email: string; tier: PlanTier; days: number; reason?: string | null },
  now: Date
) {
  const product = productForTier(input.tier);
  if (!isValidPlan(product, input.tier)) throw new BillingError("Unknown plan.");
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 3660) {
    throw new BillingError("Days must be a whole number from 1 to 3660.");
  }
  const user = await db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user || user.deletedAt) throw new BillingError("No active account has that email.", 404);

  return db.membershipGrant.create({
    data: {
      userId: user.id,
      product,
      tier: input.tier,
      validUntil: new Date(now.getTime() + input.days * DAY_MS),
      reason: input.reason?.trim() || null,
      grantedBy: admin.email,
    },
  });
}

/**
 * Give every learner account (students and parents) the same complimentary
 * access — the launch-day grace, or access for a whole school. Returns how
 * many grants were written.
 */
export async function createGrantForAllLearners(
  db: BillingDb,
  admin: { email: string },
  input: { tier: PlanTier; days: number; reason?: string | null },
  now: Date
): Promise<number> {
  const product = productForTier(input.tier);
  if (!isValidPlan(product, input.tier)) throw new BillingError("Unknown plan.");
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 3660) {
    throw new BillingError("Days must be a whole number from 1 to 3660.");
  }
  const learners = await db.user.findMany({
    where: { role: { in: ["STUDENT", "PARENT"] }, deletedAt: null },
    select: { id: true },
  });
  if (learners.length === 0) return 0;
  const validUntil = new Date(now.getTime() + input.days * DAY_MS);
  const reason = input.reason?.trim() || null;
  const result = await db.membershipGrant.createMany({
    data: learners.map((u) => ({ userId: u.id, product, tier: input.tier, validUntil, reason, grantedBy: admin.email })),
  });
  return result.count;
}

// ─── Managing a customer's purchase ───────────────────────────────────────────

async function purchase(deps: BillingDeps, id: string): Promise<SubscriptionRow> {
  const record = (await deps.db.membershipSubscription.findUnique({ where: { id } })) as SubscriptionRow | null;
  if (!record) throw new BillingError("Purchase not found.", 404);
  return record;
}

/** Cancel any customer's purchase: at the end of the paid period, or now (access ends at once). */
export async function adminCancelPurchase(deps: BillingDeps, id: string, endAccessNow: boolean): Promise<SubscriptionRow> {
  if (!razorpayKeys()) throw new BillingError("Razorpay keys are not configured.", 503);
  return cancelRecord(deps, await purchase(deps, id), { endAccessNow });
}

/**
 * Extend a customer's access by `days`, free of charge, from the end of what
 * they have now. Written as grants for each learner on the purchase, so
 * Razorpay's own billing dates are left alone.
 */
export async function adminExtendPurchase(
  deps: BillingDeps,
  admin: { email: string },
  id: string,
  days: number
): Promise<number> {
  if (!Number.isInteger(days) || days < 1 || days > 3660) throw new BillingError("Days must be a whole number from 1 to 3660.");
  const record = await purchase(deps, id);
  const now = deps.now();
  const until = purchaseAccess(record, now).until;
  const from = until && until > now ? until : now;
  const validUntil = new Date(from.getTime() + days * DAY_MS);
  for (const userId of record.learnerIds) {
    await deps.db.membershipGrant.create({
      data: {
        userId,
        product: record.product,
        tier: record.tier,
        validUntil,
        reason: `Extension of ${record.gatewayId} by ${days} day${days === 1 ? "" : "s"}`,
        grantedBy: admin.email,
      },
    });
  }
  return record.learnerIds.length;
}

/** Change any customer's level or learners from their next renewal (as they could themselves). */
export async function adminChangePurchase(
  deps: BillingDeps,
  id: string,
  input: { tier: PlanTier; learnerIds: string[] }
): Promise<SubscriptionRow> {
  const record = await purchase(deps, id);
  const payer = await deps.db.user.findUnique({ where: { id: record.payerUserId }, select: { id: true, name: true, email: true } });
  if (!payer) throw new BillingError("The payer's account no longer exists.", 404);
  return schedulePlanChange(deps, { userId: payer.id, name: payer.name, email: payer.email }, id, input);
}

export async function revokeGrant(db: BillingDb, id: string, now: Date) {
  const grant = await db.membershipGrant.findUnique({ where: { id } });
  if (!grant) throw new BillingError("Grant not found.", 404);
  if (grant.revokedAt) return grant;
  return db.membershipGrant.update({ where: { id }, data: { revokedAt: now } });
}

/**
 * Re-read every purchase that can still change from Razorpay. Repairs anything
 * a missed webhook left behind.
 */
export async function reconcileAll(deps: BillingDeps, limit = 200): Promise<{ checked: number; failed: number }> {
  if (!razorpayKeys()) throw new BillingError("Razorpay keys are not configured.", 503);
  const now = deps.now().getTime();
  const open = ((await deps.db.membershipSubscription.findMany({
    where: { status: { in: ["CREATED", "AUTHENTICATED", "ACTIVE", "PENDING", "HALTED", "PAUSED"] } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  })) as SubscriptionRow[]).filter(
    (r) => !FINAL_STATUSES.has(r.status) && !(r.status === "CREATED" && now - r.createdAt.getTime() > 2 * DAY_MS)
  );

  let failed = 0;
  for (const record of open) {
    try {
      await syncPurchase(deps, record);
    } catch (err) {
      failed++;
      console.error("[billing/reconcile]", record.id, (err as Error).message);
    }
  }
  return { checked: open.length, failed };
}
