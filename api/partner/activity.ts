// /api/partner/activity, the shared chat/activity for the caller's partnership.
//   GET                                   -> { messages, reactions }
//   POST { action: "message", body, txnRef?, txnMerchant? }
//   POST { action: "react", target, emoji }   (toggles the caller's reaction)
// Server-only tables (0013); membership enforced via activePartnership.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { activePartnership } from "../_partnership";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

type MsgRow = { id: string; user_id: string; body: string; txn_ref: string | null; txn_merchant: string | null; created_at: string };
type ReactRow = { target: string; user_id: string; emoji: string };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ messages: [], reactions: [] });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const partnership = await activePartnership(uid);
  if (!partnership) return json({ connected: false, messages: [], reactions: [] });

  if (req.method === "GET") {
    const mRes = await adminRest(`shared_messages?partnership_id=eq.${partnership.id}&select=id,user_id,body,txn_ref,txn_merchant,created_at&order=created_at.asc&limit=100`);
    const rRes = await adminRest(`shared_reactions?partnership_id=eq.${partnership.id}&select=target,user_id,emoji`);
    if (!mRes.ok || !rRes.ok) return json({ error: "Failed to load activity" }, 500);
    const msgs = (await mRes.json()) as MsgRow[];
    const reacts = (await rRes.json()) as ReactRow[];
    const messages = msgs.map((m) => ({
      id: m.id, who: m.user_id === uid ? "you" : "partner",
      body: m.body, txnRef: m.txn_ref, txnMerchant: m.txn_merchant, createdAt: m.created_at,
    }));
    // Aggregate reactions by (target, emoji).
    const map = new Map<string, { target: string; emoji: string; count: number; byMe: boolean }>();
    for (const r of reacts) {
      const key = `${r.target}::${r.emoji}`;
      const cur = map.get(key) || { target: r.target, emoji: r.emoji, count: 0, byMe: false };
      cur.count++; if (r.user_id === uid) cur.byMe = true;
      map.set(key, cur);
    }
    return json({ connected: true, messages, reactions: [...map.values()] });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = (await req.json().catch(() => ({}))) as { action?: string; body?: string; txnRef?: string; txnMerchant?: string; target?: string; emoji?: string };

  if (body.action === "message") {
    const text = (body.body || "").trim().slice(0, 2000);
    if (!text) return json({ error: "body required" }, 400);
    const r = await adminRest("shared_messages", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ partnership_id: partnership.id, user_id: uid, body: text, txn_ref: body.txnRef || null, txn_merchant: body.txnMerchant || null }),
    });
    if (!r.ok) return json({ error: "Failed to send message" }, 500);
    return json({ ok: true, message: (await r.json().catch(() => []))[0] ?? null });
  }

  if (body.action === "react") {
    const target = (body.target || "").trim();
    const emoji = (body.emoji || "").trim();
    if (!target || !emoji) return json({ error: "target and emoji required" }, 400);
    // Toggle: delete if the caller already reacted with this emoji, else insert.
    const existing = await adminRest(`shared_reactions?partnership_id=eq.${partnership.id}&target=eq.${encodeURIComponent(target)}&user_id=eq.${uid}&emoji=eq.${encodeURIComponent(emoji)}&select=id`);
    const has = existing.ok && ((await existing.json()) as unknown[]).length > 0;
    if (has) {
      await adminRest(`shared_reactions?partnership_id=eq.${partnership.id}&target=eq.${encodeURIComponent(target)}&user_id=eq.${uid}&emoji=eq.${encodeURIComponent(emoji)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json({ ok: true, reacted: false });
    }
    const r = await adminRest("shared_reactions", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ partnership_id: partnership.id, target, user_id: uid, emoji }),
    });
    if (!r.ok) return json({ error: "Failed to react" }, 500);
    return json({ ok: true, reacted: true });
  }

  return json({ error: "Unknown action" }, 400);
}
