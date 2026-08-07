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
};

export type ManualAccountInput = {
  id?: string;
  name: string;
  institution?: string;
  category: ManualCategory;
  kind?: ManualKind;
  balance?: number | null;
  currency?: string;
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
