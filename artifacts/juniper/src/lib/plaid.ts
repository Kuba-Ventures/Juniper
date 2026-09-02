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
  // Per-item health. All optional: /api/plaid/accounts drops these rather than
  // fail the whole request if a migration has not landed yet, so every consumer
  // has to cope with them being absent rather than assume a shape.
  last_synced_at?: string | null;
  // Only ever a code that means the connection is finished and needs relinking.
  // Transient Plaid errors are deliberately not recorded, see _item-sync-state.
  last_error_code?: string | null;
  last_error_at?: string | null;
  balances_refreshed_at?: string | null;
  balances_from_cache?: boolean | null;
};

// Mirrors DEAD_ITEM_CODES in api/_item-sync-state.ts. Duplicated rather than
// imported because the client cannot reach into api/, and kept to two values
// that are checked against that file whenever either changes.
const DEAD_ITEM_CODES = new Set(["ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN"]);

export function itemNeedsRelink(item: PlaidItem): boolean {
  return !!item.last_error_code && DEAD_ITEM_CODES.has(item.last_error_code);
}

// Brand metadata for one institution, mirroring InstitutionBrand in
// api/plaid/institution-logos.ts. Both fields are optional on Plaid's side: a
// small bank or credit union routinely has neither a logo nor a brand color on
// file, so every consumer needs the fallback chain rather than these values.
export type InstitutionBrand = {
  name: string | null;
  // Base64 PNG body exactly as Plaid returns it, with no data: prefix. Use
  // institutionLogoSrc() rather than interpolating it yourself.
  logo: string | null;
  // Hex like "#0a7cff". Display-only, used to tint the monogram tile that an
  // institution with no logo falls back to.
  primary_color: string | null;
};

// institution_id -> brand, as /api/plaid/institution-logos returns it. Keyed by
// id rather than name because that is the only identifier that survives Plaid
// spelling a bank differently from the name stored on the item ("Citi" vs
// "Citibank").
export type InstitutionBrandMap = Record<string, InstitutionBrand>;

// Turn a Plaid logo into something an <img src> accepts. Plaid sends the raw
// base64 body; the guard is there because a future Plaid change (or a cached
// payload from one) handing over a full data URI should not double-prefix it.
export function institutionLogoSrc(logo: string | null | undefined): string | null {
  if (!logo) return null;
  return logo.startsWith("data:") ? logo : `data:image/png;base64,${logo}`;
}

export type LinkInstitution = {
  institution_id?: string;
  name?: string;
  // Set to repair an existing connection instead of adding one. Its presence is
  // what makes the whole flow update mode, including skipping the token
  // exchange on the way back, see use-link-queue.
  item_id?: string;
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
  // Plaid's own brand art for this institution, from the same search response
  // (options.include_optional_metadata). Shaped to drop straight into
  // resolveInstitutionMark as an InstitutionBrand, so a search row and a linked
  // row resolve their mark through one code path. Null on the many small
  // institutions Plaid holds nothing for.
  logo: string | null;
  primary_color: string | null;
};

// Normalized key for matching an institution across the connect flow (Layer
// import, Plaid link, manual add) against the set already on file, so a name that
// came back capitalized or padded still lines up. Case- and whitespace-
// insensitive; shared by the callers that build the set (ConnectStep, the
// Connections page) and InstitutionPicker, which checks it to keep a linked bank
// out of its search results.
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
// `itemId` puts Link into update mode against that existing item, which is how
// a dead connection is repaired rather than duplicated. Server-side the id is
// re-checked against the caller's own rows.
/**
 * Mint a Link token. Returns the token and, when there isn't one, the HTTP status
 * that explains why.
 *
 * The status matters because the caller has to tell the member something, and the
 * two cases are not the same. 503 means Plaid genuinely is not configured for this
 * deployment, which is a "not enabled yet" state and permanent until someone
 * changes an env var. Anything else -- a 400 from Plaid, a 502, a network blip --
 * is a fault, and telling somebody a feature "isn't enabled yet" when the truth is
 * that a request failed sends them away instead of having them retry.
 *
 * That is not hypothetical: an invalid product in the link-token payload made
 * every call 400 for a day, and because this function collapsed every failure to
 * null, the app told everyone linking wasn't enabled. Nobody could connect a bank
 * and nothing said why.
 */
export async function createLinkToken(
  opts?: { routingNumber?: string | null; itemId?: string | null },
): Promise<{ token: string | null; status: number | null }> {
  try {
    const res = await authedFetch("/api/plaid/link-token", {
      method: "POST",
      body: JSON.stringify({
        ...(opts?.routingNumber ? { routing_number: opts.routingNumber } : {}),
        ...(opts?.itemId ? { item_id: opts.itemId } : {}),
      }),
    });
    if (!res.ok) return { token: null, status: res.status };
    const data = (await res.json()) as { link_token?: string };
    return { token: data.link_token ?? null, status: data.link_token ? null : res.status };
  } catch {
    return { token: null, status: null };
  }
}

// Search Plaid's real institution list. This is the whole front door of the
// connect flow now that the curated gallery is gone (see institution-picker.tsx),
// so every bank Plaid supports is findable by name rather than only the ~60 we
// once hand-listed. Returns [] on any failure (including 503 when Plaid isn't
// configured) so the caller degrades to the "search all banks" path rather than
// showing an error.
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
// fall back to the tier-2 search. Gated on Plaid Production + a Layer template
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

// One item's leg of a sync that Plaid or storage refused, as both sync endpoints
// now report them: they isolate per item rather than aborting the whole run, so
// one dead connection no longer costs the member every other refresh.
// `needs_relink` marks the codes that mean the connection itself is finished
// (ITEM_LOGIN_REQUIRED, INVALID_ACCESS_TOKEN) rather than a transient failure.
type ItemFailure = {
  item_id?: string;
  error_code?: string | null;
  error_message?: string | null;
  needs_relink?: boolean;
};

async function postOk(path: string): Promise<boolean> {
  try {
    const res = await authedFetch(path, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

// POST a sync leg and read its body instead of discarding it. `res.ok` alone
// can't tell "nothing to sync" from "we pulled rows and failed to store them",
// and it can't tell the retry loop below whether transactions have landed.
async function postSync(path: string): Promise<{ ok: boolean; added: number; failures: ItemFailure[] }> {
  try {
    const res = await authedFetch(path, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { added?: number; failures?: ItemFailure[] };
    return {
      ok: res.ok,
      added: Number(body.added ?? 0),
      failures: Array.isArray(body.failures) ? body.failures : [],
    };
  } catch {
    return { ok: false, added: 0, failures: [] };
  }
}

export type SyncResult = {
  transactions: boolean;
  netWorth: boolean;
  score: boolean;
  // Transaction rows written by this call. 0 is normal and not an error: Plaid
  // often hasn't prepared the first pull yet right after a link.
  added: number;
  // Items either leg could not refresh at all, and of those, the ones whose
  // connection is dead until it's linked again. Reported so a caller can say so
  // rather than leaving a refresh that quietly did nothing.
  failedItems: number;
  needsRelink: string[];
};

// Kick the server-side data pipeline for the caller's linked items: pull new
// transactions (/transactions/sync) and snapshot net worth. Fire-and-report,
// both run server-side, are user-scoped by JWT, and are safe to call repeatedly
// (the sync resumes from its cursor; the snapshot upserts one row per day).
// Degrades quietly when Plaid / storage isn't configured yet so callers never
// block the UI on it.
/**
 * Rebuild the reconstructed part of the member's net-worth history (issue from
 * the Schwab relink; see api/plaid/networth-backfill.ts).
 *
 * The ordinary backfill fires on every sync and is a no-op once the days exist,
 * deliberately: a reconstruction is derived from TODAY's balances, so rewriting
 * it on every sync would make the member's own past wobble as the market moves.
 * This asks for the one case where that default is wrong, which is when the
 * INPUTS changed: an item relinked to consent to a product it could not serve
 * before can now answer for a stretch that was carried back flat.
 *
 * Not called by `syncFinances()` and it must not be: this is something somebody
 * asks for, and the endpoint reports what it cleared so they can check it.
 */
export async function rebuildNetworthHistory(): Promise<{
  ok: boolean;
  cleared?: number;
  written?: number;
  days?: number;
  recordedKept?: number;
  investmentsAdjusted?: number;
  investmentsUnavailable?: number;
  error?: string;
} | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/plaid/networth-backfill?rebuild=1", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: String(data.error ?? `HTTP ${res.status}`) };
    return {
      ok: true,
      cleared: Number(data.cleared ?? 0),
      written: Number(data.written ?? 0),
      days: Number(data.days ?? 0),
      recordedKept: Number(data.recorded_kept ?? 0),
      investmentsAdjusted: Number(data.investments_adjusted ?? 0),
      investmentsUnavailable: Number(data.investments_unavailable ?? 0),
    };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

export async function syncFinances(): Promise<SyncResult> {
  // Transactions + net worth first (they populate what the score reads), then
  // snapshot the Juniper Score for the trend/delta history.
  const [txn, snapshot] = await Promise.all([
    postSync("/api/plaid/transactions-sync"),
    postSync("/api/plaid/networth-snapshot"),
  ]);
  // Reconstruct the days before the first recorded snapshot. Fired on every
  // sync rather than only when rows were added, because Plaid answers
  // PRODUCT_NOT_READY on /investments/transactions for up to two minutes after a
  // link: gating this on new transactions would leave the one member who needs
  // it most, the one who just linked, with the invested part of their history
  // permanently unadjusted. Writes use ignore-duplicates, so a repeat run
  // rewrites nothing and a recorded day always beats a reconstructed one.
  void postOk("/api/plaid/networth-backfill");
  // Recurring detection runs off the transactions Plaid has already returned,
  // so it needs no extra product and no relink. Fire-and-forget alongside the
  // backfill: the subscriptions panel reads its own cache and simply shows
  // fewer rows until this lands, which is the right behaviour for a detector
  // that needs a few months of history before it can say anything at all.
  void postOk("/api/plaid/recurring-sync");
  // Merchant art for charges stored before that art existed. /transactions/sync
  // never revisits a stored row, so without this a member who synced before
  // #178 sees monograms until every one of their merchants happens to charge
  // them again. Safe to fire on every refresh: it asks the database what is
  // missing first and returns without calling Plaid when nothing is.
  void postOk("/api/plaid/merchant-art-backfill");
  const score = await postOk("/api/score/compute");
  const failures = [...txn.failures, ...snapshot.failures];
  const needsRelink = [
    ...new Set(failures.filter((f) => f.needs_relink && f.item_id).map((f) => f.item_id as string)),
  ];
  return {
    transactions: txn.ok,
    netWorth: snapshot.ok,
    score,
    added: txn.added,
    failedItems: new Set(failures.map((f) => f.item_id ?? "")).size,
    needsRelink,
  };
}

// Whether the server holds transaction rows for the caller yet. Reads the
// dashboard payload's explicit `hasTransactions` flag rather than inferring it
// from which sections came back, since api/finances.ts now sends balances
// without a feed.
export async function hasSyncedTransactions(): Promise<boolean> {
  try {
    const res = await authedFetch("/api/finances");
    if (!res.ok) return false;
    const data = (await res.json()) as { linked?: boolean; hasTransactions?: boolean };
    return !!data?.linked && !!data.hasTransactions;
  } catch {
    return false;
  }
}

// Run the pipeline, then keep retrying the transactions leg until rows actually
// land. The single syncFinances() fired at link time (Connections' onDone, the
// onboarding connect step) almost always beats Plaid's first transaction pull
// being ready, and nothing retried it, so a member's feed stayed empty until
// they happened to hit "Refresh data" days later.
//
// Bounded, backed off, and cancellable, the same shape as pollCashflowEstimate
// above: stops on the first success, gives up after `attempts`, and bails as
// soon as the caller's signal aborts. Callers don't await it, balances and the
// score already landed on the first pass, so nothing in the UI waits on this.
export async function syncFinancesUntilTransactions(opts?: {
  attempts?: number;
  intervalMs?: number;
  signal?: { aborted: boolean };
}): Promise<boolean> {
  const attempts = opts?.attempts ?? 5;
  const intervalMs = opts?.intervalMs ?? 2000;
  const aborted = () => !!opts?.signal?.aborted;

  // Pass one is the full pipeline: balances and the score should appear right
  // away, transactions are the one leg worth waiting on.
  const first = await syncFinances();
  if (first.added > 0) return true;
  if (await hasSyncedTransactions()) return true;

  for (let a = 1; a < attempts; a++) {
    if (aborted()) return false;
    // Backoff rather than a fixed interval: what we're waiting on is Plaid
    // preparing the first pull, which can take minutes. 2s, 4s, 8s, 16s.
    await new Promise((r) => setTimeout(r, intervalMs * 2 ** (a - 1)));
    if (aborted()) return false;
    // Only the transactions leg on a retry. Re-pulling balances from Plaid on
    // every attempt would multiply calls against the Item cap for nothing, and
    // the snapshot below covers the one case where they need re-reading.
    const again = await postSync("/api/plaid/transactions-sync");
    if (again.added > 0 || (await hasSyncedTransactions())) {
      // Rows arrived after pass one, so the trend point and the score were
      // computed without them. Redo those two legs off the fuller data.
      if (!aborted()) {
        await Promise.all([postOk("/api/plaid/networth-snapshot"), postOk("/api/score/compute")]);
      }
      return true;
    }
  }
  return false;
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

// Cheap 32-bit FNV-1a over a string, rendered as hex. Not a hash for security,
// only a short stable fingerprint for the cache-busting query param below.
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Real brand marks for the institutions the caller has linked. The server reads
// the id set from the caller's own plaid_items rows, so `institutionIds` is NOT
// what gets looked up: it is only used to skip the round trip when nothing is
// linked, and to vary the URL so the browser's cache key tracks the linked set.
//
// That second use is the point of the fingerprint. The response carries a long
// `private, max-age`, because a bank's logo is a static asset, but the payload is
// keyed to the member's connections. Without a varying URL, linking a new bank
// would be served the previous map from cache and the new row would sit on the
// monogram fallback for a week. The server ignores the param entirely, so this
// stays a cache key and never a way to ask for someone else's institutions. The
// ids are fingerprinted rather than sent in the clear so which banks a member
// holds does not end up in a query string.
//
// Returns {} on any failure, the same contract as the rest of this file: logos
// are decoration, so a member with a dead endpoint sees monograms, not an error.
//
// Costs roughly 10 to 20KB per institution, so call it once per page load
// alongside the item fetch, never per render.
export async function fetchInstitutionLogos(
  institutionIds: (string | null | undefined)[],
): Promise<InstitutionBrandMap> {
  const ids = [...new Set(institutionIds.filter((id): id is string => !!id))].sort();
  if (ids.length === 0) return {};
  try {
    const res = await authedFetch(`/api/plaid/institution-logos?set=${fingerprint(ids.join(","))}`);
    if (!res.ok) return {};
    const data = (await res.json()) as { logos?: InstitutionBrandMap };
    return data.logos && typeof data.logos === "object" ? data.logos : {};
  } catch {
    return {};
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
