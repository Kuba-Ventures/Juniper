// Spinwheel REST helper (Stage 10, credit bureau score). Mirrors api/_plaid.ts:
// a thin fetch wrapper with a timeout, because a slow bureau call is exactly
// the kind of thing that can eat an edge function's 25-second budget, and a
// transport failure comes back as a result rather than a throw so one caller
// awaiting it can't be left hanging on an unhandled rejection.
//
// SANDBOX ONLY as of Stage 10b. Every pull goes through a single, pre-connected
// Spinwheel SANDBOX test identity (established once via their SMS+OTP connect
// flow, which needs a human to read a real text — see docs/CREDIT_PROVIDER.md
// section 5 and PROJECT.md's 2026-09-07 credit-score entries for how that
// identity was created), never a real member's own phone/DOB. Stage 10c's
// identity-match decision and consent screen have to land, and Stage 10d's
// onboarding trigger has to exist, before this module can ever pull a real
// person's credit file. Do not wire a real per-member connect flow in here
// without reading those stages first.
//
// Never log a response body: a debt profile carries SSN-last-4 and addresses.
import { readEnv } from "./_env";

const SPINWHEEL_BASE: Record<string, string> = {
  sandbox: "https://sandbox-api.spinwheel.io",
  production: "https://api.spinwheel.io",
};

export function creditEnv(): string {
  return (readEnv("SPINWHEEL_ENV") || "sandbox").toLowerCase();
}

export function creditBaseUrl(): string {
  return SPINWHEEL_BASE[creditEnv()] ?? SPINWHEEL_BASE.sandbox;
}

export function creditConfigured(): boolean {
  return !!readEnv("SPINWHEEL_SECRET_KEY");
}

// The single sandbox test identity connected once, outside this app, via
// Spinwheel's SMS+OTP flow. Set on Vercel (Preview/Development only, same
// scoping convention as PLAID_SECRET) once that connect has been run.
export function creditSandboxUserId(): string | undefined {
  return readEnv("SPINWHEEL_SANDBOX_USER_ID");
}

export type CreditResult<T> = { ok: boolean; status: number; data: T };

export const CREDIT_DEFAULT_TIMEOUT_MS = 15_000;
export const CREDIT_TIMEOUT_CODE = "JUNIPER_REQUEST_TIMEOUT";
export const CREDIT_UNREACHABLE_CODE = "JUNIPER_REQUEST_FAILED";

// Call a Spinwheel endpoint with the secret key as a Bearer token.
export async function creditFetch<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
  opts?: { timeoutMs?: number; method?: "GET" | "POST" },
): Promise<CreditResult<T>> {
  const timeoutMs = Math.max(1, Math.round(opts?.timeoutMs ?? CREDIT_DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${creditBaseUrl()}${path}`, {
      method: opts?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${readEnv("SPINWHEEL_SECRET_KEY")}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const timedOut = controller.signal.aborted;
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      data: {
        error_code: timedOut ? CREDIT_TIMEOUT_CODE : CREDIT_UNREACHABLE_CODE,
        error_message: timedOut
          ? `Spinwheel did not answer ${path} within ${timeoutMs}ms`
          : `Could not reach Spinwheel: ${err instanceof Error ? err.message : String(err)}`,
      } as T,
    };
  } finally {
    clearTimeout(timer);
  }
}
