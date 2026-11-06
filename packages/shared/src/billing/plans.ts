/**
 * What Intellia360 sells, what each level unlocks, and how a family price is
 * worked out. Single source of truth for the pricing page, the student
 * portal's locks and the API's checks, the same way auth/roles.ts is for roles.
 *
 * Two products:
 *   • MEMBERSHIP — Free, Core, Plus, Ultra. Free needs no purchase.
 *   • INTELLIAPLAY — the IntelliaPlay section of the student portal, sold on
 *     its own: it can be bought with or without a membership.
 *
 * Prices are NOT here: they live in the database price book and an
 * administrator edits them (/admin/pricing). DEFAULT_PRICE_BOOK only seeds an
 * empty price book.
 */

export type BillingProduct = "MEMBERSHIP" | "INTELLIAPLAY";
export type MembershipTier = "FREE" | "CORE" | "PLUS" | "ULTRA";
export type PaidTier = Exclude<MembershipTier, "FREE">;
/** The `tier` a price or purchase carries: a membership level, or the add-on. */
export type PlanTier = PaidTier | "INTELLIAPLAY";
export type BillingInterval = "MONTHLY" | "ANNUAL";
/** AUTO_RENEW: Razorpay subscription. PASS: one payment for one period. */
export type BillingMode = "AUTO_RENEW" | "PASS";

export const BILLING_PRODUCTS: readonly BillingProduct[] = ["MEMBERSHIP", "INTELLIAPLAY"];
export const PAID_TIERS: readonly PaidTier[] = ["CORE", "PLUS", "ULTRA"];
export const BILLING_INTERVALS: readonly BillingInterval[] = ["MONTHLY", "ANNUAL"];
export const BILLING_MODES: readonly BillingMode[] = ["AUTO_RENEW", "PASS"];

/** Every (product, tier) pair that has a price. */
export const PRICED_PLANS: readonly { product: BillingProduct; tier: PlanTier }[] = [
  { product: "MEMBERSHIP", tier: "CORE" },
  { product: "MEMBERSHIP", tier: "PLUS" },
  { product: "MEMBERSHIP", tier: "ULTRA" },
  { product: "INTELLIAPLAY", tier: "INTELLIAPLAY" },
];

export function isValidPlan(product: string, tier: string): boolean {
  return PRICED_PLANS.some((p) => p.product === product && p.tier === tier);
}

const TIER_RANK: Record<MembershipTier, number> = { FREE: 0, CORE: 1, PLUS: 2, ULTRA: 3 };

export function higherTier(a: MembershipTier, b: MembershipTier): MembershipTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// ─── What each level unlocks ──────────────────────────────────────────────────

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

export const TIER_LIMITS: Record<MembershipTier, TierLimits> = {
  FREE:  { aiTutorPerDay: 5,   learningPath: false, gemMultiplier: 1, monthlyBonusGems: 0,   prioritySupport: false },
  CORE:  { aiTutorPerDay: 30,  learningPath: true,  gemMultiplier: 2, monthlyBonusGems: 0,   prioritySupport: false },
  PLUS:  { aiTutorPerDay: 75,  learningPath: true,  gemMultiplier: 3, monthlyBonusGems: 0,   prioritySupport: false },
  ULTRA: { aiTutorPerDay: 200, learningPath: true,  gemMultiplier: 3, monthlyBonusGems: 500, prioritySupport: true },
};

/** Limits while billing is switched off: everything open, nothing boosted. */
export const UNRESTRICTED_LIMITS: TierLimits = {
  aiTutorPerDay: null,
  learningPath: true,
  gemMultiplier: 1,
  monthlyBonusGems: 0,
  prioritySupport: false,
};

export interface TierInfo {
  tier: MembershipTier;
  name: string;
  tagline: string;
  highlights: string[];
}

export const TIER_INFO: Record<MembershipTier, TierInfo> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    tagline: "Every lesson and game, free for every learner.",
    highlights: [
      "All math lessons, notes, videos and lesson tests",
      "Daily Quiz, Practice Quizzes, Achievements and Leaderboard",
      "AI Tutor: 5 questions a day",
      "Learning Path progress and topic mastery",
    ],
  },
  CORE: {
    tier: "CORE",
    name: "Core",
    tagline: "Personalised practice that adapts to your child.",
    highlights: [
      "Everything in Free",
      "AI Tutor: 30 questions a day",
      "Learning Path recommendations and Smart Practice",
      "2x gems on lessons and the Daily Quiz",
    ],
  },
  PLUS: {
    tier: "PLUS",
    name: "Plus",
    tagline: "More tutor time and bigger rewards.",
    highlights: [
      "Everything in Core",
      "AI Tutor: 75 questions a day",
      "3x gems on lessons and the Daily Quiz",
    ],
  },
  ULTRA: {
    tier: "ULTRA",
    name: "Ultra",
    tagline: "The most tutor time, bonus gems and priority help.",
    highlights: [
      "Everything in Plus",
      "AI Tutor: 200 questions a day",
      "500 bonus gems every month",
      "Priority support",
    ],
  },
};

export const INTELLIAPLAY_INFO = {
  name: "IntelliaPlay",
  tagline: "The IntelliaPlay section of the student portal, as a separate add-on.",
  highlights: [
    "Unlocks the IntelliaPlay section for each child you choose",
    "Buy it on its own or together with any membership",
    "Monthly or annual, auto-renew or pay once",
  ],
};

/** One row of the comparison table on the pricing page. */
export interface ComparisonRow {
  label: string;
  values: Record<MembershipTier, string | boolean>;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Lessons, notes, videos and lesson tests", values: { FREE: true, CORE: true, PLUS: true, ULTRA: true } },
  { label: "Daily Quiz, Practice Quizzes, Achievements and Leaderboard", values: { FREE: true, CORE: true, PLUS: true, ULTRA: true } },
  { label: "Assignments from teachers", values: { FREE: true, CORE: true, PLUS: true, ULTRA: true } },
  { label: "AI Tutor questions per day", values: { FREE: "5", CORE: "30", PLUS: "75", ULTRA: "200" } },
  { label: "Learning Path progress and topic mastery", values: { FREE: true, CORE: true, PLUS: true, ULTRA: true } },
  { label: "Learning Path recommendations and Smart Practice", values: { FREE: false, CORE: true, PLUS: true, ULTRA: true } },
  { label: "Gems on lessons and the Daily Quiz", values: { FREE: "1x", CORE: "2x", PLUS: "3x", ULTRA: "3x" } },
  { label: "Bonus gems every month", values: { FREE: false, CORE: false, PLUS: false, ULTRA: "500" } },
  { label: "Priority support", values: { FREE: false, CORE: false, PLUS: false, ULTRA: true } },
  { label: "IntelliaPlay section", values: { FREE: "Add-on", CORE: "Add-on", PLUS: "Add-on", ULTRA: "Add-on" } },
];

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

export function productForTier(tier: PlanTier): BillingProduct {
  return tier === "INTELLIAPLAY" ? "INTELLIAPLAY" : "MEMBERSHIP";
}

export function planDisplayName(tier: PlanTier): string {
  return tier === "INTELLIAPLAY" ? INTELLIAPLAY_INFO.name : `Intellia360 ${TIER_INFO[tier].name}`;
}

export function intervalLabel(interval: BillingInterval): string {
  return interval === "MONTHLY" ? "month" : "year";
}
