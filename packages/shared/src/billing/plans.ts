/**
 * What Intellia360 sells and how a family price is worked out. Shared by the
 * pricing page, the student portal's locks and the API's checks, the same way
 * auth/roles.ts is for roles.
 *
 * Two products:
 *   • MEMBERSHIP — the levels a learner needs to use the student portal
 *     (Plus and Ultra on sale; Core exists but is off sale). Without one, a
 *     learner sees only the membership page once sales are open.
 *   • INTELLIAPLAY — the IntelliaPlay section of the student portal, sold on
 *     its own: it can be bought with or without a membership.
 *
 * Administrators control the plans themselves — names, descriptions, feature
 * lists, limits and which ones are on sale (/admin/plans) — and the prices
 * (/admin/pricing). DEFAULT_PLANS and DEFAULT_PRICE_BOOK only seed an empty
 * database.
 */

export type BillingProduct = "MEMBERSHIP" | "INTELLIAPLAY";
/** A learner's membership level; FREE means "no membership". */
export type MembershipTier = "FREE" | "CORE" | "PLUS" | "ULTRA";
export type PaidTier = Exclude<MembershipTier, "FREE">;
/** The `tier` a plan, price or purchase carries: a membership level, or the add-on. */
export type PlanTier = PaidTier | "INTELLIAPLAY";
export type BillingInterval = "MONTHLY" | "ANNUAL";
/** AUTO_RENEW: Razorpay subscription. PASS: one payment for one period. */
export type BillingMode = "AUTO_RENEW" | "PASS";

export const BILLING_PRODUCTS: readonly BillingProduct[] = ["MEMBERSHIP", "INTELLIAPLAY"];
export const MEMBERSHIP_TIERS: readonly PaidTier[] = ["CORE", "PLUS", "ULTRA"];
export const PLAN_TIERS: readonly PlanTier[] = ["CORE", "PLUS", "ULTRA", "INTELLIAPLAY"];
export const BILLING_INTERVALS: readonly BillingInterval[] = ["MONTHLY", "ANNUAL"];
export const BILLING_MODES: readonly BillingMode[] = ["AUTO_RENEW", "PASS"];

/** Every (product, tier) pair that can have a price. */
export const PRICED_PLANS: readonly { product: BillingProduct; tier: PlanTier }[] = [
  { product: "MEMBERSHIP", tier: "CORE" },
  { product: "MEMBERSHIP", tier: "PLUS" },
  { product: "MEMBERSHIP", tier: "ULTRA" },
  { product: "INTELLIAPLAY", tier: "INTELLIAPLAY" },
];

export function isValidPlan(product: string, tier: string): boolean {
  return PRICED_PLANS.some((p) => p.product === product && p.tier === tier);
}

export function productForTier(tier: PlanTier): BillingProduct {
  return tier === "INTELLIAPLAY" ? "INTELLIAPLAY" : "MEMBERSHIP";
}

const TIER_RANK: Record<MembershipTier, number> = { FREE: 0, CORE: 1, PLUS: 2, ULTRA: 3 };

export function higherTier(a: MembershipTier, b: MembershipTier): MembershipTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// ─── What a membership unlocks ────────────────────────────────────────────────

export interface TierLimits {
  /** AI Tutor questions per UTC day; null means no daily limit. */
  aiTutorPerDay: number | null;
  /** Learning Path recommendations and Smart Practice quizzes. */
  learningPath: boolean;
  /** Gems earned from lessons and the Daily Quiz are multiplied by this. XP never is. */
  gemMultiplier: number;
  /** Gems credited once per calendar month (UTC). */
  monthlyBonusGems: number;
  prioritySupport: boolean;
}

/** Limits while sales are switched off, and for administrators: everything open, nothing boosted. */
export const UNRESTRICTED_LIMITS: TierLimits = {
  aiTutorPerDay: null,
  learningPath: true,
  gemMultiplier: 1,
  monthlyBonusGems: 0,
  prioritySupport: false,
};

/** A learner with no membership while sales are open: nothing (the portal is locked). */
export const NO_ACCESS_LIMITS: TierLimits = {
  aiTutorPerDay: 0,
  learningPath: false,
  gemMultiplier: 1,
  monthlyBonusGems: 0,
  prioritySupport: false,
};

/** One plan as an administrator configures it. */
export interface PlanConfig {
  tier: PlanTier;
  product: BillingProduct;
  name: string;
  tagline: string;
  highlights: string[];
  onSale: boolean;
  /** Shown with a "Most popular" badge. */
  featured: boolean;
  sortOrder: number;
  /** Membership levels only; null for IntelliaPlay. */
  limits: TierLimits | null;
}

export const DEFAULT_PLANS: readonly PlanConfig[] = [
  {
    tier: "CORE",
    product: "MEMBERSHIP",
    name: "Core",
    tagline: "Every lesson and game, with the AI Tutor.",
    highlights: [
      "Every lesson, note, video and lesson test",
      "Daily Quiz, Practice Quizzes, Achievements and Leaderboard",
      "AI Tutor: 30 questions a day",
      "Learning Path recommendations and Smart Practice",
      "2x gems on lessons and the Daily Quiz",
    ],
    onSale: false,
    featured: false,
    sortOrder: 1,
    limits: { aiTutorPerDay: 30, learningPath: true, gemMultiplier: 2, monthlyBonusGems: 0, prioritySupport: false },
  },
  {
    tier: "PLUS",
    product: "MEMBERSHIP",
    name: "Plus",
    tagline: "Everything your child needs to learn math, personalised.",
    highlights: [
      "Every lesson, note, video and lesson test",
      "Daily Quiz, Practice Quizzes, Achievements and Leaderboard",
      "AI Tutor: 75 questions a day",
      "Learning Path recommendations and Smart Practice",
      "3x gems on lessons and the Daily Quiz",
    ],
    onSale: true,
    featured: true,
    sortOrder: 2,
    limits: { aiTutorPerDay: 75, learningPath: true, gemMultiplier: 3, monthlyBonusGems: 0, prioritySupport: false },
  },
  {
    tier: "ULTRA",
    product: "MEMBERSHIP",
    name: "Ultra",
    tagline: "The most tutor time, bonus gems and priority help.",
    highlights: [
      "Everything in Plus",
      "AI Tutor: 200 questions a day",
      "500 bonus gems every month",
      "Priority support",
    ],
    onSale: true,
    featured: false,
    sortOrder: 3,
    limits: { aiTutorPerDay: 200, learningPath: true, gemMultiplier: 3, monthlyBonusGems: 500, prioritySupport: true },
  },
  {
    tier: "INTELLIAPLAY",
    product: "INTELLIAPLAY",
    name: "IntelliaPlay",
    tagline: "The IntelliaPlay section of the student portal, as a separate add-on.",
    highlights: [
      "Unlocks the IntelliaPlay section for each child you choose",
      "Buy it on its own or together with any membership",
      "Monthly or annual, auto-renew or pay once",
    ],
    onSale: true,
    featured: false,
    sortOrder: 4,
    limits: null,
  },
];

export function defaultPlan(tier: PlanTier): PlanConfig {
  return DEFAULT_PLANS.find((p) => p.tier === tier)!;
}

/** The name used in receipts and Checkout: "Intellia360 Plus", "IntelliaPlay". */
export function planDisplayName(tier: PlanTier, plans?: readonly PlanConfig[]): string {
  const name = (plans?.find((p) => p.tier === tier) ?? defaultPlan(tier)).name;
  if (tier === "INTELLIAPLAY" || /intellia/i.test(name)) return name;
  return `Intellia360 ${name}`;
}

/** One row of the comparison table on the pricing page. */
export interface ComparisonRow {
  label: string;
  values: Partial<Record<PlanTier, string | boolean>>;
}

/** The comparison table for the membership plans given, built from their limits. */
export function comparisonRows(plans: readonly PlanConfig[]): ComparisonRow[] {
  const memberships = plans.filter((p) => p.product === "MEMBERSHIP" && p.limits);
  const row = (label: string, value: (l: TierLimits) => string | boolean): ComparisonRow => ({
    label,
    values: Object.fromEntries(memberships.map((p) => [p.tier, value(p.limits!)])),
  });
  return [
    row("Every lesson, note, video and lesson test", () => true),
    row("Daily Quiz, Practice Quizzes, Achievements and Leaderboard", () => true),
    row("Assignments from teachers", () => true),
    row("AI Tutor questions per day", (l) => (l.aiTutorPerDay === null ? "Unlimited" : String(l.aiTutorPerDay))),
    row("Learning Path recommendations and Smart Practice", (l) => l.learningPath),
    row("Gems on lessons and the Daily Quiz", (l) => `${l.gemMultiplier}x`),
    row("Bonus gems every month", (l) => (l.monthlyBonusGems > 0 ? String(l.monthlyBonusGems) : false)),
    row("Priority support", (l) => l.prioritySupport),
    row("IntelliaPlay section", () => "Add-on"),
  ];
}

// ─── Free trial ───────────────────────────────────────────────────────────────

/**
 * Memberships start with a free trial: the buyer authorises a payment method
 * up front (Razorpay charges a small refundable check) and billing starts when
 * the trial ends, unless they cancel. The length is set by an administrator;
 * 0 turns trials off. One trial per learner, ever.
 */
export const DEFAULT_TRIAL_DAYS = 3;
export const MAX_TRIAL_DAYS = 30;
export const TRIAL_PRODUCTS: readonly BillingProduct[] = ["MEMBERSHIP"];

export function trialAvailableFor(product: BillingProduct, mode: BillingMode): boolean {
  return TRIAL_PRODUCTS.includes(product) && mode === "AUTO_RENEW";
}

// ─── Family pricing ───────────────────────────────────────────────────────────

/** Learners one purchase can cover without contacting us. */
export const MAX_SEATS = 4;
export const DEFAULT_FAMILY_DISCOUNT_PERCENT = 25;

/**
 * Price of each additional learner. Currencies priced in whole units (₹4,199)
 * stay whole (₹3,149); others round to the nearest minor unit ($35.99).
 */
export function extraSeatMinor(baseMinor: number, discountPercent: number, exponent: number): number {
  const raw = (baseMinor * (100 - discountPercent)) / 100;
  const unit = 10 ** exponent;
  if (exponent > 0 && baseMinor % unit === 0) return Math.floor(raw / unit) * unit;
  return Math.round(raw);
}

/** Total charged for `seats` learners: the first at full price, the rest discounted. */
export function seatTotalMinor(baseMinor: number, seats: number, discountPercent: number, exponent: number): number {
  if (seats < 1) return 0;
  return baseMinor + (seats - 1) * extraSeatMinor(baseMinor, discountPercent, exponent);
}

/**
 * Indian card and UPI mandates auto-debit without an OTP only up to ₹15,000
 * per charge, so an INR auto-renew charge above this is refused at checkout;
 * the buyer can pay once instead.
 */
export const INR_AUTODEBIT_LIMIT_MINOR = 1_500_000;

// ─── Starting price book ──────────────────────────────────────────────────────

/** Major-unit prices per currency: [monthly, annual]. Seeds an empty price book only. */
export const DEFAULT_PRICE_BOOK: Record<string, Record<PlanTier, [string, string]>> = {
  INR: { CORE: ["299", "1799"], PLUS: ["499", "2999"], ULTRA: ["699", "4199"], INTELLIAPLAY: ["199", "1199"] },
  USD: { CORE: ["7.99", "47.99"], PLUS: ["11.99", "71.99"], ULTRA: ["15.99", "95.99"], INTELLIAPLAY: ["4.99", "29.99"] },
  EUR: { CORE: ["7.49", "44.99"], PLUS: ["10.99", "65.99"], ULTRA: ["14.99", "89.99"], INTELLIAPLAY: ["4.49", "26.99"] },
  GBP: { CORE: ["6.49", "38.99"], PLUS: ["9.49", "56.99"], ULTRA: ["12.99", "77.99"], INTELLIAPLAY: ["3.99", "23.99"] },
  AED: { CORE: ["29", "175"], PLUS: ["44", "265"], ULTRA: ["59", "355"], INTELLIAPLAY: ["19", "115"] },
  SGD: { CORE: ["10.99", "65.99"], PLUS: ["15.99", "95.99"], ULTRA: ["20.99", "125.99"], INTELLIAPLAY: ["6.99", "41.99"] },
  AUD: { CORE: ["11.99", "71.99"], PLUS: ["17.99", "107.99"], ULTRA: ["23.99", "143.99"], INTELLIAPLAY: ["7.49", "44.99"] },
  CAD: { CORE: ["10.99", "65.99"], PLUS: ["15.99", "95.99"], ULTRA: ["21.99", "131.99"], INTELLIAPLAY: ["6.99", "41.99"] },
};

export function intervalLabel(interval: BillingInterval): string {
  return interval === "MONTHLY" ? "month" : "year";
}
