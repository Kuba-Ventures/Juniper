// /api/merchant-rules, "always categorize this merchant as this category".
//
//   GET                             -> the member's rules, newest first
//   POST   { merchant, category }   -> make one, and apply it to what is already there
//   DELETE ?merchant=NAME           -> stop it applying to new charges
//
// `transactions.category_source` has carried a 'rule' value since migration
// 0008 and nothing ever wrote one. This writes it.
//
// PRECEDENCE IS user, THEN rule, THEN plaid, decided in _category-precedence.ts
// and applied on every sync. A rule is a statement about a merchant and a
// correction is a statement about one charge, so the more specific one wins: a
// member who rules "Amazon is Shopping" and then files a single Amazon charge
// under Groceries keeps that charge under Groceries through every future sync.
// The retroactive update below honours the same rule by skipping rows the
// member has corrected by hand.
//
// DELETING A RULE DOES NOT UNDO IT. It stops applying to new charges, and the
// rows it already set keep the category it gave them. Reverting them would mean
// restoring Plaid's original classification, and that is not kept: the stored
// `plaid_category` is Plaid's PRIMARY only, which is exactly the level that
// cannot tell a card payment from a car payment (see _categorize.ts). Inventing
// a category to revert to would be worse than leaving them alone, so the
// endpoint says what it does and does no more.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";
import { merchantKey } from "./_category-precedence";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const MAX_MERCHANT = 120;
const enc = encodeURIComponent;
const norm = (v: unknown) => String(v ?? "").trim();
// `%` and `_` are wildcards to LIKE and ILIKE. A merchant name carrying either
// would match rows it should not, so they are escaped before the value is used
// as a pattern. `\` is escaped first, or it would escape the escapes.
const likeLiteral = (v: string) => v.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);

async function list(uid: string): Promise<Response> {
  const r = await adminRest(
    `merchant_rules?user_id=eq.${uid}&select=merchant,merchant_key,category,category_id,created_at&order=created_at.desc`,
  );
  if (!r.ok) {
    console.error(`[rules] read failed (${r.status})`);
    return json({ error: "Could not read your rules" }, 500);
  }
  return json({ rules: await r.json() });
}

async function create(uid: string, body: Record<string, unknown>): Promise<Response> {
  const merchant = norm(body.merchant);
  const category = norm(body.category);
  if (!merchant || merchant.length > MAX_MERCHANT) return json({ error: "A merchant is required" }, 400);
  if (!merchantKey(merchant)) return json({ error: "A merchant is required" }, 400);

  // Validated against THIS member's taxonomy, the same as a re-categorization:
  // a rule pointing at a label they do not have would file every future charge
  // from that merchant into "Everything else" and look like the rule was
  // ignored rather than wrong.
  const tax = await taxonomyFor(uid);
  if (!tax.writableLabels.has(category)) return json({ error: "Unknown category" }, 400);
  const categoryId = tax.categoryIdOf(category);

  // Conflicts on `merchant_key`, a real column, not on an expression. 0028's
  // unique index was on `lower(btrim(merchant))`, and Postgres requires the ON
  // CONFLICT target to name an index over exactly those columns, so every
  // insert raised 42P10 and the member saw "Could not save that rule".
  // Migration 0029 moves the normalization into the column.
  const key = merchantKey(merchant)!;
  const saved = await adminRest("merchant_rules?on_conflict=user_id,merchant_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: uid, merchant, merchant_key: key, category, category_id: categoryId,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!saved.ok) {
    console.error(`[rules] create failed (${saved.status}): ${await saved.text().catch(() => "")}`);
    return json({ error: "Could not save that rule" }, 500);
  }

  // Applied to what is already there, not only to what arrives next. A rule
  // that only worked going forward would leave the member looking at the very
  // charges that made them write it.
  //
  // `category_source=neq.user` is the precedence rule expressed as a filter:
  // charges the member corrected by hand are theirs, and a rule about the
  // merchant does not get to overrule a statement about one charge.
  //
  // `ilike` for the case-insensitive match, with % and _ escaped first. Those
  // are wildcards to ilike, so a merchant like "PAYPAL *INST_XFER" would match
  // more than itself, and a rule that files somebody else's charges is worse
  // than one that misses.
  const applied = await adminRest(
    `transactions?user_id=eq.${uid}&merchant_name=ilike.${enc(likeLiteral(merchant))}&category_source=neq.user&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        category, category_id: categoryId, category_source: "rule", updated_at: new Date().toISOString(),
      }),
    },
  );
  // A rule that saved but could not be backfilled is still a rule, and it will
  // catch the next sync. Reported rather than failed, with the count null so
  // the caller can tell "none matched" from "we do not know".
  let changed: number | null = null;
  if (applied.ok) changed = ((await applied.json().catch(() => [])) as unknown[]).length;
  else console.error(`[rules] retroactive apply failed (${applied.status}) for ${uid}`);

  return json({ merchant, category, applied: changed }, 201);
}

async function remove(uid: string, url: URL): Promise<Response> {
  const merchant = norm(url.searchParams.get("merchant"));
  if (!merchant) return json({ error: "A merchant is required" }, 400);
  // By key, the same way the index and the sync see it: a member removing a
  // rule they made for "AMAZON" must not be told there is nothing to remove
  // because the row says "Amazon".
  const key = merchantKey(merchant);
  if (!key) return json({ error: "A merchant is required" }, 400);
  const r = await adminRest(
    `merchant_rules?user_id=eq.${uid}&merchant_key=eq.${enc(key)}`,
    { method: "DELETE" },
  );
  if (!r.ok) {
    console.error(`[rules] delete failed (${r.status})`);
    return json({ error: "Could not remove that rule" }, 500);
  }
  // Deliberately does NOT revert the charges it set. See the header note.
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

  if (req.method === "GET") return list(uid);
  if (req.method === "DELETE") return remove(uid, new URL(req.url));
  if (req.method === "POST") return create(uid, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return json({ error: "Method not allowed" }, 405);
}
