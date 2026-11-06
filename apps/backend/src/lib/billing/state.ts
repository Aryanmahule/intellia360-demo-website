/**
 * The administrator-controlled billing state: the plans (names, feature lists,
 * limits, which are on sale) and the settings (sales switch, family discount,
 * trial length).
 *
 * Read on most student requests, so it is cached for a few seconds per
 * database client. The API runs as a single process (deploy/ecosystem.config.js),
 * and every administrator write clears the cache, so an edit shows at once.
 * Reads never write: missing rows fall back to the shared defaults, so a fresh
 * database needs no seeding before the first student request.
 */
import {
  DEFAULT_FAMILY_DISCOUNT_PERCENT,
  DEFAULT_TRIAL_DAYS,
  NO_ACCESS_LIMITS,
  PLAN_TIERS,
  defaultPlan,
  productForTier,
  type MembershipTier,
  type PlanConfig,
  type PlanTier,
  type TierLimits,
} from "@intellia360/shared/billing/plans";
import type { AdminPlanRow } from "@intellia360/shared/types/api/billing";
import { serverLocksSales, serverSalesDefault } from "./config";
import { BillingError, type BillingDb } from "./deps";

export const SETTINGS_ID = "global";
const CACHE_MS = 15_000;

export interface BillingSettingsView {
  familyDiscountPercent: number;
  trialDays: number;
  /** The administrators' switch; null when never set. */
  salesSwitch: boolean | null;
}

export const DEFAULT_SETTINGS: BillingSettingsView = {
  familyDiscountPercent: DEFAULT_FAMILY_DISCOUNT_PERCENT,
  trialDays: DEFAULT_TRIAL_DAYS,
  salesSwitch: null,
};

export function settingsView(
  row: { familyDiscountPercent: number; trialDays?: number | null; salesEnabled?: boolean | null } | null
): BillingSettingsView {
  if (!row) return DEFAULT_SETTINGS;
  return {
    familyDiscountPercent: row.familyDiscountPercent,
    trialDays: row.trialDays ?? DEFAULT_TRIAL_DAYS,
    salesSwitch: row.salesEnabled ?? null,
  };
}

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  highlights: string[];
  onSale: boolean;
  featured: boolean;
  sortOrder: number;
  aiTutorPerDay: number | null;
  learningPath: boolean;
  gemMultiplier: number;
  monthlyBonusGems: number;
  prioritySupport: boolean;
  updatedBy?: string | null;
  updatedAt?: Date | null;
}

function fromRow(row: PlanRow): PlanConfig {
  const tier = row.id as PlanTier;
  return {
    tier,
    product: productForTier(tier),
    name: row.name,
    tagline: row.tagline,
    highlights: row.highlights,
    onSale: row.onSale,
    featured: row.featured,
    sortOrder: row.sortOrder,
    limits:
      tier === "INTELLIAPLAY"
        ? null
        : {
            aiTutorPerDay: row.aiTutorPerDay ?? null,
            learningPath: row.learningPath,
            gemMultiplier: row.gemMultiplier,
            monthlyBonusGems: row.monthlyBonusGems,
            prioritySupport: row.prioritySupport,
          },
  };
}

const bySortOrder = (a: PlanConfig, b: PlanConfig) => a.sortOrder - b.sortOrder;

interface State {
  at: number;
  plans: PlanConfig[];
  rows: Map<string, PlanRow>;
  settings: BillingSettingsView;
}

const cache = new WeakMap<object, State>();

async function load(db: BillingDb): Promise<State> {
  const hit = cache.get(db);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const [rows, settings] = await Promise.all([
    db.planConfig.findMany({}) as Promise<PlanRow[]>,
    db.billingSettings.findUnique({ where: { id: SETTINGS_ID } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const state: State = {
    at: Date.now(),
    rows: byId,
    plans: PLAN_TIERS.map((tier) => (byId.has(tier) ? fromRow(byId.get(tier)!) : { ...defaultPlan(tier) })).sort(bySortOrder),
    settings: settingsView(settings),
  };
  cache.set(db, state);
  return state;
}

/** Forget the cached state (after an administrator's edit). */
export function invalidateBillingState(db: BillingDb): void {
  cache.delete(db);
}

export async function readPlans(db: BillingDb): Promise<PlanConfig[]> {
  return (await load(db)).plans;
}

export async function readSettings(db: BillingDb): Promise<BillingSettingsView> {
  return (await load(db)).settings;
}

/**
 * Whether memberships are on sale. While they are not, nothing is locked or
 * limited: the portal behaves as it did before billing existed.
 */
export async function salesOpen(db: BillingDb): Promise<boolean> {
  if (serverLocksSales()) return false;
  const { salesSwitch } = await readSettings(db);
  return salesSwitch ?? serverSalesDefault();
}

export function plansOnSale(plans: readonly PlanConfig[]): PlanConfig[] {
  return plans.filter((p) => p.onSale).sort(bySortOrder);
}

export function findPlan(plans: readonly PlanConfig[], tier: string): PlanConfig | undefined {
  return plans.find((p) => p.tier === tier);
}

/** What a membership level unlocks. FREE (no membership) unlocks nothing. */
export function limitsFor(plans: readonly PlanConfig[], tier: MembershipTier): TierLimits {
  if (tier === "FREE") return NO_ACCESS_LIMITS;
  return findPlan(plans, tier)?.limits ?? defaultPlan(tier).limits ?? NO_ACCESS_LIMITS;
}

// ─── Administrator edits ──────────────────────────────────────────────────────

export async function adminPlans(db: BillingDb): Promise<AdminPlanRow[]> {
  const state = await load(db);
  return state.plans.map((p) => {
    const row = state.rows.get(p.tier);
    return { ...p, updatedAt: row?.updatedAt?.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  });
}

export interface PlanUpdate {
  tier: string;
  name: string;
  tagline: string;
  highlights: string[];
  onSale: boolean;
  featured: boolean;
  sortOrder: number;
  limits?: TierLimits | null;
}

function cleanText(value: string, label: string, max: number, required = true): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (required && !text) throw new BillingError(`${label} can't be empty.`);
  if (text.length > max) throw new BillingError(`${label} must be ${max} characters or fewer.`);
  return text;
}

function intIn(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new BillingError(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

type PlanWrite = Omit<PlanRow, "updatedAt" | "updatedBy">;

function validate(update: PlanUpdate): PlanWrite {
  if (!PLAN_TIERS.includes(update.tier as PlanTier)) throw new BillingError(`Unknown plan ${update.tier}.`);
  const tier = update.tier as PlanTier;
  const highlights = update.highlights.map((h) => cleanText(h, "A feature line", 120, false)).filter(Boolean);
  if (highlights.length > 12) throw new BillingError("A plan can list at most 12 features.");

  const base = {
    id: tier,
    name: cleanText(update.name, "The plan name", 40),
    tagline: cleanText(update.tagline, "The description", 160, false),
    highlights,
    onSale: update.onSale === true,
    featured: update.featured === true,
    sortOrder: intIn(update.sortOrder, "The order", 0, 99),
  };
  if (tier === "INTELLIAPLAY") {
    return { ...base, aiTutorPerDay: null, learningPath: false, gemMultiplier: 1, monthlyBonusGems: 0, prioritySupport: false };
  }

  const limits = update.limits ?? defaultPlan(tier).limits!;
  return {
    ...base,
    aiTutorPerDay: limits.aiTutorPerDay === null ? null : intIn(limits.aiTutorPerDay, "AI Tutor questions a day", 0, 10_000),
    learningPath: limits.learningPath === true,
    gemMultiplier: intIn(limits.gemMultiplier, "The gem multiplier", 1, 10),
    monthlyBonusGems: intIn(limits.monthlyBonusGems, "Monthly bonus gems", 0, 100_000),
    prioritySupport: limits.prioritySupport === true,
  };
}

/**
 * Save plan edits. The whole batch is validated before anything is written.
 * Unlisted plans are left as they are.
 */
export async function savePlans(db: BillingDb, updates: PlanUpdate[], adminEmail: string): Promise<void> {
  const rows = updates.map(validate);
  const merged = new Map((await readPlans(db)).map((p) => [p.tier, p]));
  for (const row of rows) merged.set(row.id as PlanTier, fromRow(row));
  if (![...merged.values()].some((p) => p.product === "MEMBERSHIP" && p.onSale)) {
    throw new BillingError("At least one membership plan must stay on sale: without one, nobody can start learning.");
  }

  for (const { id, ...data } of rows) {
    await db.planConfig.upsert({
      where: { id },
      create: { id, ...data, updatedBy: adminEmail },
      update: { ...data, updatedBy: adminEmail },
    });
  }
  invalidateBillingState(db);
}

