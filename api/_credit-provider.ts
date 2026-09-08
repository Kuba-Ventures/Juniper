// Spinwheel REST helper (Stage 10, credit bureau score). Mirrors api/_plaid.ts:
// a thin fetch wrapper with a timeout, because a slow bureau call is exactly
// the kind of thing that can eat an edge function's 25-second budget, and a
// transport failure comes back as a result rather than a throw so one caller
// awaiting it can't be left hanging on an unhandled rejection.
//
// Real per-member connect as of Stage 10d: api/credit/connect.ts and
// api/credit/verify.ts run a genuine SMS+OTP round trip against the member's
// own phone (Stage 10c's identity-match decision: phone + DOB, nothing more),
// and api/credit/score.ts pulls whichever spinwheel_user_id that verification
// wrote to credit_consents. SPINWHEEL_ENV still reads "sandbox" until a real
// Spinwheel production contract exists, though, so every pull today still
// returns Spinwheel's own canned sandbox fixture regardless of whose real
// identity verified it — see api/credit/score.ts's header for why that makes
// the "sandbox" flag on every response load-bearing rather than decorative.
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

// 15 U.S.C. 1681g(f) / Cal. Civ. Code 1785.15.1: at most four adverse key
// factors, ordered by importance, per model. Matches credit.tsx's
// PLANNED_FACTORS comment exactly — do not raise this without re-reading it.
const MAX_FACTORS = 4;

export type CreditScoreFactor = { code: string; description: string };
export type CreditScoreSnapshot = {
  available: true;
  sandbox: boolean;
  score: number;
  model: "VANTAGE_SCORE_3_0";
  sourceBureau: string;
  asOf: string;
  factors: CreditScoreFactor[];
};
export type PullCreditScoreResult = CreditScoreSnapshot | { failed: true; status: number };

type SpinwheelScoreDetail = {
  creditScore: number;
  model: string;
  sourceBureau: string;
  reportedDate: string;
  factors?: CreditScoreFactor[];
};
type SpinwheelDebtProfileResp = {
  data?: { creditReports?: { creditScoreDetails?: SpinwheelScoreDetail[] }[] };
  status?: { messages?: { desc?: string }[] };
};

// The one place a debtProfile pull is requested and parsed, shared by
// api/credit/score.ts (a live, on-demand, cached pull for the Credit page)
// and api/credit/_score-check.ts (the Stage 10e monthly cron leg that detects
// a change): one definition of what counts as a valid VantageScore 3.0
// response, so the two callers cannot come to disagree about it.
export async function pullCreditScore(spinwheelUserId: string): Promise<PullCreditScoreResult> {
  const r = await creditFetch<SpinwheelDebtProfileResp>(`/v1/users/${spinwheelUserId}/debtProfile`, {
    creditReport: { type: "1_BUREAU.FULL", sourceBureau: "Equifax" },
    creditScore: { model: "VANTAGE_SCORE_3_0", sourceBureau: "Equifax" },
  });
  if (!r.ok) {
    console.error(`[credit] debtProfile failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    return { failed: true, status: r.status };
  }

  const detail = r.data.data?.creditReports?.[0]?.creditScoreDetails?.[0];
  if (!detail || detail.model !== "VANTAGE_SCORE_3_0") {
    return { failed: true, status: 200 };
  }

  return {
    available: true,
    sandbox: creditEnv() !== "production",
    score: detail.creditScore,
    model: "VANTAGE_SCORE_3_0",
    sourceBureau: detail.sourceBureau,
    asOf: detail.reportedDate,
    factors: (detail.factors ?? []).slice(0, MAX_FACTORS),
  };
}
