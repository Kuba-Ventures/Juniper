// /api/admin/submissions, the merchant self-listing moderation queue (Stage 5).
//   GET                                   -> list submissions (default: pending)
//   POST { id, action: "approve"|"reject", notes? }
//        approve -> upsert the offer into `partners` (active) + mark approved
//        reject  -> mark rejected
// Admin-only (ADMIN_EMAILS allowlist). Reads/writes with the service-role key,
// which bypasses RLS, fine here because access is gated on admin identity.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isAdminEmail } from "../_admin";

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

type Submission = {
  id: string; name: string; category: string; url: string;
  contact_email: string; description: string | null; status: string;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  if (!isAdminEmail(payload.email)) return json({ error: "Forbidden" }, 403);

  // ── list ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const status = new URL(req.url).searchParams.get("status") || "pending";
    const filter = status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`;
    const r = await adminRest(
      `partner_submissions?select=id,name,category,url,contact_email,description,status,created_at,reviewed_at${filter}&order=created_at.desc&limit=200`,
    );
    if (!r.ok) return json({ error: "Failed to load submissions" }, 500);
    return json({ submissions: await r.json() });
  }

  // ── moderate ────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string; notes?: string };
    const id = (body.id || "").trim();
    const action = body.action;
    const notes = (body.notes || "").trim().slice(0, 1000) || null;
    if (!id || (action !== "approve" && action !== "reject")) {
      return json({ error: "id and action ('approve'|'reject') are required" }, 400);
    }

    // Load the target submission (and guard against re-moderating).
    const got = await adminRest(`partner_submissions?id=eq.${id}&select=id,name,category,url,contact_email,description,status`);
    if (!got.ok) return json({ error: "Failed to read submission" }, 500);
    const sub = ((await got.json()) as Submission[])[0];
    if (!sub) return json({ error: "Submission not found" }, 404);
    if (sub.status !== "pending") return json({ error: `Already ${sub.status}` }, 409);

    if (action === "approve") {
      // Promote into the catalog. Upsert on name so a re-submission updates rather
      // than duplicating (partners has a unique name index from 0011).
      const ins = await adminRest("partners?on_conflict=name", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          name: sub.name,
          category: sub.category,
          url: sub.url,
          blurb: sub.description,
          source: "self-listed",
          status: "active",
        }),
      });
      if (!ins.ok) return json({ error: "Failed to publish offer", detail: await ins.text().catch(() => "") }, 500);
    }

    const upd = await adminRest(`partner_submissions?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: action === "approve" ? "approved" : "rejected", notes, reviewed_at: new Date().toISOString() }),
    });
    if (!upd.ok) return json({ error: "Failed to update submission" }, 500);
    return json({ ok: true, id, status: action === "approve" ? "approved" : "rejected" });
  }

  return json({ error: "Method not allowed" }, 405);
}
