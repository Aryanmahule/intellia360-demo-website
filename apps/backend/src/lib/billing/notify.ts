/**
 * Telling a payer what happened: an email (Resend) and an in-app notification.
 * Best-effort: a notice that fails to send must never fail the payment or
 * webhook it reports on.
 */
import { formatMoney } from "@intellia360/shared/billing/currencies";
import { planDisplayName, type PlanTier } from "@intellia360/shared/billing/plans";
import { sendBillingEmail } from "@/lib/auth/email";
import type { BillingDeps } from "./deps";
import type { SubscriptionRow } from "./access";
import { readPlans } from "./state";

const MEMBERSHIP_PAGE = "/student/membership";

async function payerOf(deps: BillingDeps, record: SubscriptionRow) {
  return deps.db.user.findUnique({ where: { id: record.payerUserId }, select: { id: true, name: true, email: true } });
}

async function inApp(deps: BillingDeps, userId: string, title: string, description: string) {
  await deps.db.notification.create({
    data: {
      userId,
      type: "announcement",
      tabCategory: "announcements",
      icon: "💳",
      iconBg: "rgba(249, 115, 22, 0.12)",
      title,
      description,
      categoryTag: "Billing",
      actionUrl: MEMBERSHIP_PAGE,
      actionText: "View membership →",
      isRead: false,
    },
  });
}

export async function notifyPaymentReceived(deps: BillingDeps, record: SubscriptionRow, amountMinor: number, currency: string) {
  try {
    const payer = await payerOf(deps, record);
    if (!payer) return;
    const plan = planDisplayName(record.tier as PlanTier, await readPlans(deps.db));
    const amount = formatMoney(amountMinor, currency, undefined, { keepDecimals: true });
    await inApp(deps, payer.id, `Payment received: ${amount}`, `Thank you! ${plan} is active.`);
    await sendBillingEmail(payer.email, payer.name, {
      subject: `Payment received for ${plan}`,
      heading: "Thank you for your payment",
      lines: [`We received ${amount} for ${plan}.`, "You can see your plan and receipts on your membership page."],
      ctaLabel: "View membership",
      ctaPath: MEMBERSHIP_PAGE,
    });
  } catch (err) {
    console.error("[billing/notify] receipt not sent:", (err as Error).message);
  }
}

export async function notifyPaymentFailed(deps: BillingDeps, record: SubscriptionRow) {
  try {
    const payer = await payerOf(deps, record);
    if (!payer) return;
    const plan = planDisplayName(record.tier as PlanTier, await readPlans(deps.db));
    const until = record.graceUntil ? record.graceUntil.toDateString() : "a few days";
    await inApp(deps, payer.id, `We couldn't renew ${plan}`, `Your bank declined the renewal. Access continues until ${until} while we retry.`);
    await sendBillingEmail(payer.email, payer.name, {
      subject: `We couldn't renew ${plan}`,
      heading: "Your renewal payment didn't go through",
      lines: [
        `Your bank declined the renewal for ${plan}. Razorpay will try again over the next few days.`,
        `Access continues until ${until}. Make sure your card or UPI mandate is active, or buy the plan again from your membership page.`,
      ],
      ctaLabel: "Open membership",
      ctaPath: MEMBERSHIP_PAGE,
    });
  } catch (err) {
    console.error("[billing/notify] failure notice not sent:", (err as Error).message);
  }
}

/**
 * Sent once, when a free trial starts: when it ends and what will be charged
 * then. Indian banks also send their own notice 24 hours before a mandate
 * debit; card issuers abroad do not, so this is the buyer's reminder.
 */
export async function notifyTrialStarted(deps: BillingDeps, record: SubscriptionRow) {
  try {
    const payer = await payerOf(deps, record);
    if (!payer || !record.trialEndsAt) return;
    const plan = planDisplayName(record.tier as PlanTier, await readPlans(deps.db));
    const ends = record.trialEndsAt.toUTCString().replace(/ GMT$/, " UTC");
    const amount = formatMoney(record.amountMinor, record.currency, undefined, { keepDecimals: true });
    const period = record.interval === "MONTHLY" ? "month" : "year";
    await inApp(
      deps,
      payer.id,
      `Your ${plan} free trial has started`,
      `It ends on ${ends}. Then ${amount} a ${period} is charged unless you cancel from your membership page.`
    );
    await sendBillingEmail(payer.email, payer.name, {
      subject: `Your ${plan} free trial has started`,
      heading: "Enjoy your free trial",
      lines: [
        `Your free trial of ${plan} is active until ${ends}.`,
        `When it ends, ${amount} a ${period} will be charged to the payment method you set up, and then every ${period} until you cancel.`,
        "Don't want to continue? Cancel any time before the trial ends from your membership page and you won't be charged.",
      ],
      ctaLabel: "Manage membership",
      ctaPath: MEMBERSHIP_PAGE,
    });
  } catch (err) {
    console.error("[billing/notify] trial notice not sent:", (err as Error).message);
  }
}
