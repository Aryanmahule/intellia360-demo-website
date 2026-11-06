/**
 * Refunds. The ledger stays append-only (as /api/admin/payments always has):
 * a refund is its own REFUNDED row pointing at the payment it refunds, and the
 * original payment row is never edited. A full refund ends the access that
 * payment bought, immediately.
 */
import { BillingError, isUniqueViolation, type BillingDeps } from "./deps";
import { applySubscriptionEntity, FINAL_STATUSES } from "./subscriptions";
import type { SubscriptionRow } from "./access";
import { RazorpayError, type RazorpayRefund } from "./razorpay";

interface PaymentRow {
  id: string;
  transactionId: string;
  payerName: string;
  schoolOrUser: string | null;
  amount: number;
  status: string;
  currency: string | null;
  amountMinor: number | null;
  kind: string | null;
  userId: string | null;
  subscriptionId: string | null;
}

/** Write the REFUNDED row for `refund` once. Returns false if it was already there. */
export async function recordRefund(deps: BillingDeps, payment: PaymentRow, refund: RazorpayRefund): Promise<boolean> {
  const share = payment.amountMinor ? refund.amount / payment.amountMinor : 1;
  try {
    await deps.db.payment.create({
      data: {
        transactionId: refund.id,
        payerName: payment.payerName,
        schoolOrUser: payment.schoolOrUser,
        amount: Math.round(payment.amount * share),
        method: "Razorpay refund",
        status: "REFUNDED",
        date: deps.now(),
        currency: refund.currency,
        amountMinor: refund.amount,
        kind: "REFUND",
        userId: payment.userId,
        subscriptionId: payment.subscriptionId,
        refundOf: payment.id,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** End the access a refunded payment paid for: now, not at the period end. */
export async function endAccessForRefund(deps: BillingDeps, subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return;
  const record = (await deps.db.membershipSubscription.findUnique({ where: { id: subscriptionId } })) as SubscriptionRow | null;
  if (!record) return;
  const now = deps.now();

  if (record.mode === "AUTO_RENEW" && !FINAL_STATUSES.has(record.status)) {
    try {
      const entity = await deps.razorpay.cancelSubscription(record.gatewayId, false);
      await applySubscriptionEntity(deps, record, entity);
    } catch (err) {
      // Already cancelled on Razorpay's side is fine; anything else is logged
      // and the local record is still closed below so access ends.
      console.error("[billing/refund] cancel after refund failed:", (err as Error).message);
    }
  }
  await deps.db.membershipSubscription.update({
    where: { id: record.id },
    data: {
      status: record.mode === "PASS" ? "REFUNDED" : "CANCELLED",
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
      pendingChange: null,
      lastSyncedAt: now,
    },
  });
}

/** Administrator refund of one gateway payment, in full. */
export async function refundLedgerPayment(
  deps: BillingDeps,
  admin: { email: string },
  paymentId: string
): Promise<{ refundId: string }> {
  const payment = (await deps.db.payment.findUnique({ where: { id: paymentId } })) as PaymentRow | null;
  if (!payment) throw new BillingError("Payment not found.", 404);
  if (!payment.transactionId.startsWith("pay_") || payment.status !== "COMPLETED") {
    throw new BillingError("Only a completed Razorpay payment can be refunded here. Manual invoices are corrected with a REFUNDED invoice.");
  }
  if (await deps.db.payment.findFirst({ where: { refundOf: payment.id } })) {
    throw new BillingError("This payment has already been refunded.", 409);
  }

  let refund: RazorpayRefund;
  try {
    refund = await deps.razorpay.refundPayment(payment.transactionId, { notes: { refundedBy: admin.email } });
  } catch (err) {
    if (err instanceof RazorpayError) throw new BillingError(`Razorpay refused the refund: ${err.message}`, 502);
    throw err;
  }
  await recordRefund(deps, payment, refund);
  await endAccessForRefund(deps, payment.subscriptionId);
  return { refundId: refund.id };
}

/** A refund Razorpay reports by webhook (also ones issued from the Razorpay Dashboard). */
export async function applyRefundEvent(deps: BillingDeps, refund: RazorpayRefund): Promise<"PROCESSED" | "IGNORED"> {
  const payment = (await deps.db.payment.findUnique({ where: { transactionId: refund.payment_id } })) as PaymentRow | null;
  if (!payment) return "IGNORED";
  const created = await recordRefund(deps, payment, refund);
  if (created && payment.amountMinor !== null && refund.amount >= payment.amountMinor) {
    await endAccessForRefund(deps, payment.subscriptionId);
  }
  return "PROCESSED";
}
