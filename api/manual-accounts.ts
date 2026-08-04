// /api/manual-accounts, CRUD for the caller's manually-added accounts.
//   GET                                  -> list own manual accounts
//   POST { name, category, kind, balance, institution?, currency?, id? }
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") {
    const r = await adminRest(`manual_accounts?user_id=eq.${uid}&select=${SELECT_COLS}&order=created_at.asc`);
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

    // Update in place when an id is supplied (and owned by the caller); else insert.
    if (body.id) {
      const r = await adminRest(
        `manual_accounts?id=eq.${enc(body.id)}&user_id=eq.${uid}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(row),
        },
      );
      if (!r.ok) return json({ error: "Failed to update account", detail: await r.text().catch(() => "") }, 500);
      const rows = (await r.json().catch(() => [])) as unknown[];
      if (!rows.length) return json({ error: "Account not found" }, 404);
      return json(rows[0]);
    }

    const r = await adminRest("manual_accounts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) return json({ error: "Failed to save account", detail: await r.text().catch(() => "") }, 500);
    const rows = (await r.json().catch(() => [])) as unknown[];
    return json(rows[0] ?? row);
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
