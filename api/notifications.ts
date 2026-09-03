// /api/notifications, the bell's history (issue #266, storage layer).
//
//   GET                          -> the member's notifications, newest first
//   POST { active: Fact[] }      -> reconcile: what's true right now
//   PATCH { id }                 -> mark one read
//   DELETE ?id=UUID              -> clear one (durable, see below)
//
// WHO COMPUTES WHAT IS TRUE. The three kinds of fact (a connection needing
// reconnecting, a budget over its limit, a subscription charge that drifted)
// are already computed, once, by /api/finances and /api/subscriptions:
// src/lib/notifications.ts reads both on the app bar's own load and is the
// one place that decides what counts. Re-deriving that here from raw Plaid
// and budget rows would be a second definition free to disagree with the
// first, so this endpoint never computes a fact itself. POST just tells it
// which dedupe_keys are true RIGHT NOW; everything else (read state, cleared
// state, when something resolved) lives here because the client has nowhere
// durable to keep it.
//
// WHY dedupe_key DECIDES REACTIVATION. A key already marked 'cleared' is left
// alone even if the client sends it again, so a member who cleared "Groceries
// is over budget" does not see it come back on the next load just because
// groceries spending is still over the limit; only a NEW dedupe_key (a new
// month, a new failure timestamp, a new charge) notifies again. A key marked
// 'resolved' IS reactivated if it reappears, because that is the same
// instance becoming true again within its own period (spending crossed back
// over budget later in the same month), which is not something a member
// asked to be quiet about.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const KINDS = new Set(["reconnect", "budget", "drift"]);
const MAX_FACTS = 30;
const MAX_KEY = 160;
const MAX_TITLE = 200;
const MAX_DETAIL = 280;
const enc = encodeURIComponent;

type Fact = { kind: string; dedupeKey: string; title: string; detail: string; href: string };

function parseFacts(body: unknown): Fact[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { active?: unknown }).active)) return null;
  const raw = (body as { active: unknown[] }).active.slice(0, MAX_FACTS);
  const out: Fact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const kind = String(r.kind ?? "");
    const dedupeKey = String(r.dedupeKey ?? "").trim();
    const title = String(r.title ?? "").trim();
    const detail = String(r.detail ?? "").trim();
    // Every href this endpoint has ever been asked to store is a route inside
    // this app (src/lib/notifications.ts only ever builds one of three). An
    // absolute URL stored here would be a member's own notification pointing
    // somewhere off the app, so it is refused rather than trusted.
    const href = String(r.href ?? "");
    if (!KINDS.has(kind)) continue;
    if (!dedupeKey || dedupeKey.length > MAX_KEY) continue;
    if (!title || title.length > MAX_TITLE) continue;
    if (!detail || detail.length > MAX_DETAIL) continue;
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    out.push({ kind, dedupeKey, title, detail, href });
  }
  return out;
}

async function list(uid: string): Promise<Response> {
  const r = await adminRest(
    `notifications?user_id=eq.${uid}&status=neq.cleared` +
      `&select=id,kind,title,detail,href,status,created_at,resolved_at,read_at` +
      `&order=created_at.desc&limit=200`,
  );
  if (!r.ok) {
    console.error(`[notifications] read failed (${r.status})`);
    return json({ error: "Could not read your notifications" }, 500);
  }
  return json({ items: await r.json() });
}

async function reconcile(uid: string, body: unknown): Promise<Response> {
  const facts = parseFacts(body);
  if (!facts) return json({ error: "A list of active facts is required" }, 400);

  const incomingKeys = facts.map((f) => f.dedupeKey);
  const nowIso = new Date().toISOString();

  // Cleared is durable (see header): find which incoming keys this member has
  // already dismissed, so the upsert below skips exactly those and nothing
  // silently resurrects a notification they asked to stop seeing.
  let clearedKeys = new Set<string>();
  if (incomingKeys.length) {
    const inList = incomingKeys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",");
    const r = await adminRest(
      `notifications?user_id=eq.${uid}&status=eq.cleared&dedupe_key=in.(${inList})&select=dedupe_key`,
    );
    if (r.ok) clearedKeys = new Set(((await r.json()) as { dedupe_key: string }[]).map((row) => row.dedupe_key));
    else console.error(`[notifications] cleared lookup failed (${r.status})`);
  }

  const toUpsert = facts.filter((f) => !clearedKeys.has(f.dedupeKey));
  if (toUpsert.length) {
    const upserted = await adminRest("notifications?on_conflict=user_id,dedupe_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(
        toUpsert.map((f) => ({
          user_id: uid,
          kind: f.kind,
          dedupe_key: f.dedupeKey,
          title: f.title,
          detail: f.detail,
          href: f.href,
          status: "active",
          resolved_at: null,
          updated_at: nowIso,
        })),
      ),
    });
    if (!upserted.ok) {
      console.error(`[notifications] upsert failed (${upserted.status}): ${await upserted.text().catch(() => "")}`);
      return json({ error: "Could not save your notifications" }, 500);
    }
  }

  // Anything still marked active that was not sent this time has stopped
  // being true (the budget dropped back under, the connection reconnected,
  // the subscription's amount matched again): resolve it rather than leaving
  // a stale warning on screen.
  const notIn = incomingKeys.length
    ? `dedupe_key=not.in.(${incomingKeys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",")})`
    : "dedupe_key=not.is.null";
  const resolved = await adminRest(
    `notifications?user_id=eq.${uid}&status=eq.active&${notIn}`,
    { method: "PATCH", body: JSON.stringify({ status: "resolved", resolved_at: nowIso }) },
  );
  if (!resolved.ok) console.error(`[notifications] resolve-stale failed (${resolved.status})`);

  return list(uid);
}

async function markRead(uid: string, body: unknown): Promise<Response> {
  const id = String((body as { id?: unknown })?.id ?? "");
  if (!id) return json({ error: "An id is required" }, 400);
  const r = await adminRest(`notifications?user_id=eq.${uid}&id=eq.${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    console.error(`[notifications] mark-read failed (${r.status})`);
    return json({ error: "Could not update that notification" }, 500);
  }
  return json({ ok: true });
}

async function clear(uid: string, url: URL): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return json({ error: "An id is required" }, 400);
  // 'cleared', not DELETE: see the header note on why the row survives.
  const r = await adminRest(`notifications?user_id=eq.${uid}&id=eq.${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cleared" }),
  });
  if (!r.ok) {
    console.error(`[notifications] clear failed (${r.status})`);
    return json({ error: "Could not clear that notification" }, 500);
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

  if (req.method === "GET") return list(uid);
  if (req.method === "POST") return reconcile(uid, await req.json().catch(() => null));
  if (req.method === "PATCH") return markRead(uid, await req.json().catch(() => null));
  if (req.method === "DELETE") return clear(uid, new URL(req.url));
  return json({ error: "Method not allowed" }, 405);
}
