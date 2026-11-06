/**
 * Minimal Razorpay REST client (https://api.razorpay.com/v1, Basic auth with
 * the key id and secret). Only this file and signatures.ts ever see the key
 * secret. Amounts are integers in the currency's minor units.
 *
 * Billing code takes a `RazorpayClient` instead of importing this module
 * directly, so tests can hand it a fake.
 */
import { razorpayKeys } from "./config";

const BASE_URL = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super("Razorpay keys are not configured");
    this.name = "RazorpayNotConfiguredError";
  }
}

type Notes = Record<string, string>;

export interface RazorpayPlan {
  id: string;
  period: string;
  interval: number;
  item: { amount: number; currency: string; name: string };
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  charge_at: number | null;
  paid_count: number;
  total_count: number;
  has_scheduled_changes?: boolean;
  notes?: Notes | unknown[];
  short_url?: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string | null;
  status: string; // created | attempted | paid
  notes?: Notes | unknown[];
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string; // created | authorized | captured | refunded | failed
  order_id: string | null;
  invoice_id: string | null;
  subscription_id?: string | null;
  international?: boolean;
  method?: string;
  email?: string;
  contact?: string;
  amount_refunded?: number;
  /** Present on international payments: the INR equivalent. */
  base_amount?: number;
  base_currency?: string;
  created_at: number;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
}

export interface RazorpayClient {
  createPlan(input: {
    period: "monthly" | "yearly";
    interval: number;
    item: { name: string; amount: number; currency: string; description?: string };
    notes?: Notes;
  }): Promise<RazorpayPlan>;
  createSubscription(input: {
    plan_id: string;
    total_count: number;
    /** Unix seconds. In the future: a free trial until then (Razorpay charges a refundable check now). */
    start_at?: number;
    quantity?: number;
    customer_notify?: 0 | 1;
    notes?: Notes;
  }): Promise<RazorpaySubscription>;
  fetchSubscription(id: string): Promise<RazorpaySubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription>;
  updateSubscription(
    id: string,
    input: { plan_id: string; schedule_change_at: "now" | "cycle_end"; customer_notify?: 0 | 1 }
  ): Promise<RazorpaySubscription>;
  createOrder(input: { amount: number; currency: string; receipt: string; notes?: Notes }): Promise<RazorpayOrder>;
  fetchOrder(id: string): Promise<RazorpayOrder>;
  fetchOrderPayments(id: string): Promise<RazorpayPayment[]>;
  fetchPayment(id: string): Promise<RazorpayPayment>;
  refundPayment(id: string, input: { amount?: number; notes?: Notes }): Promise<RazorpayRefund>;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const keys = razorpayKeys();
  if (!keys) throw new RazorpayNotConfiguredError();

  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new RazorpayError(`Razorpay could not be reached: ${(err as Error).message}`, 503);
  }

  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { code?: string; description?: string } })
    | null;
  if (!res.ok || !json) {
    const description = json?.error?.description ?? res.statusText ?? "Razorpay request failed";
    throw new RazorpayError(description, res.status, json?.error?.code ?? null);
  }
  return json;
}

const enc = encodeURIComponent;

export const razorpay: RazorpayClient = {
  createPlan: (input) => call("POST", "/plans", input),
  createSubscription: (input) => call("POST", "/subscriptions", input),
  fetchSubscription: (id) => call("GET", `/subscriptions/${enc(id)}`),
  cancelSubscription: (id, atCycleEnd) =>
    call("POST", `/subscriptions/${enc(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  updateSubscription: (id, input) => call("PATCH", `/subscriptions/${enc(id)}`, input),
  createOrder: (input) => call("POST", "/orders", input),
  fetchOrder: (id) => call("GET", `/orders/${enc(id)}`),
  fetchOrderPayments: async (id) =>
    (await call<{ items: RazorpayPayment[] }>("GET", `/orders/${enc(id)}/payments`)).items ?? [],
  fetchPayment: (id) => call("GET", `/payments/${enc(id)}`),
  refundPayment: (id, input) => call("POST", `/payments/${enc(id)}/refund`, input),
};
