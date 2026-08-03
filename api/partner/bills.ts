// /api/partner/bills — shared bills for the caller's active partnership.
//   GET                       -> list bills
//   POST { name, amount, dueDay, payer: "you"|"partner"|"shared", split }
//   DELETE ?id=UUID
// Server-only table (0013); membership enforced via activePartnership.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { activePartnership, partnerIdOf } from "../_partnership";

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

type BillRow = { id: string; name: string; amount: number; due_day: number | null; payer_user_id: string | null; split: boolean };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ bills: [] });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const partnership = await activePartnership(uid);
  if (!partnership) return json({ connected: false, bills: [] });
  const partnerId = partnerIdOf(partnership, uid);

  if (req.method === "GET") {
    const r = await adminRest(`shared_bills?partnership_id=eq.${partnership.id}&select=id,name,amount,due_day,payer_user_id,split&order=due_day.asc`);
    if (!r.ok) return json({ error: "Failed to load bills" }, 500);
    const rows = (await r.json()) as BillRow[];
    // Map payer to a viewer-relative label the UI understands.
    const bills = rows.map((b) => ({
      id: b.id, name: b.name, amount: Number(b.amount), dueDay: b.due_day, split: b.split,
      payer: b.payer_user_id == null ? "shared" : b.payer_user_id === uid ? "you" : "partner",
    }));
    return json({ connected: true, bills });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { name?: string; amount?: number; dueDay?: number; payer?: string; split?: boolean };
    const name = (body.name || "").trim();
    const amount = Number(body.amount);
    if (!name || !Number.isFinite(amount) || amount < 0) return json({ error: "name and a non-negative amount are required" }, 400);
    const payer_user_id = body.payer === "you" ? uid : body.payer === "partner" ? partnerId : null;
    const r = await adminRest("shared_bills", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        partnership_id: partnership.id, name, amount,
        due_day: Number.isFinite(Number(body.dueDay)) ? Number(body.dueDay) : null,
        payer_user_id, split: payer_user_id == null ? true : !!body.split, created_by: uid,
      }),
    });
    if (!r.ok) return json({ error: "Failed to add bill" }, 500);
    return json({ ok: true, bill: (await r.json().catch(() => []))[0] ?? null });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    const r = await adminRest(`shared_bills?id=eq.${encodeURIComponent(id)}&partnership_id=eq.${partnership.id}`, {
      method: "DELETE", headers: { Prefer: "return=minimal" },
    });
    if (!r.ok) return json({ error: "Failed to delete bill" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
