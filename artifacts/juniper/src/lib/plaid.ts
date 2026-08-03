import { getAccessToken } from "@/lib/supabase";

// Client-side helpers for the Plaid connection flow. All access tokens live
// server-side; the client only ever sees sanitized account snapshots.

export type PlaidAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  currency: string | null;
};

export type PlaidItem = {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  accounts: PlaidAccount[];
  created_at?: string;
};

export type LinkInstitution = { institution_id?: string; name?: string };

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

// Fetch a short-lived link_token to open Plaid Link. Returns null if linking
// isn't configured yet (503) or on any error, so callers can show a friendly
// "not turned on" state.
export async function createLinkToken(): Promise<string | null> {
  try {
    const res = await authedFetch("/api/plaid/link-token", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { link_token?: string };
    return data.link_token ?? null;
  } catch {
    return null;
  }
}

export async function exchangePublicToken(
  publicToken: string,
  institution?: LinkInstitution,
): Promise<PlaidItem | null> {
  try {
    const res = await authedFetch("/api/plaid/exchange", {
      method: "POST",
      body: JSON.stringify({ public_token: publicToken, institution }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlaidItem;
  } catch {
    return null;
  }
}

// Kick the server-side data pipeline for the caller's linked items: pull new
// transactions (/transactions/sync) and snapshot net worth. Fire-and-report —
// both run server-side, are user-scoped by JWT, and are safe to call repeatedly
// (the sync resumes from its cursor; the snapshot upserts one row per day).
// Returns whether at least one leg succeeded; degrades quietly when Plaid /
// storage isn't configured yet so callers never block the UI on it.
export async function syncFinances(): Promise<{ transactions: boolean; netWorth: boolean }> {
  const call = async (path: string) => {
    try {
      const res = await authedFetch(path, { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  };
  const [transactions, netWorth] = await Promise.all([
    call("/api/plaid/transactions-sync"),
    call("/api/plaid/networth-snapshot"),
  ]);
  return { transactions, netWorth };
}

export async function fetchPlaidItems(): Promise<PlaidItem[]> {
  try {
    const res = await authedFetch("/api/plaid/accounts");
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: PlaidItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function removePlaidItem(itemId: string): Promise<boolean> {
  try {
    const res = await authedFetch("/api/plaid/remove", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Institution names of linked accounts — used to power the marketplace
// "You use this" badges from real connections. Degrades to [] when unlinked
// or unconfigured.
export async function fetchConnectionNames(): Promise<string[]> {
  const items = await fetchPlaidItems();
  return items.map((i) => i.institution_name).filter((n): n is string => !!n);
}
