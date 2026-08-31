// /api/member-cards, "this linked account is that card".
//
//   POST   { plaid_account_id, product_id }    -> record which product it is
//   PATCH  { plaid_account_id, credit_limit }   -> record a limit the bank does not report (#211)
//   DELETE ?account=<plaid_account_id>         -> forget the product answer
//
// Reads live on /api/card-rewards, which returns both facts alongside everything
// computed from them. This file only writes.
//
// ── EVERY WRITE HERE PATCHES, AND NEVER UPSERTS WITH merge-duplicates ───────
//
// This file used a `resolution=merge-duplicates` upsert while `member_cards` held
// one mutable fact. That upsert REPLACES the row rather than patching it, which
// the categories PATCH and the recurring override upsert both document as a trap,
// and #211 added a second, independent fact to the same row. Sending a product
// answer would then have wiped a credit limit, and setting a limit would have
// wiped the product answer, both silently.
//
// Restating every column on every write is the other fix and it is the fragile
// one: it is correct only until somebody adds a third column and forgets. PATCH
// touches what it names and leaves the rest alone, so it stays correct by
// construction. `patchOrInsert` below is the whole pattern.
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
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
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

  // `product_answered: true` is the point of this write as much as `product_id`
  // is, because product_id NULL is a real answer and only that flag separates it
  // from never having been asked. See the header of migration 0033.
  const saved = await patchOrInsert(uid, accountId, {
    product_id: productId,
    product_answered: true,
    confirmed_at: new Date().toISOString(),
  }, "confirm");
  if (!saved.ok) return json({ error: "Could not save that" }, 500);
  return json({ ok: true, card: saved.row });
}

/**
 * Set or clear a credit limit the member supplies for one card (#211).
 *
 * A limit reaches this endpoint only for a card whose issuer does not report one
 * through Plaid, which is why it is a member-supplied fact at all. It is stored
 * with its own timestamp, drawn with a "You set this" badge, and NEVER read by
 * api/_finance-snapshot.ts, so it cannot move the Juniper Score.
 *
 * `credit_limit: null` clears it, which is the honest inverse: the member is
 * saying they no longer stand behind the number, and the card goes back to being
 * excluded from utilization rather than keeping a figure nobody vouches for.
 */
async function setLimit(uid: string, body: Record<string, unknown>): Promise<Response> {
  const accountId = norm(body.plaid_account_id);
  if (!accountId || accountId.length > MAX_ID) return json({ error: "An account is required" }, 400);

  const raw = body.credit_limit;
  const clearing = raw == null || norm(raw) === "";
  let limit: number | null = null;
  if (!clearing) {
    // Arrives from a text field, so commas and a currency symbol are expected
    // rather than an error: "$8,000" is what somebody reads off a statement.
    const cleaned = norm(raw).replace(/[$,\s]/g, "");
    limit = Number(cleaned);
    if (!Number.isFinite(limit) || limit <= 0) {
      return json({ error: "Enter the limit as a number, for example 8000" }, 400);
    }
    // A ceiling, not a guess at what is plausible. It exists so a mistyped
    // "80000000" is refused at the door rather than stored and then rendered as a
    // 0% utilization that looks like a bug in the money.
    if (limit > 10_000_000) return json({ error: "That limit looks too large" }, 400);
    // Rounded to cents. Postgres would accept more, and a limit is never
    // fractional in practice, but an unrounded float from a text field has no
    // business becoming a denominator.
    limit = Math.round(limit * 100) / 100;
  }

  if (!(await ownsCreditAccount(uid, accountId))) {
    return json({ error: "That is not one of your credit cards" }, 400);
  }

  // `product_answered: false` on INSERT only, which is what patchOrInsert's
  // `insertOnly` is for: creating a row to hold a limit must not claim the
  // member has answered which product the card is, and must not overwrite that
  // answer if they already gave one.
  const saved = await patchOrInsert(uid, accountId, {
    credit_limit: limit,
    credit_limit_set_at: limit == null ? null : new Date().toISOString(),
  }, "set limit", { product_answered: false });
  if (!saved.ok) return json({ error: "Could not save that" }, 500);
  return json({ ok: true, card: saved.row });
}

/**
 * Update the named columns on the member's row for this account, creating the
 * row if there is not one yet.
 *
 * PATCH first, because it touches only what it names: `member_cards` now holds
 * two independent facts (which product the card is, and a limit the member
 * supplied) and a write of one must not disturb the other. A
 * `merge-duplicates` upsert replaces the whole row and would.
 *
 * `insertOnly` carries columns that belong on a newly created row and must not be
 * applied to an existing one, which is exactly the shape `product_answered`
 * needs: FALSE when a limit creates the row, untouched when the row is already
 * there because the member answered.
 */
async function patchOrInsert(
  uid: string,
  accountId: string,
  fields: Record<string, unknown>,
  what: string,
  insertOnly: Record<string, unknown> = {},
): Promise<{ ok: boolean; row: unknown }> {
  const patched = await adminRest(
    `member_cards?user_id=eq.${uid}&plaid_account_id=eq.${enc(accountId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
    },
  );
  if (!patched.ok) {
    console.error(`[cards] ${what} patch failed (${patched.status}) ${await patched.text().catch(() => "")}`);
    return { ok: false, row: null };
  }
  const rows = (await patched.json().catch(() => [])) as unknown[];
  if (rows.length) return { ok: true, row: rows[0] };

  // No row yet. Not a race worth locking against: the unique index on
  // (user_id, plaid_account_id) is the authority, and the only way to lose here
  // is the member submitting twice in the same instant, where the second insert
  // conflicts and is reported as a plain failure they can retry.
  const inserted = await adminRest("member_cards", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ user_id: uid, plaid_account_id: accountId, ...insertOnly, ...fields }),
  });
  if (!inserted.ok) {
    console.error(`[cards] ${what} insert failed (${inserted.status}) ${await inserted.text().catch(() => "")}`);
    return { ok: false, row: null };
  }
  const made = (await inserted.json().catch(() => [])) as unknown[];
  return { ok: true, row: made[0] ?? null };
}

async function forget(uid: string, url: URL): Promise<Response> {
  const accountId = norm(url.searchParams.get("account"));
  if (!accountId) return json({ error: "An account is required" }, 400);
  // No ownership pre-check needed and none done: the filter is on the caller's
  // own user_id, so a wrong account id deletes nothing rather than somebody
  // else's row. Reports ok either way, because "there was nothing to forget" and
  // "it is forgotten" are the same outcome from the member's side.
  //
  // DELETING THE ROW WOULD ALSO DROP A CREDIT LIMIT the member set (#211), and
  // "Change which card this is" must not silently discard an unrelated number
  // they typed. So the row is deleted only when it holds nothing else, and
  // otherwise the product answer alone is cleared. `product_answered: false` is
  // what puts the card back in the Identify queue, which is the whole point of
  // this endpoint.
  const held = await adminRest(
    `member_cards?user_id=eq.${uid}&plaid_account_id=eq.${enc(accountId)}&select=credit_limit`,
  );
  const rows = held.ok ? ((await held.json().catch(() => [])) as { credit_limit: number | null }[]) : [];
  if (rows.length && rows[0].credit_limit != null) {
    const cleared = await patchOrInsert(uid, accountId, {
      product_id: null, product_answered: false,
    }, "forget product");
    if (!cleared.ok) return json({ error: "Could not undo that" }, 500);
    return json({ ok: true, kept: "credit_limit" });
  }
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
  if (req.method === "PATCH") {
    return setLimit(uid, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  }
  if (req.method === "DELETE") return forget(uid, new URL(req.url));
  return json({ error: "Method not allowed" }, 405);
}
