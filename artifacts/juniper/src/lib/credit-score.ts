// Stage 10d: the Credit page's real, per-member VantageScore 3.0 pull. Reads
// GET /api/credit/score, which looks up the caller's OWN spinwheel_user_id
// (written by api/credit/verify.ts after a real SMS OTP verification) rather
// than a single shared identity. `sandbox` still needs to gate the disclosure
// on the Credit page: SPINWHEEL_ENV stays "sandbox" until a real Spinwheel
// production contract exists, so every pull today returns Spinwheel's own
// canned test fixture regardless of whose real identity verified it. See
// api/_credit-provider.ts and api/credit/score.ts for the full account.
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

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

export type CreditScoreResult = CreditScoreSnapshot | { available: false; reason?: string };

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// Module-scope, not per-hook-call: `Credit` (or something above it, workspace
// or auth resolving) can mount more than once in one page load, and each
// mount used to fire its own independent fetch. That is exactly what raced
// Spinwheel's own one-pull-per-identity-per-day sandbox limit on 2026-09-07:
// two real calls landed close enough together that both succeeded before
// Spinwheel's own limiter caught up, burning a whole day's quota on one page
// load. The server-side cache in api/credit/score.ts only covers one warm
// Edge instance, which is not enough on its own; deduping here, at the one
// place every mount's request actually originates, is the fix that holds
// regardless of why a remount happens.
let cached: CreditScoreResult | null = null;
let inFlight: Promise<CreditScoreResult | null> | null = null;

async function pullOnce(): Promise<CreditScoreResult | null> {
  try {
    const r = await authedFetch("/api/credit/score");
    if (!r.ok) return null;
    const next = (await r.json()) as CreditScoreResult;
    cached = next;
    return next;
  } catch {
    return null;
  }
}

export async function fetchCreditScore(): Promise<CreditScoreResult | null> {
  if (cached) return cached;
  if (!inFlight) inFlight = pullOnce().finally(() => { inFlight = null; });
  return inFlight;
}

export function useCreditScore(): { data: CreditScoreResult | null; loading: boolean } {
  const [data, setData] = useState<CreditScoreResult | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) { setData(cached); setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      const next = await fetchCreditScore();
      if (!cancelled) { setData(next); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}

// Stage 10d's onboarding consent flow: start a real SMS OTP, then verify the
// code the member received. Neither result is cached (unlike the score
// above) since each is a one-time action the member takes once per session.
export type ConnectCreditResult = { ok: true; userId: string } | { ok: false; error: string };

export async function connectCredit(phone: string, dob: string): Promise<ConnectCreditResult> {
  try {
    const r = await authedFetch("/api/credit/connect", { method: "POST", body: JSON.stringify({ phone, dob }) });
    const data = (await r.json().catch(() => ({}))) as { userId?: string; error?: string };
    if (!r.ok || !data.userId) return { ok: false, error: data.error ?? "Couldn't send a code. Try again." };
    return { ok: true, userId: data.userId };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export type VerifyCreditResult = { ok: true } | { ok: false; error: string };

export async function verifyCredit(userId: string, code: string): Promise<VerifyCreditResult> {
  try {
    const r = await authedFetch("/api/credit/verify", { method: "POST", body: JSON.stringify({ userId, code }) });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !data.ok) return { ok: false, error: data.error ?? "That code didn't work. Try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

// VantageScore 3.0's own published bands (300-850), not a Juniper opinion:
// this is someone else's score model, so the label has to match theirs.
export function vantageBand(score: number): string {
  if (score >= 781) return "Excellent";
  if (score >= 661) return "Good";
  if (score >= 601) return "Fair";
  if (score >= 500) return "Poor";
  return "Very poor";
}
