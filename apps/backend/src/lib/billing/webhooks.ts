/**
 * Razorpay webhooks: POST /api/webhooks/razorpay.
 *
 *   1. Verify X-Razorpay-Signature over the raw body with the webhook secret.
 *   2. Claim x-razorpay-event-id in WebhookEvent. A delivery already PROCESSED
 *      or IGNORED is acknowledged and not applied again (Razorpay delivers at
 *      least once); a FAILED one is retried.
 *   3. Re-read the subscription from Razorpay before applying it, so events
 *      arriving out of order cannot move a purchase backwards.
 *
 * Razorpay waits 5 seconds for a 2xx and retries anything else for 24 hours.
 * A failure returns 500 so it is retried; a bad signature returns 400.
 */
import crypto from "crypto";
import { previousWebhookSecret, webhookSecret } from "./config";
import { isUniqueViolation, type BillingDeps } from "./deps";
import { verifyWebhookSignature } from "./signatures";
import { activatePass, applySubscriptionEntity, recordPayment } from "./subscriptions";
import { applyRefundEvent } from "./refunds";
import { notifyPaymentFailed } from "./notify";
import type { SubscriptionRow } from "./access";
import type { RazorpayOrder, RazorpayPayment, RazorpayRefund, RazorpaySubscription } from "./razorpay";

export interface WebhookEnvelope {
  event: string;
  payload?: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: RazorpayPayment };
    order?: { entity: RazorpayOrder };
    refund?: { entity: RazorpayRefund };
  };
}

type Outcome = "PROCESSED" | "IGNORED";

async function bySubscription(deps: BillingDeps, envelope: WebhookEnvelope): Promise<Outcome> {
  const entity = envelope.payload?.subscription?.entity;
  if (!entity?.id) return "IGNORED";
  const record = (await deps.db.membershipSubscription.findUnique({ where: { gatewayId: entity.id } })) as SubscriptionRow | null;
  if (!record) return "IGNORED"; // not created by this platform

  const fresh = await deps.razorpay.fetchSubscription(entity.id).catch(() => entity);
  const wasPending = record.status === "PENDING";
  const updated = await applySubscriptionEntity(deps, record, fresh);

  const payment = envelope.payload?.payment?.entity;
  if (envelope.event === "subscription.charged" && payment?.status === "captured") {
    await recordPayment(deps, updated, payment, "SUBSCRIPTION_CHARGE");
  }
  // Razorpay fires `pending` on every failed retry; tell the payer once.
  if (envelope.event === "subscription.pending" && !wasPending && updated.status === "PENDING") {
    await notifyPaymentFailed(deps, updated);
  }
  return "PROCESSED";
}

async function byOrder(deps: BillingDeps, envelope: WebhookEnvelope): Promise<Outcome> {
  const payment = envelope.payload?.payment?.entity;
  const orderId = envelope.payload?.order?.entity?.id ?? payment?.order_id;
  if (!orderId || payment?.status !== "captured") return "IGNORED";
  const record = (await deps.db.membershipSubscription.findUnique({ where: { gatewayId: orderId } })) as SubscriptionRow | null;
  if (!record || record.mode !== "PASS") return "IGNORED";
  const activated = await activatePass(deps, record);
  await recordPayment(deps, activated, payment, "PASS");
  return "PROCESSED";
}

export async function dispatchWebhook(deps: BillingDeps, envelope: WebhookEnvelope): Promise<Outcome> {
  const { event } = envelope;
  if (event.startsWith("subscription.")) return bySubscription(deps, envelope);
  if (event === "order.paid" || event === "payment.captured") return byOrder(deps, envelope);
  if (event === "refund.processed") {
    const refund = envelope.payload?.refund?.entity;
    return refund ? applyRefundEvent(deps, refund) : "IGNORED";
  }
  return "IGNORED";
}

function entityId(envelope: WebhookEnvelope): string | null {
  const p = envelope.payload;
  return p?.subscription?.entity?.id ?? p?.order?.entity?.id ?? p?.refund?.entity?.id ?? p?.payment?.entity?.id ?? null;
}

export async function handleWebhook(
  deps: BillingDeps,
  input: { rawBody: string; signature: string | null; eventId: string | null }
): Promise<{ status: number; message: string }> {
  const secret = webhookSecret();
  if (!secret) return { status: 503, message: "Webhook secret not configured" };
  const previous = previousWebhookSecret();
  const authentic =
    verifyWebhookSignature(input.rawBody, input.signature, secret) ||
    (previous !== null && verifyWebhookSignature(input.rawBody, input.signature, previous));
  if (!authentic) return { status: 400, message: "Invalid signature" };

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(input.rawBody) as WebhookEnvelope;
  } catch {
    return { status: 400, message: "Invalid JSON" };
  }
  if (typeof envelope?.event !== "string") return { status: 400, message: "Missing event" };

  const eventId = input.eventId?.trim() || crypto.createHash("sha256").update(input.rawBody).digest("hex");
  const { db } = deps;

  let row: { id: string; status: string };
  try {
    row = await db.webhookEvent.create({ data: { eventId, event: envelope.event, entityId: entityId(envelope) } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await db.webhookEvent.findUnique({ where: { eventId } });
    if (!existing) throw err;
    if (existing.status === "PROCESSED" || existing.status === "IGNORED") return { status: 200, message: "Duplicate" };
    row = existing; // an earlier delivery failed: try again
  }

  try {
    const outcome = await dispatchWebhook(deps, envelope);
    await db.webhookEvent.update({ where: { id: row.id }, data: { status: outcome, processedAt: deps.now(), error: null } });
    return { status: 200, message: outcome };
  } catch (err) {
    const message = (err as Error).message?.slice(0, 500) ?? "error";
    console.error("[billing/webhook]", envelope.event, eventId, message);
    await db.webhookEvent.update({ where: { id: row.id }, data: { status: "FAILED", error: message } }).catch(() => undefined);
    return { status: 500, message: "Processing failed" };
  }
}
