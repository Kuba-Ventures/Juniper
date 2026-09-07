// POST /api/plaid/layer-exchange
// Body: { public_token }
// Turns a completed Plaid Layer session into stored plaid_items rows, one per
// account the member chose to share.
//
// This is NOT the standard single-item exchange (api/plaid/exchange.ts). A
// Layer session's public_token is never sent to /item/public_token/exchange;
// it goes to /user_account/session/get instead, which hands back the identity
// data the member confirmed AND an `items` array of { item_id, access_token }
// pairs already exchanged server-side by Plaid, one per institution the
// member had previously connected somewhere in the Plaid Network and chose to
// share here. There is nothing to exchange per item, only to store: this is
// exactly the "recognizes accounts you've already connected" moment Layer
// exists for, and it can return several institutions from ONE onSuccess call,
// unlike an ordinary Link session which is always one institution per token.
//
// The identity fields /user_account/session/get also returns (name, address,
// DOB, SSN) are for KYC prefill and deliberately unused here: Juniper has no
// KYC step Layer would be filling in for, and Plaid's own docs say to treat
// them as unverified, member-editable data rather than a fact.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch, plaidCountryCodes, sanitizeAccounts, type SanitizedAccount } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { mapPool } from "../_pool";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

type SessionItem = { item_id?: string; access_token?: string };
type SessionGetResp = {
  items?: SessionItem[];
  error_message?: string;
  error_code?: string;
};
type AccountsGetResp = {
  accounts?: Parameters<typeof sanitizeAccounts>[0];
  item?: { institution_id?: string | null };
  error_message?: string;
  error_code?: string;
};
type InstitutionByIdResp = { institution?: { name?: string } };

// Six at a time, matching the concurrency ceiling every other multi-item Plaid
// loop in this app uses (networth-snapshot.ts, recurring-sync.ts).
const CONCURRENCY = 6;

export type LayerImportedItem = { item_id: string; institution_name: string | null; accounts: SanitizedAccount[] };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);
  if (!plaidConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const body = (await req.json().catch(() => ({}))) as { public_token?: string };
  if (!body.public_token) return json({ error: "Missing public_token" }, 400);

  // 1) The Layer-specific handoff: this public_token names a SESSION, not one
  // institution, so /user_account/session/get is the only endpoint that can
  // read it. Plaid has already done the per-item exchange on its side.
  const session = await plaidFetch<SessionGetResp>("/user_account/session/get", { public_token: body.public_token });
  if (!session.ok) {
    return json({ error: session.data.error_message || "Could not read the Layer session" }, session.status || 502);
  }
  const sessionItems = (session.data.items ?? []).filter(
    (it): it is Required<SessionItem> => !!it.item_id && !!it.access_token,
  );
  if (!sessionItems.length) {
    // A real, honest outcome, not a failure: the member may have shared no
    // accounts, or shared identity data only.
    return json({ items: [] as LayerImportedItem[] });
  }

  // 2) Per item: pull its accounts (and the institution_id riding along on the
  // /accounts/get response) so it can be stored and shown the same way every
  // other linked item is.
  const withAccounts = await mapPool(sessionItems, CONCURRENCY, async (it) => {
    const acc = await plaidFetch<AccountsGetResp>("/accounts/get", { access_token: it.access_token });
    return {
      item_id: it.item_id,
      access_token: it.access_token,
      institution_id: acc.ok ? (acc.data.item?.institution_id ?? null) : null,
      accounts: acc.ok ? sanitizeAccounts(acc.data.accounts ?? []) : [],
    };
  });

  // 3) Resolve institution_id -> name, deduplicated: several returned items
  // can share one institution (a checking and a savings account at the same
  // bank), and each would otherwise cost its own identical Plaid call.
  const uniqueInstitutionIds = [...new Set(withAccounts.map((w) => w.institution_id).filter((id): id is string => !!id))];
  const nameById = new Map<string, string | null>();
  await Promise.all(
    uniqueInstitutionIds.map(async (institution_id) => {
      const r = await plaidFetch<InstitutionByIdResp>("/institutions/get_by_id", {
        institution_id,
        country_codes: plaidCountryCodes(),
      });
      nameById.set(institution_id, r.ok ? (r.data.institution?.name ?? null) : null);
    }),
  );

  // 4) Persist, same shape and same on_conflict as the standard exchange, so
  // a Layer-imported item is indistinguishable in storage from one linked the
  // ordinary way.
  const now = new Date().toISOString();
  const rows = withAccounts.map((w) => ({
    user_id: uid,
    item_id: w.item_id,
    access_token: w.access_token,
    institution_id: w.institution_id,
    institution_name: w.institution_id ? (nameById.get(w.institution_id) ?? null) : null,
    accounts: w.accounts,
    updated_at: now,
  }));
  const upsert = await adminRest("plaid_items?on_conflict=item_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!upsert.ok) {
    const detail = await upsert.text().catch(() => "");
    return json({ error: "Failed to store items", detail }, 500);
  }

  // 5) Return only the sanitized snapshots, one per imported item, never an
  // access_token.
  const items: LayerImportedItem[] = rows.map((r) => ({
    item_id: r.item_id,
    institution_name: r.institution_name,
    accounts: r.accounts,
  }));
  return json({ items });
}
