/**
 * What billing code needs from the outside world, passed in rather than
 * imported, so the same functions run against Prisma + Razorpay in the API and
 * against in-memory fakes in tests.
 */
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { razorpay, type RazorpayClient } from "./razorpay";

export type BillingDb = Pick<
  PrismaClient,
  | "planPrice"
  | "planConfig"
  | "billingSettings"
  | "billingProfile"
  | "familyLink"
  | "familyLinkCode"
  | "membershipSubscription"
  | "membershipGrant"
  | "webhookEvent"
  | "usageCounter"
  | "payment"
  | "user"
  | "studentProfile"
  | "notification"
>;

export interface BillingDeps {
  db: BillingDb;
  razorpay: RazorpayClient;
  now: () => Date;
}

export function liveDeps(): BillingDeps {
  return { db, razorpay, now: () => new Date() };
}

/** Prisma's unique-constraint error. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/** A rule a request broke: becomes a 4xx with this message. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = "BillingError";
  }
}
