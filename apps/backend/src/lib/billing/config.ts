/**
 * Server-level billing settings and Razorpay credentials, read from the
 * environment.
 *
 * Whether memberships are on sale is the administrators' switch on
 * /admin/pricing (see salesOpen in state.ts). The server can only force sales
 * off — BILLING_ENABLED=false is the emergency stop — or set what the switch
 * defaults to before anyone has used it (BILLING_ENABLED=true: open).
 *
 * While sales are closed every learner keeps the access they have today (no
 * locks, no limits), the pricing page shows prices but no checkout, and
 * nothing calls Razorpay.
 */

/** BILLING_ENABLED=false: sales stay closed whatever the admin switch says. */
export function serverLocksSales(): boolean {
  return process.env.BILLING_ENABLED === "false";
}

/** What the admin switch means before it has ever been set. */
export function serverSalesDefault(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

/** Razorpay API keys, or null when they are not configured. */
export function razorpayKeys(): RazorpayKeys | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export function webhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

/**
 * The secret before the last rotation, accepted alongside the current one so
 * Razorpay's retries of deliveries signed before the change still verify.
 * Remove it a day or two after rotating.
 */
export function previousWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS?.trim() || null;
}

/** Days a learner keeps access after a renewal charge fails, while Razorpay retries. */
export function graceDays(): number {
  const n = Number(process.env.BILLING_GRACE_DAYS ?? 7);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : 7;
}

export const DAY_MS = 86_400_000;

/**
 * An active subscription keeps granting access this long past the end of its
 * period: Razorpay charges at the period boundary and the webhook that moves
 * the period on can take a while to arrive.
 */
export const RENEWAL_BUFFER_MS = 2 * DAY_MS;

/**
 * A trial keeps granting access this long past its end while Razorpay takes
 * the first charge. If that charge fails the subscription goes PENDING and,
 * never having been paid, gets no grace period.
 */
export const TRIAL_BUFFER_MS = 12 * 60 * 60 * 1000;

/**
 * Billing cycles a subscription is created for. Razorpay requires a count;
 * "until cancelled" is modelled as a long horizon.
 */
export const SUBSCRIPTION_TOTAL_COUNT = { MONTHLY: 120, ANNUAL: 10 } as const;

/** Sync a payer's own open purchases with Razorpay when their record is older than this. */
export const SELF_SYNC_AFTER_MS = 60 * 60 * 1000;
