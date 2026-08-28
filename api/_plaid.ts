// Plaid REST helper. We call Plaid's HTTP API directly with fetch rather than
// the official `plaid` SDK, which depends on axios and does not run cleanly on
// the Vercel Edge runtime the other endpoints use.
import { readEnv } from "./_env";

const PLAID_BASE: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export function plaidEnv(): string {
  return (readEnv("PLAID_ENV") || "sandbox").toLowerCase();
}

export function plaidBaseUrl(): string {
  return PLAID_BASE[plaidEnv()] ?? PLAID_BASE.sandbox;
}

export function plaidConfigured(): boolean {
  return !!readEnv("PLAID_CLIENT_ID") && !!readEnv("PLAID_SECRET");
}

// Products requested at Link time. Default "transactions": it returns accounts +
// balances and powers the budgeting/net-worth features, and unlike "auth" it does
// not require the (unused) account/routing-number product. `auth` was the old
// default but Juniper never reads routing numbers, so requesting it only caused
// "account not enabled for auth" 400s. Override via env to add e.g.
// "transactions,liabilities,investments" later.
export function plaidProducts(): string[] {
  return (readEnv("PLAID_PRODUCTS") || "transactions")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function plaidCountryCodes(): string[] {
  return (readEnv("PLAID_COUNTRY_CODES") || "US")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type PlaidResult<T> = { ok: boolean; status: number; data: T };

// A Plaid call that never answers is worse than one that fails. On the edge
// runtime the function is killed if it has not returned an initial response
// within 25 seconds, so a single slow institution takes down every other leg of
// the refresh with it, and the caller cannot even report which connection did
// it. /accounts/balance/get is the call that does this: Plaid goes to the bank
// for a live balance rather than answering from its own store, so its latency is
// the bank's, not Plaid's.
//
// Every call therefore has a deadline. Callers that run over many items pass a
// budget of their own; the default is loose enough that a healthy call never
// reaches it.
export const PLAID_DEFAULT_TIMEOUT_MS = 15_000;

// Stands in for Plaid's own error_code when we stopped waiting, so a timeout
// travels through the same per-item failure path as a refusal. Deliberately not
// in DEAD_ITEM_CODES: a bank that was slow once is not a connection the member
// has to relink, and telling them to would be the false alarm _item-sync-state
// exists to prevent.
export const PLAID_TIMEOUT_CODE = "JUNIPER_REQUEST_TIMEOUT";
export const PLAID_UNREACHABLE_CODE = "JUNIPER_REQUEST_FAILED";

// POST to a Plaid endpoint with client_id/secret injected. Never log the body.
//
// A transport failure comes back as a result rather than a throw. Callers run
// this over a member's whole list of connections inside Promise.all, where one
// rejected promise would abandon the others mid-flight and turn one unreachable
// host into a failed refresh for every institution.
export async function plaidFetch<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<PlaidResult<T>> {
  const timeoutMs = Math.max(1, Math.round(opts?.timeoutMs ?? PLAID_DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${plaidBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: readEnv("PLAID_CLIENT_ID"),
        secret: readEnv("PLAID_SECRET"),
        ...body,
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const timedOut = controller.signal.aborted;
    // 504 and 502 for the two cases, matching what each would mean coming from
    // Plaid, so a caller that only reads `status` still reads it correctly.
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      data: {
        error_code: timedOut ? PLAID_TIMEOUT_CODE : PLAID_UNREACHABLE_CODE,
        error_message: timedOut
          ? `Plaid did not answer ${path} within ${timeoutMs}ms`
          : `Could not reach Plaid: ${err instanceof Error ? err.message : String(err)}`,
      } as T,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Shape we persist + return to the client. Deliberately excludes account/routing
// numbers and access tokens, only what's needed to display the connection.
export type SanitizedAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  // Credit limit, for showing card utilization. Display-only, and Plaid leaves
  // it null on plenty of accounts (anything that has no limit, plus cards where
  // the bank does not report one), so every consumer has to handle a missing
  // limit rather than dividing by it. Snapshots written before this field
  // existed also carry no limit until /accounts/balance/get runs over the item
  // again, which is what "Refresh data" on Connections triggers.
  limit: number | null;
  currency: string | null;
};

type PlaidAccount = {
  account_id: string;
  name?: string;
  official_name?: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  balances?: { available?: number | null; current?: number | null; limit?: number | null; iso_currency_code?: string | null };
};

export function sanitizeAccounts(accounts: PlaidAccount[]): SanitizedAccount[] {
  return (accounts ?? []).map((a) => ({
    account_id: a.account_id,
    name: a.official_name || a.name || "Account",
    mask: a.mask ?? null,
    type: a.type ?? null,
    subtype: a.subtype ?? null,
    balance: a.balances?.current ?? a.balances?.available ?? null,
    limit: a.balances?.limit ?? null,
    currency: a.balances?.iso_currency_code ?? null,
  }));
}
