/**
 * Turning billing errors into API responses, the same envelope every route
 * uses ({ success, message, data? }).
 */
import { NextResponse } from "next/server";
import type { AuthResponse } from "@intellia360/shared/types/auth";
import { BillingError } from "./deps";
import { RazorpayError, RazorpayNotConfiguredError } from "./razorpay";

export function billingErrorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof BillingError) {
    return NextResponse.json<AuthResponse>({ success: false, message: err.message }, { status: err.status });
  }
  if (err instanceof RazorpayNotConfiguredError) {
    return NextResponse.json<AuthResponse>(
      { success: false, message: "Payments are not set up yet. Please try again later." },
      { status: 503 }
    );
  }
  if (err instanceof RazorpayError) {
    console.error(`[${label}] Razorpay error`, err.status, err.code, err.message);
    return NextResponse.json<AuthResponse>(
      { success: false, message: "The payment service did not respond. Please try again." },
      { status: 502 }
    );
  }
  console.error(`[${label}]`, err);
  return NextResponse.json<AuthResponse>({ success: false, message: "An unexpected error occurred" }, { status: 500 });
}

export function ok<T>(data: T, message = "OK", status = 200): NextResponse {
  return NextResponse.json<AuthResponse<T>>(
    { success: true, message, data },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => ({}));
}

export function validationError(message: string): NextResponse {
  return NextResponse.json<AuthResponse>({ success: false, message }, { status: 422 });
}
