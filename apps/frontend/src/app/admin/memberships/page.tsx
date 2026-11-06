"use client";

/**
 * /admin/memberships — every membership and IntelliaPlay purchase, with its
 * Razorpay status; complimentary access ("grants"); and a manual sync with
 * Razorpay that repairs anything a missed webhook left behind.
 */
import React, { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Crown, RefreshCw } from "@/components/admin/icons";
import { apiFetch } from "@/lib/api";
import { planDisplayName, type PlanTier } from "@intellia360/shared/billing/plans";
import { formatMoney } from "@intellia360/shared/billing/currencies";
import type { AdminGrantRow, AdminSubscriptionRow } from "@intellia360/shared/types/api/billing";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  AUTHENTICATED: "bg-blue-100 text-blue-700",
  PENDING: "bg-amber-100 text-amber-700",
  HALTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  COMPLETED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-slate-100 text-slate-600",
  REFUNDED: "bg-slate-100 text-slate-600",
  CREATED: "bg-slate-100 text-slate-500",
  PAUSED: "bg-slate-100 text-slate-600",
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN") : "—");

// admin.css redefines Tailwind's `.border` with a 0px width, so form fields
// set their border inline (as the invoice modal on /admin/payments does).
const FIELD: React.CSSProperties = { border: "1.5px solid #cbd5e1", background: "#ffffff" };

async function getJson<T>(url: string): Promise<{ ok: boolean; message: string; data?: T }> {
  try {
    const res = await apiFetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && json?.success, message: json?.message ?? `Request failed (${res.status})`, data: json?.data };
  } catch {
    return { ok: false, message: "Could not reach the API." };
  }
}

async function send(url: string, method: string, body?: unknown) {
  try {
    const res = await apiFetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && json?.success === true, message: json?.message ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, message: "Could not reach the API." };
  }
}

function fetchBoth(filters: { status: string; product: string }) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.product) qs.set("product", filters.product);
  return Promise.all([
    getJson<AdminSubscriptionRow[]>(`/api/admin/billing/subscriptions?${qs}`),
    getJson<AdminGrantRow[]>("/api/admin/billing/grants"),
  ]);
}

export default function AdminMembershipsPage() {
  const [subs, setSubs] = useState<AdminSubscriptionRow[]>([]);
  const [grants, setGrants] = useState<AdminGrantRow[]>([]);
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [grant, setGrant] = useState({ email: "", tier: "PLUS", days: "30", reason: "" });

  const show = useCallback(
    ([s, g]: Awaited<ReturnType<typeof fetchBoth>>) => {
      setSubs(s.data ?? []);
      setGrants(g.data ?? []);
      if (!s.ok) setMessage({ ok: false, text: s.message });
      setLoading(false);
    },
    []
  );

  const load = useCallback((filters: { status: string; product: string }) => fetchBoth(filters).then(show), [show]);

  useEffect(() => {
    void fetchBoth({ status: "", product: "" }).then(show);
  }, [show]);

  const refilter = (next: { status?: string; product?: string }) => {
    const filters = { status: next.status ?? status, product: next.product ?? product };
    setStatus(filters.status);
    setProduct(filters.product);
    setLoading(true);
    void load(filters);
  };

  const sync = async () => {
    setSyncing(true);
    const res = await send("/api/admin/billing/reconcile", "POST");
    setSyncing(false);
    setMessage({ ok: res.ok, text: res.message });
    void load({ status, product });
  };

  const addGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await send("/api/admin/billing/grants", "POST", {
      email: grant.email.trim(),
      tier: grant.tier,
      days: Number(grant.days),
      reason: grant.reason.trim() || null,
    });
    setMessage({ ok: res.ok, text: res.message });
    if (res.ok) {
      setGrant({ email: "", tier: grant.tier, days: grant.days, reason: "" });
      void load({ status, product });
    }
  };

  const revoke = async (row: AdminGrantRow) => {
    if (!window.confirm(`Revoke ${planDisplayName(row.tier)} for ${row.user.email}?`)) return;
    const res = await send(`/api/admin/billing/grants/${encodeURIComponent(row.id)}`, "DELETE");
    setMessage({ ok: res.ok, text: res.message });
    void load({ status, product });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Crown className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Finance & Billing</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Memberships</h1>
            <p className="text-sm text-slate-500 mt-1">
              Membership and IntelliaPlay purchases, as Razorpay reports them, and complimentary access.
            </p>
          </div>
          <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className="w-4 h-4" />
            {syncing ? "Syncing…" : "Sync with Razorpay"}
          </button>
        </div>

        {message && (
          <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} role="status">
            {message.text}
          </p>
        )}

        {/* PURCHASES */}
        <div className="admin-card p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h2 className="text-lg font-extrabold text-slate-900">Purchases</h2>
            <div className="flex flex-wrap gap-2">
              <select className="rounded-lg px-3 py-2 text-sm" style={FIELD} value={product} onChange={(e) => refilter({ product: e.target.value })} aria-label="Product">
                <option value="">All products</option>
                <option value="MEMBERSHIP">Memberships</option>
                <option value="INTELLIAPLAY">IntelliaPlay</option>
              </select>
              <select className="rounded-lg px-3 py-2 text-sm" style={FIELD} value={status} onChange={(e) => refilter({ status: e.target.value })} aria-label="Status">
                <option value="">All statuses</option>
                {Object.keys(STATUS_STYLE).map((s) => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Payer</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Learners</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Period ends</th>
                  <th className="px-4 py-3">Razorpay</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-6 text-slate-500">Loading…</td></tr>
                )}
                {!loading && subs.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-slate-500">No purchases yet.</td></tr>
                )}
                {subs.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{s.payer.name}</div>
                      <div className="text-xs text-slate-500">{s.payer.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{planDisplayName(s.tier)}</div>
                      <div className="text-xs text-slate-500">
                        {s.interval === "MONTHLY" ? "Monthly" : "Annual"} · {s.mode === "AUTO_RENEW" ? "Auto-renew" : "Pass"}
                        {s.cancelAtPeriodEnd ? " · cancelling" : ""}
                      </div>
                      {s.pendingChange && (
                        <div className="text-xs text-indigo-600">Next: {planDisplayName(s.pendingChange.tier)} × {s.pendingChange.seats}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.learners.map((l) => l.name).join(", ")}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(s.amountMinor, s.currency, "en-IN", { keepDecimals: true })}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[s.status] ?? ""}`}>{s.status}</span>
                      {s.inTrial && <div className="mt-1 text-xs font-semibold text-emerald-700">free trial</div>}
                      {s.grantsAccess && <div className="mt-1 text-xs text-green-700">has access</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.inTrial ? `trial ends ${day(s.trialEndsAt)}` : s.status === "PENDING" ? (s.graceUntil ? `grace to ${day(s.graceUntil)}` : "no access") : day(s.currentPeriodEnd)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.gatewayId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GRANTS */}
        <div className="admin-card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Complimentary access</h2>
            <p className="text-sm text-slate-500">Give a learner a membership level or IntelliaPlay for a number of days, without payment.</p>
          </div>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void addGrant(e)}>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Learner email
              <input type="email" required value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} className="w-64 rounded-lg px-3 py-2 text-sm" style={FIELD} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Access
              <select value={grant.tier} onChange={(e) => setGrant({ ...grant, tier: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={FIELD}>
                {(["CORE", "PLUS", "ULTRA", "INTELLIAPLAY"] as PlanTier[]).map((t) => (
                  <option key={t} value={t}>{planDisplayName(t)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Days
              <input type="number" min={1} max={3660} required value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })} className="w-24 rounded-lg px-3 py-2 text-sm" style={FIELD} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Reason (optional)
              <input value={grant.reason} maxLength={300} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} className="w-64 rounded-lg px-3 py-2 text-sm" style={FIELD} />
            </label>
            <button type="submit" className="admin-btn-primary">Grant access</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Until</th>
                  <th className="px-4 py-3">Given by</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {grants.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No complimentary access given.</td></tr>
                )}
                {grants.map((g) => {
                  const live = !g.revokedAt && new Date(g.validUntil) > new Date();
                  return (
                    <tr key={g.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{g.user.name}</div>
                        <div className="text-xs text-slate-500">{g.user.email}</div>
                      </td>
                      <td className="px-4 py-3">{planDisplayName(g.tier)}</td>
                      <td className="px-4 py-3">{g.revokedAt ? `revoked ${day(g.revokedAt)}` : day(g.validUntil)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{g.grantedBy}</td>
                      <td className="px-4 py-3 text-slate-600">{g.reason ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {live && (
                          <button type="button" className="text-xs font-bold text-red-600 hover:underline" onClick={() => void revoke(g)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
