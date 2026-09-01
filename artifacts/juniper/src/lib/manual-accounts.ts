import { getAccessToken } from "@/lib/supabase";

// Client helpers for manually-added accounts (account discovery, tier 3).
// These are accounts Plaid can't link, or that the user prefers to enter by
// hand, so their net worth and account list can be complete without a live
// connection. Balances are user-maintained (not live).

export type ManualCategory = "banking" | "investing" | "credit" | "loans" | "cash" | "other";
export type ManualKind = "asset" | "liability";

export type ManualAccount = {
  id: string;
  name: string;
  institution: string | null;
  category: ManualCategory;
  kind: ManualKind;
  balance: number | null;
  currency: string;
  created_at?: string;
  /** Last four digits, so a hand-entered account is identifiable beside a
      Plaid-linked one. Migration 0046, so absent on a response served before it
      was applied. */
  mask?: string | null;
  /** What the member says this card's limit is (migration 0046). Only ever set on
      `category: "credit"`, enforced by a CHECK and by the write endpoint.
      Null or absent means unknown, never zero.

      It exists because some cards can NEVER arrive through Plaid: an
      authorized-user card on another person's login is invisible to every
      credential the member holds, and without its limit the Credit page's
      utilization denominator is short and the percentage reads too high.

      Counted into utilization on /app/credit, and NEVER into the Juniper Score.
      A limit somebody typed is a claim, and a score a member could raise by
      typing a bigger number would not be a score. */
  credit_limit?: number | null;
};

export type ManualAccountInput = {
  id?: string;
  name: string;
  institution?: string;
  category: ManualCategory;
  kind?: ManualKind;
  balance?: number | null;
  currency?: string;
  mask?: string | null;
  /** Rejected by the server with a 400 on any category other than `credit`,
      rather than silently dropped: a member who typed a number, was told it
      saved, and saw no effect is worse served than one who is told no. */
  credit_limit?: number | null;
};

export const MANUAL_CATEGORIES: { key: ManualCategory; label: string; defaultKind: ManualKind }[] = [
  { key: "banking", label: "Banking", defaultKind: "asset" },
  { key: "cash", label: "Cash", defaultKind: "asset" },
  { key: "investing", label: "Investing & retirement", defaultKind: "asset" },
  { key: "credit", label: "Credit cards", defaultKind: "liability" },
  { key: "loans", label: "Loans", defaultKind: "liability" },
  { key: "other", label: "Other", defaultKind: "asset" },
];

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

export async function fetchManualAccounts(): Promise<ManualAccount[]> {
  try {
    const res = await authedFetch("/api/manual-accounts");
    if (!res.ok) return [];
    const data = (await res.json()) as ManualAccount[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveManualAccount(input: ManualAccountInput): Promise<ManualAccount | null> {
  try {
    const res = await authedFetch("/api/manual-accounts", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as ManualAccount;
  } catch {
    return null;
  }
}

export async function removeManualAccount(id: string): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/manual-accounts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
