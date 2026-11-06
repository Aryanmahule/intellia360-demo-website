/**
 * Frontend side of billing: API calls, the buyer's remembered country and
 * currency, and Razorpay Checkout.
 *
 * The browser never decides an amount. It asks the API for a checkout
 * (POST /api/billing/checkout), opens Razorpay Checkout with the subscription
 * or order id it gets back, and hands Razorpay's result to /api/billing/verify.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { guessCountryFromLocales, getCountry } from "@intellia360/shared/billing/countries";
import { seatTotalMinor, type BillingInterval, type PlanTier } from "@intellia360/shared/billing/plans";
import { currencyExponent } from "@intellia360/shared/billing/currencies";
import type {
  BillingCatalog,
  BillingOverview,
  BillingSubscriptionView,
  CheckoutRequest,
  CheckoutSession,
  FamilyLinkCode,
  MembershipAccess,
  VerifyCheckoutRequest,
} from "@intellia360/shared/types/api/billing";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  message: string;
  data?: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(path, { cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok && json?.success === true,
      status: res.status,
      message: json?.message ?? (res.ok ? "OK" : `Request failed (${res.status})`),
      data: json?.data as T | undefined,
    };
  } catch {
    return { ok: false, status: 0, message: "Could not reach Intellia360. Check your connection and try again." };
  }
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const fetchCatalog = (country: string, currency?: string | null) =>
  call<BillingCatalog>(
    `/api/billing/catalog?country=${encodeURIComponent(country)}${currency ? `&currency=${encodeURIComponent(currency)}` : ""}`,
    { cache: "default" }
  );
export const fetchBillingOverview = () => call<BillingOverview>("/api/billing/me");
export const fetchMembershipAccess = () => call<MembershipAccess>("/api/student/membership");
export const createCheckout = (req: CheckoutRequest) => call<CheckoutSession>("/api/billing/checkout", post(req));
export const verifyCheckout = (body: VerifyCheckoutRequest) =>
  call<BillingSubscriptionView>("/api/billing/verify", post(body));
export const cancelSubscription = (id: string) =>
  call<BillingSubscriptionView>(`/api/billing/subscriptions/${encodeURIComponent(id)}/cancel`, post());
export const changeSubscription = (id: string, body: { tier: PlanTier; learnerIds: string[] }) =>
  call<BillingSubscriptionView>(`/api/billing/subscriptions/${encodeURIComponent(id)}/change`, post(body));
export const createFamilyCode = () => call<FamilyLinkCode>("/api/billing/family/code", post());
export const linkFamilyMember = (code: string) => call<{ learnerId: string }>("/api/billing/family/link", post({ code }));
export const unlinkFamilyMember = (learnerId: string) =>
  call<null>(`/api/billing/family/${encodeURIComponent(learnerId)}`, { method: "DELETE" });

// ─── Country and currency the buyer chose ─────────────────────────────────────

const REGION_KEY = "intellia360-billing-region";

export interface Region {
  country: string;
  currency: string | null;
}

export function loadRegion(): Region | null {
  try {
    const raw = localStorage.getItem(REGION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Region) : null;
    return parsed && getCountry(parsed.country) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRegion(region: Region): void {
  try {
    localStorage.setItem(REGION_KEY, JSON.stringify(region));
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

/** Time zones that name a country more reliably than the browser language does. */
const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Europe/London": "GB",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
};

/** A starting guess for the country picker. The buyer can always change it. */
export function guessCountry(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
    if (zone.startsWith("Australia/")) return "AU";
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    return guessCountryFromLocales(languages) ?? "US";
  } catch {
    return "US";
  }
}

export function viewerLocale(): string | undefined {
  try {
    return navigator.language || undefined;
  } catch {
    return undefined;
  }
}

/** Price of one plan for `seats` learners, from a catalog. */
export function planTotal(
  catalog: BillingCatalog,
  tier: PlanTier,
  interval: BillingInterval,
  seats: number
): number | null {
  const price = catalog.prices.find((p) => p.tier === tier && p.interval === interval);
  if (!price || !catalog.currency) return null;
  return seatTotalMinor(price.amountMinor, seats, catalog.familyDiscountPercent, currencyExponent(catalog.currency));
}

// ─── Razorpay Checkout ────────────────────────────────────────────────────────

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (response: { error?: { description?: string } }) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

let loading: Promise<RazorpayConstructor> | null = null;

function loadCheckoutScript(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay Checkout did not load."));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Razorpay Checkout could not be loaded. Check your connection or ad blocker."));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export class CheckoutDismissed extends Error {
  constructor() {
    super("Payment window closed");
    this.name = "CheckoutDismissed";
  }
}

/**
 * Open Razorpay Checkout for a session from POST /api/billing/checkout.
 * Resolves with Razorpay's success payload; rejects with CheckoutDismissed when
 * the buyer closes the window, or an Error when the payment fails.
 */
export async function openRazorpayCheckout(session: CheckoutSession): Promise<RazorpaySuccess> {
  const Razorpay = await loadCheckoutScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new Razorpay({
      key: session.keyId,
      name: session.name,
      description: session.description,
      image: "/assets/logo/intellia360-log.png",
      ...(session.kind === "subscription"
        ? { subscription_id: session.subscriptionId }
        : { order_id: session.orderId, amount: session.amountMinor, currency: session.currency }),
      prefill: session.prefill,
      theme: { color: "#4f46e5" },
      // Outside India a card is mandatory: show the card block only.
      ...(session.cardOnly
        ? {
            config: {
              display: {
                blocks: { cards: { name: "Pay by card", instruments: [{ method: "card" }] } },
                sequence: ["block.cards"],
                preferences: { show_default_blocks: false },
              },
            },
          }
        : {}),
      handler: (response: RazorpaySuccess) => {
        settled = true;
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new CheckoutDismissed());
        },
      },
    });
    rzp.on("payment.failed", (response) => {
      settled = true;
      reject(new Error(response.error?.description ?? "The payment failed. No money was taken."));
    });
    rzp.open();
  });
}

// ─── What the signed-in learner can use ──────────────────────────────────────

let accessCache: Promise<MembershipAccess | null> | null = null;

function loadAccess(force = false): Promise<MembershipAccess | null> {
  if (force || !accessCache) {
    accessCache = fetchMembershipAccess().then((r) => (r.ok ? r.data ?? null : null));
  }
  return accessCache;
}

/**
 * The learner's membership level, IntelliaPlay access and limits. One request
 * per page load is shared by every component that asks; `refresh()` re-reads
 * it after a purchase.
 */
export function useMembership() {
  const [access, setAccess] = useState<MembershipAccess | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    loadAccess().then((a) => {
      if (!live) return;
      setAccess(a);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const a = await loadAccess(true);
    setAccess(a);
    return a;
  }, []);

  return { access, loading, refresh };
}
