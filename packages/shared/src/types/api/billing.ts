/**
 * Shapes of the billing API (apps/backend/src/app/api/billing, /api/admin/billing,
 * /api/student/membership), shared with the frontend.
 */
import type {
  BillingInterval,
  BillingMode,
  BillingProduct,
  MembershipTier,
  PlanTier,
  TierLimits,
} from "../../billing/plans";

export type SubscriptionStatus =
  | "CREATED"
  | "AUTHENTICATED"
  | "ACTIVE"
  | "PENDING"
  | "HALTED"
  | "PAUSED"
  | "CANCELLED"
  | "COMPLETED"
  | "EXPIRED"
  | "REFUNDED";

/** One price in the catalog: the price of ONE learner for one period. */
export interface CatalogPrice {
  priceId: string;
  product: BillingProduct;
  tier: PlanTier;
  interval: BillingInterval;
  currency: string;
  amountMinor: number;
}

/** GET /api/billing/catalog */
export interface BillingCatalog {
  billingEnabled: boolean;
  country: string;
  /** Currency the prices below are in; null when the country cannot be served. */
  currency: string | null;
  allowedCurrencies: string[];
  /** Every currency the price book has prices in. */
  pricedCurrencies: string[];
  familyDiscountPercent: number;
  maxSeats: number;
  /** Free-trial days for memberships (0: no trial). */
  trialDays: number;
  /** Buyers in this country must pay by card (everywhere except India). */
  cardRequired: boolean;
  prices: CatalogPrice[];
}

/** What one learner can use right now. GET /api/student/membership */
export interface MembershipAccess {
  billingEnabled: boolean;
  tier: MembershipTier;
  intelliaPlay: boolean;
  limits: TierLimits;
  membershipEndsAt: string | null;
  intelliaPlayEndsAt: string | null;
  aiTutorUsedToday: number;
}

export interface BillingLearner {
  id: string;
  name: string;
  /** The signed-in account itself. */
  self: boolean;
  membershipTier: MembershipTier;
  intelliaPlay: boolean;
  /** Has never had a membership trial or paid membership, so can start a trial. */
  trialEligible: boolean;
}

export interface BillingSubscriptionView {
  id: string;
  product: BillingProduct;
  tier: PlanTier;
  interval: BillingInterval;
  mode: BillingMode;
  currency: string;
  seats: number;
  amountMinor: number;
  status: SubscriptionStatus;
  learners: { id: string; name: string }[];
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  /** When billing starts after a free trial (null: no trial). */
  trialEndsAt: string | null;
  /** In a free trial right now (not yet charged). */
  inTrial: boolean;
  pendingChange: { tier: PlanTier; seats: number; amountMinor: number; learnerIds: string[] } | null;
  /** True while this purchase gives its learners access. */
  grantsAccess: boolean;
  canCancel: boolean;
  canChange: boolean;
  createdAt: string;
}

export interface BillingPaymentView {
  id: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  status: string;
  description: string;
  date: string;
}

/** GET /api/billing/me */
export interface BillingOverview {
  billingEnabled: boolean;
  /** False until Razorpay keys are configured on the API. */
  gatewayConfigured: boolean;
  profile: { country: string; currency: string } | null;
  learners: BillingLearner[];
  subscriptions: BillingSubscriptionView[];
  payments: BillingPaymentView[];
}

/** POST /api/billing/checkout */
export interface CheckoutRequest {
  product: BillingProduct;
  tier: PlanTier;
  interval: BillingInterval;
  mode: BillingMode;
  learnerIds: string[];
  country: string;
  currency: string;
  /** Start with the free trial (memberships, auto-renew, eligible learners only). */
  trial?: boolean;
}

export interface CheckoutSession {
  recordId: string;
  kind: "subscription" | "order";
  keyId: string;
  subscriptionId?: string;
  orderId?: string;
  amountMinor: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  /** Set when this checkout starts a free trial: the first charge is on this date. */
  trialEndsAt: string | null;
  /** Show only card payment in Checkout (buyers outside India). */
  cardOnly: boolean;
}

/** POST /api/billing/verify — the fields Razorpay Checkout hands its success handler. */
export interface VerifyCheckoutRequest {
  recordId: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
}

/** POST /api/billing/family/code */
export interface FamilyLinkCode {
  code: string;
  expiresAt: string;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AdminPriceRow {
  id: string;
  product: BillingProduct;
  tier: PlanTier;
  interval: BillingInterval;
  currency: string;
  amountMinor: number;
  version: number;
  createdAt: string;
  createdBy: string | null;
}

/** GET /api/admin/billing/prices */
export interface AdminPriceBook {
  prices: AdminPriceRow[];
  familyDiscountPercent: number;
  trialDays: number;
  gatewayConfigured: boolean;
  billingEnabled: boolean;
}

export interface AdminSubscriptionRow extends BillingSubscriptionView {
  payer: { id: string; name: string; email: string };
  gatewayId: string;
}

export interface AdminGrantRow {
  id: string;
  user: { id: string; name: string; email: string };
  product: BillingProduct;
  tier: PlanTier;
  validUntil: string;
  reason: string | null;
  grantedBy: string;
  revokedAt: string | null;
  createdAt: string;
}
