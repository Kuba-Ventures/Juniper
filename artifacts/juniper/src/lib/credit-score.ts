// Stage 10b: the Credit page's real, sandbox-sourced VantageScore 3.0 pull.
// Reads GET /api/credit/score, which wraps a single pre-connected Spinwheel
// sandbox test identity, not the caller's own credit file: see
// api/_credit-provider.ts for exactly why, and Stage 10c/10d in ROADMAP.md for
// what has to land before this can ever be a real member's own score.
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export type CreditScoreFactor = { code: string; description: string };

export type CreditScoreSnapshot = {
  available: true;
  sandbox: true;
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

export async function fetchCreditScore(): Promise<CreditScoreResult | null> {
  try {
    const r = await authedFetch("/api/credit/score");
    if (!r.ok) return null;
    return (await r.json()) as CreditScoreResult;
  } catch {
    return null;
  }
}

export function useCreditScore(): { data: CreditScoreResult | null; loading: boolean } {
  const [data, setData] = useState<CreditScoreResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchCreditScore();
      if (!cancelled) { setData(next); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
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
