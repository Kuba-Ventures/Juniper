// /api/manual-accounts, CRUD for the caller's manually-added accounts.
//   GET                                  -> list own manual accounts
//   POST { name, category, kind, balance, institution?, currency?, id?,
//          mask?, credit_limit? }
//                                        -> create, or update when `id` is given
//   DELETE ?id=UUID                      -> remove that account
// Tier 3 of account discovery: for institutions Plaid can't link (small/regional
// banks, some 401(k) providers) or anything the user prefers to enter by hand.
// Scoped by the JWT's user id; writes via the service-role key.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";

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
const enc = encodeURIComponent;

const CATEGORIES = ["banking", "investing", "credit", "loans", "cash", "other"] as const;
const KINDS = ["asset", "liability"] as const;
// Sensible default sign per category, used when the client doesn't specify.
const DEFAULT_KIND: Record<string, (typeof KINDS)[number]> = {
  banking: "asset",
  investing: "asset",
  cash: "asset",
  credit: "liability",
  loans: "liability",
  other: "asset",
};

const SELECT_COLS = "id,name,institution,category,kind,balance,currency,created_at";
// Migration 0046. Requested as optional, because PostgREST rejects the WHOLE
// select on one unknown column and returning nothing would empty the member's
// manual-account list for the length of a deploy that ran ahead of the
// migration. Same ladder shape as `readCatalog` in api/card-rewards.ts.
const SELECT_COLS_0046 = `${SELECT_COLS},mask,credit_limit`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") {
    const scope = `manual_accounts?user_id=eq.${uid}`;
    const order = "&order=created_at.asc";
    let r = await adminRest(`${scope}&select=${SELECT_COLS_0046}${order}`);
    if (!r.ok) {
      r = await adminRest(`${scope}&select=${SELECT_COLS}${order}`);
      if (r.ok) console.warn("[manual] mask and credit_limit unavailable, is migration 0046 applied?");
    }
    if (!r.ok) return json({ error: "Failed to read accounts" }, 500);
    return json(await r.json());
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      institution?: string;
      category?: string;
      kind?: string;
      balance?: number | string | null;
      currency?: string;
      mask?: string | null;
      credit_limit?: number | string | null;
    };

    const name = (body.name || "").trim();
    if (!name) return json({ error: "name is required" }, 400);

    const category = CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])
      ? (body.category as string)
      : "banking";
    const kind = KINDS.includes(body.kind as (typeof KINDS)[number])
      ? (body.kind as string)
      : DEFAULT_KIND[category];

    let balance: number | null = null;
    if (body.balance != null && body.balance !== "") {
      const n = Number(body.balance);
      if (!Number.isFinite(n)) return json({ error: "balance must be a number" }, 400);
      balance = Math.abs(n); // sign is carried by `kind`, store magnitude
    }

    // Last four digits, so a hand-entered card is identifiable beside a linked
    // one. Digits only, and at most four: a member who pastes the whole number
    // should not have it stored, and a mask is not a place for anything else.
    let mask: string | null = null;
    if (body.mask != null && String(body.mask).trim() !== "") {
      const digits = String(body.mask).replace(/\D/g, "");
      if (!digits) return json({ error: "mask must be digits" }, 400);
      mask = digits.slice(-4);
    }

    // ── The credit limit (migration 0046) ─────────────────────────────────
    //
    // The one field that makes utilization come out right for a card Plaid can
    // never reach: an authorized-user card on somebody else's login is invisible
    // to every credential the member holds, and a missing limit makes the
    // utilization denominator too small and the percentage too high.
    //
    // REJECTED, not silently dropped, on a non-credit category. 0046's CHECK
    // would refuse the write anyway and the member would see a 500 with nothing
    // to act on; and dropping it quietly is worse than either, because they would
    // have typed a number, been told it saved, and seen no effect.
    let creditLimit: number | null = null;
    if (body.credit_limit != null && body.credit_limit !== "") {
      if (category !== "credit") {
        return json({ error: "credit_limit is only valid on a credit account" }, 400);
      }
      const n = Number(body.credit_limit);
      if (!Number.isFinite(n)) return json({ error: "credit_limit must be a number" }, 400);
      // Zero would make the utilization division an infinity and a negative limit
      // is not a limit. Refused rather than clamped: a member who typed 0 meant
      // something, and guessing what is not this endpoint's job.
      if (n <= 0) return json({ error: "credit_limit must be greater than zero" }, 400);
      creditLimit = n;
    }

    const row = {
      user_id: uid,
      name,
      institution: (body.institution || "").trim() || null,
      category,
      kind,
      balance,
      currency: (body.currency || "USD").trim() || "USD",
      updated_at: new Date().toISOString(),
    };

    // The 0046 columns travel in their own object, so a write can be retried
    // WITHOUT them. The house rule deploys ahead of the migration, so there is a
    // window in which this code is live and the columns do not exist, and
    // PostgREST rejects the whole write on one unknown column: naming them
    // unconditionally would mean nobody could add a manual account at all for the
    // length of that window. That is a strictly worse failure than an absent
    // field, and it would hit the plain "Carter Bank checking" case that has
    // nothing to do with credit limits.
    //
    // `credit_limit` is sent on EVERY write rather than only when supplied,
    // including a category change away from credit, so switching a card to Banking
    // clears the limit instead of leaving 0046's CHECK to refuse the update.
    const row0046 = { ...row, mask, credit_limit: creditLimit };
    // Whether the member is actually relying on those columns this time. If they
    // are, a fallback would store the account and quietly lose the number they
    // typed, so the honest answer is to say the field is not available yet.
    const needs0046 = mask != null || creditLimit != null;

    const target = body.id
      ? `manual_accounts?id=eq.${enc(body.id)}&user_id=eq.${uid}`
      : "manual_accounts";
    const method = body.id ? "PATCH" : "POST";
    const write = (payload: unknown) => adminRest(target, {
      method,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    let r = await write(row0046);
    if (!r.ok) {
      if (needs0046) {
        console.error("[manual] write with mask/credit_limit failed, is migration 0046 applied?");
        return json({ error: "Could not save the limit for this card yet. Try again shortly." }, 503);
      }
      const retry = await write(row);
      if (retry.ok) console.warn("[manual] mask and credit_limit unavailable, is migration 0046 applied?");
      r = retry;
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ error: body.id ? "Failed to update account" : "Failed to save account", detail }, 500);
    }
    const rows = (await r.json().catch(() => [])) as unknown[];
    // A PATCH matching nothing is a 200 with an empty body, which means the id was
    // not the caller's. An INSERT always returns its row, so the fallback below
    // only ever fires on a representation the REST layer declined to send back.
    if (body.id && !rows.length) return json({ error: "Account not found" }, 404);
    return json(rows[0] ?? row0046);
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json({ error: "id is required" }, 400);
    const r = await adminRest(`manual_accounts?id=eq.${enc(id)}&user_id=eq.${uid}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!r.ok) return json({ error: "Failed to delete account" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
