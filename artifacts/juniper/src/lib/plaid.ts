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
  // Credit limit, mirroring SanitizedAccount in api/_plaid.ts. Optional rather
  // than `number | null` because snapshots stored before the server started
  // sanitizing this field have no `limit` key at all, and they only gain one
  // once balances are re-read (the "Refresh data" button on Connections). Treat
  // absent and null the same: limit unknown, so utilization is not computable.
  limit?: number | null;
  currency: string | null;
};

export type PlaidItem = {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  accounts: PlaidAccount[];
  created_at?: string;
};

export type LinkInstitution = {
  institution_id?: string;
  name?: string;
  // Carried from an /institutions/search result so link-token can ask Plaid to
  // highlight this bank in Link's list. Best-effort, see api/plaid/link-token.ts.
  routing_number?: string | null;
};

// One row of Plaid's real institution list, as returned by
// /api/plaid/institutions-search. Names come from Plaid, so they are the exact
// strings Link will show.
export type PlaidInstitutionMatch = {
  institution_id: string;
  name: string;
  oauth: boolean;
  routing_number: string | null;
};

// Normalized key for matching an institution across the connect flow (Layer
// import, gallery link, manual add) against the gallery tiles, so a name that
// came back capitalized or padded still lines up. Case- and whitespace-
// insensitive; shared by ConnectStep (building the set) and InstitutionPicker
// (checking it) so both sides agree.
export const normInstitutionName = (s: string): string => s.trim().toLowerCase();

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
export async function createLinkToken(opts?: { routingNumber?: string | null }): Promise<string | null> {
  try {
    const res = await authedFetch("/api/plaid/link-token", {
      method: "POST",
      body: JSON.stringify(opts?.routingNumber ? { routing_number: opts.routingNumber } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { link_token?: string };
    return data.link_token ?? null;
  } catch {
    return null;
  }
}

// Search Plaid's real institution list. Powers the gallery search bar, so a bank
// that Plaid supports but we never hand-listed is findable by name instead of
// dead-ending in "No matches". Returns [] on any failure (including 503 when
// Plaid isn't configured) so the caller degrades to the curated tiles plus the
// "search all banks" path rather than showing an error.
//
// `signal` lets the caller abort a stale in-flight query, which matters because
// this fires while someone is still typing.
export async function searchInstitutions(
  query: string,
  signal?: AbortSignal,
): Promise<PlaidInstitutionMatch[]> {
  try {
    const res = await authedFetch("/api/plaid/institutions-search", {
      method: "POST",
      body: JSON.stringify({ query }),
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { institutions?: PlaidInstitutionMatch[] };
    return data.institutions ?? [];
  } catch {
    return [];
  }
}

// Account discovery, tier 1 (Plaid Layer): request a Layer session token so
// Plaid Link can open in returning-user mode, recognizing the person by phone
// and surfacing accounts they've already connected across the Plaid network for
// one-tap selection. Returns null when Layer isn't enabled yet (503), so callers
// fall back to the tier-2 gallery. Gated on Plaid Production + a Layer template
// (PLAID_LAYER_TEMPLATE_ID); see api/plaid/layer-session.ts.
export async function createLayerSession(phone?: string): Promise<string | null> {
  try {
    const res = await authedFetch("/api/plaid/layer-session", {
      method: "POST",
      body: JSON.stringify(phone ? { phone } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { link_token?: string };
    return data.link_token ?? null;
  } catch {
    return null;
  }
}

// Layer (phone-first discovery) entry mode, controlled by VITE_PLAID_LAYER:
//   "1" | "live" | "true" -> real Plaid Layer (needs Production + a template)
//   "demo"                -> simulated discovery, testable on Sandbox; recognized
//                            accounts are mocked and imported as manual accounts
//   anything else / unset -> off (the card isn't shown)
export type LayerMode = "off" | "live" | "demo";
export function layerMode(): LayerMode {
  const v = String(import.meta.env.VITE_PLAID_LAYER ?? "").toLowerCase();
  if (v === "demo") return "demo";
  if (v === "1" || v === "live" || v === "true") return "live";
  return "off";
}
export function layerEnabled(): boolean {
  return layerMode() !== "off";
}
export function layerDemo(): boolean {
  return layerMode() === "demo";
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
// transactions (/transactions/sync) and snapshot net worth. Fire-and-report, 
// both run server-side, are user-scoped by JWT, and are safe to call repeatedly
// (the sync resumes from its cursor; the snapshot upserts one row per day).
// Returns whether at least one leg succeeded; degrades quietly when Plaid /
// storage isn't configured yet so callers never block the UI on it.
export async function syncFinances(): Promise<{ transactions: boolean; netWorth: boolean; score: boolean }> {
  const call = async (path: string) => {
    try {
      const res = await authedFetch(path, { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  };
  // Transactions + net worth first (they populate what the score reads), then
  // snapshot the Juniper Score for the trend/delta history.
  const [transactions, netWorth] = await Promise.all([
    call("/api/plaid/transactions-sync"),
    call("/api/plaid/networth-snapshot"),
  ]);
  const score = await call("/api/score/compute");
  return { transactions, netWorth, score };
}

// Best-effort monthly income/spending estimate from live data, used to pre-fill
// the onboarding snapshot after a member links an account. Reads the same
// cashflow the dashboard shows (GET /api/finances). Returns null when nothing is
// linked/synced yet ({ linked: false }), so the caller falls back to manual
// entry. Note: right after linking, transactions may not have finished syncing
// server-side, so this can legitimately return null even for a linked member.
export async function fetchCashflowEstimate(): Promise<{ income: number; spent: number } | null> {
  try {
    const res = await authedFetch("/api/finances");
    if (!res.ok) return null;
    const data = (await res.json()) as { linked?: boolean; cashflow?: { income?: number; spent?: number } };
    if (!data?.linked || !data.cashflow) return null;
    return {
      income: Math.max(0, Math.round(data.cashflow.income || 0)),
      spent: Math.max(0, Math.round(data.cashflow.spent || 0)),
    };
  } catch {
    return null;
  }
}

// Poll fetchCashflowEstimate a few times, giving server-side transaction
// ingestion a moment to land right after a fresh link (the sync fired by
// ConnectStep is async, so the first read often comes back empty). Resolves as
// soon as an estimate with a nonzero value is available, or null once the
// attempts are exhausted. `signal` lets the caller bail if the member navigates
// away mid-poll.
export async function pollCashflowEstimate(opts?: {
  attempts?: number;
  intervalMs?: number;
  signal?: { aborted: boolean };
}): Promise<{ income: number; spent: number } | null> {
  const attempts = opts?.attempts ?? 6;
  const intervalMs = opts?.intervalMs ?? 1500;
  for (let a = 0; a < attempts; a++) {
    if (opts?.signal?.aborted) return null;
    const est = await fetchCashflowEstimate();
    if (est && (est.income > 0 || est.spent > 0)) return est;
    if (a < attempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
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

// Institution names of linked accounts, used to power the marketplace
// "You use this" badges from real connections. Degrades to [] when unlinked
// or unconfigured.
export async function fetchConnectionNames(): Promise<string[]> {
  const items = await fetchPlaidItems();
  return items.map((i) => i.institution_name).filter((n): n is string => !!n);
}
