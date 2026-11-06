/**
 * The price book: what each plan costs, per currency, as administrators set it.
 *
 * A currency is on sale only when every plan on sale has both a monthly and an
 * annual price in it, so a buyer never meets a half-priced page. Edits write a
 * new version and retire the old one; the highest active version wins, so
 * there is never a moment with no price.
 */
import {
  BILLING_INTERVALS,
  DEFAULT_FAMILY_DISCOUNT_PERCENT,
  MAX_TRIAL_DAYS,
  DEFAULT_PRICE_BOOK,
  MAX_SEATS,
  PRICED_PLANS,
  isValidPlan,
  type BillingInterval,
  type BillingProduct,
  type PlanTier,
} from "@intellia360/shared/billing/plans";
import { FALLBACK_CURRENCY, isSupportedCurrency, toMinorUnits } from "@intellia360/shared/billing/currencies";
import { HOME_CURRENCY, allowedCurrencies, cardRequired, getCountry } from "@intellia360/shared/billing/countries";
import type { BillingCatalog, CatalogPrice } from "@intellia360/shared/types/api/billing";
import { BillingError, isUniqueViolation, type BillingDb } from "./deps";
import {
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  invalidateBillingState,
  plansOnSale,
  readPlans,
  salesOpen,
  settingsView,
  type BillingSettingsView,
} from "./state";

export type { BillingSettingsView };

export interface PriceRow {
  id: string;
  product: string;
  tier: string;
  interval: string;
  currency: string;
  amountMinor: number;
  version: number;
  active: boolean;
  razorpayPlans: unknown;
  createdBy: string | null;
  createdAt: Date;
}

/** The smallest price accepted, in minor units (Razorpay's floor is one unit). */
const MIN_AMOUNT_MINOR: Record<string, number> = { INR: 100 };

/**
 * Billing settings, seeding the price book from DEFAULT_PRICE_BOOK the first
 * time anything asks. Creating the settings singleton is the lock: only the
 * request that creates it writes the starting prices.
 */
export async function ensurePriceBook(db: BillingDb): Promise<BillingSettingsView> {
  const existing = await db.billingSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return settingsView(existing);

  try {
    await db.billingSettings.create({
      data: { id: SETTINGS_ID, familyDiscountPercent: DEFAULT_FAMILY_DISCOUNT_PERCENT },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const settings = await db.billingSettings.findUnique({ where: { id: SETTINGS_ID } });
    return settings ? settingsView(settings) : DEFAULT_SETTINGS;
  }

  for (const [currency, plans] of Object.entries(DEFAULT_PRICE_BOOK)) {
    for (const { product, tier } of PRICED_PLANS) {
      for (const [i, interval] of BILLING_INTERVALS.entries()) {
        const amountMinor = toMinorUnits(plans[tier][i], currency);
        if (amountMinor === null) continue;
        await db.planPrice.create({
          data: { product, tier, interval, currency, amountMinor, version: 1, active: true, createdBy: "default" },
        });
      }
    }
  }
  invalidateBillingState(db);
  return DEFAULT_SETTINGS;
}

export async function activePrices(db: BillingDb): Promise<PriceRow[]> {
  return (await db.planPrice.findMany({ where: { active: true } })) as PriceRow[];
}

const key = (p: { product: string; tier: string; interval: string; currency: string }) =>
  `${p.product}|${p.tier}|${p.interval}|${p.currency}`;

/** The current price for each plan: the highest active version. */
export function currentPrices(rows: PriceRow[]): PriceRow[] {
  const best = new Map<string, PriceRow>();
  for (const row of rows) {
    if (!row.active) continue;
    const k = key(row);
    const seen = best.get(k);
    if (!seen || row.version > seen.version) best.set(k, row);
  }
  return [...best.values()];
}

export function findPrice(
  rows: PriceRow[],
  plan: { product: BillingProduct; tier: PlanTier; interval: BillingInterval; currency: string }
): PriceRow | null {
  return currentPrices(rows).find((r) => key(r) === key(plan)) ?? null;
}

/** Currencies with a monthly and an annual price for every one of `tiers` (default: every plan). */
export function completeCurrencies(
  rows: PriceRow[],
  tiers: readonly string[] = PRICED_PLANS.map((p) => p.tier)
): string[] {
  const needed = tiers.length * BILLING_INTERVALS.length;
  if (needed === 0) return [];
  const counts = new Map<string, number>();
  for (const row of currentPrices(rows)) {
    if (!isValidPlan(row.product, row.tier) || !tiers.includes(row.tier)) continue;
    counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= needed).map(([c]) => c).sort();
}

export function toCatalogPrice(row: PriceRow): CatalogPrice {
  return {
    priceId: row.id,
    product: row.product as BillingProduct,
    tier: row.tier as PlanTier,
    interval: row.interval as BillingInterval,
    currency: row.currency,
    amountMinor: row.amountMinor,
  };
}

/**
 * GET /api/billing/catalog: the plans on sale, and their prices for the
 * country the buyer chose, in the requested currency when allowed. Without a
 * country the plans come back with no prices: nothing is guessed.
 */
export async function buildCatalog(
  db: BillingDb,
  input: { country?: string | null; currency?: string | null }
): Promise<BillingCatalog> {
  const settings = await ensurePriceBook(db);
  const [rows, plans, open] = await Promise.all([activePrices(db), readPlans(db), salesOpen(db)]);
  const sale = plansOnSale(plans);
  const tiers = sale.map((p) => p.tier);
  const priced = completeCurrencies(rows, tiers);
  const country = getCountry(input.country)?.code ?? null;
  const allowed = country ? allowedCurrencies(country, priced) : [];
  const requested = input.currency?.toUpperCase();
  const currency = requested && allowed.includes(requested) ? requested : allowed[0] ?? null;

  return {
    billingEnabled: open,
    country,
    currency,
    plans: sale,
    allowedCurrencies: allowed,
    pricedCurrencies: priced,
    familyDiscountPercent: settings.familyDiscountPercent,
    maxSeats: MAX_SEATS,
    trialDays: settings.trialDays,
    cardRequired: country ? cardRequired(country) : false,
    prices: currency
      ? currentPrices(rows)
          .filter((r) => r.currency === currency && tiers.includes(r.tier as PlanTier))
          .map(toCatalogPrice)
      : [],
  };
}

// ─── Administrator edits ──────────────────────────────────────────────────────

export interface PriceChange {
  product: string;
  tier: string;
  interval: string;
  currency: string;
  /** Major units as typed: "1799", "47.99". */
  amount: string;
}

function validateChange(change: PriceChange): { minor: number; plan: Parameters<typeof findPrice>[1] } {
  const currency = change.currency.toUpperCase();
  if (!isValidPlan(change.product, change.tier)) throw new BillingError(`Unknown plan ${change.product}/${change.tier}.`);
  if (!BILLING_INTERVALS.includes(change.interval as BillingInterval)) throw new BillingError(`Unknown billing period ${change.interval}.`);
  if (!isSupportedCurrency(currency)) throw new BillingError(`${currency} is not a currency Razorpay accepts.`);
  const minor = toMinorUnits(change.amount, currency);
  if (minor === null || minor <= 0) throw new BillingError(`"${change.amount}" is not a valid ${currency} price.`);
  if (minor < (MIN_AMOUNT_MINOR[currency] ?? 1)) throw new BillingError(`${currency} prices must be at least 1.`);
  return {
    minor,
    plan: {
      product: change.product as BillingProduct,
      tier: change.tier as PlanTier,
      interval: change.interval as BillingInterval,
      currency,
    },
  };
}

/**
 * Apply a batch of price edits. Validates the whole batch before writing any
 * of it. Unchanged prices are skipped. Returns the number of prices changed.
 */
export async function applyPriceChanges(
  db: BillingDb,
  changes: PriceChange[],
  adminEmail: string,
  now: Date
): Promise<number> {
  const validated = changes.map(validateChange);
  const rows = await activePrices(db);
  let changed = 0;

  for (const { minor, plan } of validated) {
    const current = findPrice(rows, plan);
    if (current && current.amountMinor === minor) continue;
    // New version first, then retire the old one: there is never a moment
    // without a price, and currentPrices() picks the higher version meanwhile.
    const created = (await db.planPrice.create({
      data: { ...plan, amountMinor: minor, version: (current?.version ?? 0) + 1, active: true, createdBy: adminEmail },
    })) as PriceRow;
    if (current) {
      await db.planPrice.update({ where: { id: current.id }, data: { active: false, retiredAt: now } });
      rows.splice(rows.indexOf(current), 1);
    }
    rows.push(created);
    changed++;
  }
  return changed;
}

/** Take a currency off sale. INR (India) and USD (everyone else) always stay. */
export async function retireCurrency(db: BillingDb, currency: string, now: Date): Promise<number> {
  const code = currency.toUpperCase();
  if (code === HOME_CURRENCY || code === FALLBACK_CURRENCY) {
    throw new BillingError(`${code} cannot be removed: ${code === HOME_CURRENCY ? "India pays in INR" : "it is the currency for every other country"}.`);
  }
  const result = await db.planPrice.updateMany({
    where: { currency: code, active: true },
    data: { active: false, retiredAt: now },
  });
  return result.count;
}

export async function setFamilyDiscount(db: BillingDb, percent: number, adminEmail: string): Promise<void> {
  if (!Number.isInteger(percent) || percent < 0 || percent > 90) {
    throw new BillingError("The family discount must be a whole number from 0 to 90.");
  }
  await ensurePriceBook(db);
  await db.billingSettings.update({
    where: { id: SETTINGS_ID },
    data: { familyDiscountPercent: percent, updatedBy: adminEmail },
  });
  invalidateBillingState(db);
}

export async function setTrialDays(db: BillingDb, days: number, adminEmail: string): Promise<void> {
  if (!Number.isInteger(days) || days < 0 || days > MAX_TRIAL_DAYS) {
    throw new BillingError(`The free trial must be a whole number of days from 0 to ${MAX_TRIAL_DAYS}.`);
  }
  await ensurePriceBook(db);
  await db.billingSettings.update({ where: { id: SETTINGS_ID }, data: { trialDays: days, updatedBy: adminEmail } });
  invalidateBillingState(db);
}

/** The administrators' sales switch. */
export async function setSalesSwitch(db: BillingDb, open: boolean, adminEmail: string): Promise<void> {
  await ensurePriceBook(db);
  await db.billingSettings.update({ where: { id: SETTINGS_ID }, data: { salesEnabled: open, updatedBy: adminEmail } });
  invalidateBillingState(db);
}
