/**
 * Razorpay signature checks. Every one is an HMAC-SHA256 hex digest compared
 * in constant time.
 *
 *   • Checkout, subscription: payment_id + "|" + subscription_id, key secret.
 *   • Checkout, order:        order_id + "|" + payment_id, key secret.
 *   • Webhook:                the raw request body, webhook secret.
 *
 * The ids signed over are always the ones this API stored when it created the
 * subscription or order, never the ids the browser sends back.
 */
import crypto from "crypto";

export function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(expected: string, received: string): boolean {
  if (typeof received !== "string" || !/^[0-9a-f]+$/i.test(received)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received.toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifySubscriptionSignature(args: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
  keySecret: string;
}): boolean {
  return safeEqualHex(hmacHex(args.keySecret, `${args.paymentId}|${args.subscriptionId}`), args.signature);
}

export function verifyOrderSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  return safeEqualHex(hmacHex(args.keySecret, `${args.orderId}|${args.paymentId}`), args.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}
