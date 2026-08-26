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

// POST to a Plaid endpoint with client_id/secret injected. Never log the body.
export async function plaidFetch<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<PlaidResult<T>> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: readEnv("PLAID_CLIENT_ID"),
      secret: readEnv("PLAID_SECRET"),
      ...body,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
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
