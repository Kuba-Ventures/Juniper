// /api/member-cards, "this linked account is that card".
//
//   POST   { plaid_account_id, product_id }  -> record the member's answer
//   DELETE ?account=<plaid_account_id>       -> forget it, so they are asked again
//
// Reads live on /api/card-rewards, which returns the confirmations alongside
// everything computed from them. This file only writes.
//
// ── THE MEMBER ANSWERS THIS AND NOTHING INFERS IT ──────────────────────────
//
// Plaid returns an institution and an account name, and the account name is
// routinely "CREDIT CARD" or "Card ending 4021". Neither identifies a product.
// api/_rewards.ts `rankCandidates` orders the picker and there is deliberately no
// threshold anywhere, in this file or any other, that promotes a guess into a
// stored row. Attaching the wrong card's reward rates to somebody's real
// spending produces confident, specific, wrong dollar advice, which is the exact
// failure this whole surface exists to avoid, and it would be invisible: the
// numbers would look completely normal.
//
// `product_id: null` IS A REAL ANSWER, meaning "my card is not in your catalog".
// It is stored as a row, and that matters: the absence of a row means "not asked
// yet", so without the distinction the picker would nag forever at a member
// holding a card Juniper has never heard of. DELETE is how they undo an answer,
// which is a different act from giving a negative one.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const enc = encodeURIComponent;
const norm = (v: unknown) => String(v ?? "").trim();
const MAX_ID = 120;

/**
 * Whether this account is one of the CALLER's OWN credit accounts.
 *
 * The account id arrives in a request body, so it is not trusted. Without this
 * check a member could write a confirmation against any account id they could
 * guess, and while the row would be scoped to their own user_id and therefore
 * harmless to anybody else, it would be junk in their own list that no picker
 * could ever clear, because no account of theirs matches it.
 *
 * Credit-only for the same reason the read endpoint filters on it: a savings
 * account has no rewards, and letting one be confirmed as a credit card would
 * put a card face on a deposit account.
 */
async function ownsCreditAccount(uid: string, accountId: string): Promise<boolean> {
  const r = await adminRest(`plaid_items?user_id=eq.${uid}&select=accounts`);
  if (!r.ok) {
    console.error(`[cards] could not verify account ownership (${r.status})`);
    return false;
  }
  const items = (await r.json().catch(() => [])) as { accounts: { account_id: string; type: string | null }[] | null }[];
  return items.some((it) =>
    (it.accounts ?? []).some((a) => a.account_id === accountId && (a.type ?? "").toLowerCase() === "credit"));
}

async function confirm(uid: string, body: Record<string, unknown>): Promise<Response> {
  const accountId = norm(body.plaid_account_id);
  if (!accountId || accountId.length > MAX_ID) return json({ error: "An account is required" }, 400);

  // Absent, null and "" all mean "not in the catalog". An empty string arrives
  // from a form field more readily than a literal null does, so all three land
  // on the same answer rather than one of them becoming a 400 nobody expects.
  const raw = body.product_id;
  const productId = raw == null || norm(raw) === "" ? null : norm(raw);
  if (productId && productId.length > MAX_ID) return json({ error: "Unknown card" }, 400);

  if (!(await ownsCreditAccount(uid, accountId))) {
    return json({ error: "That is not one of your credit cards" }, 400);
  }

  // Validated against the catalog rather than trusted, so a stale client cannot
  // store a pointer to a product that has been retired. The FK would refuse it
  // anyway, as a 409 the member would read as "something went wrong"; this makes
  // it a clear 400 and keeps the reason in one place.
  if (productId) {
    const r = await adminRest(`card_products?id=eq.${enc(productId)}&status=eq.active&select=id`);
    const found = r.ok ? ((await r.json().catch(() => [])) as unknown[]) : [];
    if (!found.length) return json({ error: "That card is not in the catalog" }, 400);
  }

  // merge-duplicates REPLACES the row rather than patching it, the same trap the
  // categories PATCH and the recurring override upsert both document, so every
  // mutable column has to be sent. There are two here and both are: a
  // re-confirmation is a fresh answer and `confirmed_at` should move with it.
  const r = await adminRest(
    "member_cards?on_conflict=user_id,plaid_account_id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: uid, plaid_account_id: accountId, product_id: productId,
        confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!r.ok) {
    console.error(`[cards] confirm failed (${r.status}) ${await r.text().catch(() => "")}`);
    return json({ error: "Could not save that" }, 500);
  }
  const saved = (await r.json().catch(() => [])) as unknown[];
  return json({ ok: true, card: saved[0] ?? null });
}

async function forget(uid: string, url: URL): Promise<Response> {
  const accountId = norm(url.searchParams.get("account"));
  if (!accountId) return json({ error: "An account is required" }, 400);
  // No ownership pre-check needed and none done: the filter is on the caller's
  // own user_id, so a wrong account id deletes nothing rather than somebody
  // else's row. Reports ok either way, because "there was nothing to forget" and
  // "it is forgotten" are the same outcome from the member's side.
  const r = await adminRest(
    `member_cards?user_id=eq.${uid}&plaid_account_id=eq.${enc(accountId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!r.ok) {
    console.error(`[cards] forget failed (${r.status})`);
    return json({ error: "Could not undo that" }, 500);
  }
  return json({ ok: true });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "POST") {
    return confirm(uid, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  }
  if (req.method === "DELETE") return forget(uid, new URL(req.url));
  return json({ error: "Method not allowed" }, 405);
}
