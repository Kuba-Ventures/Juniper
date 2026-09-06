// /api/admin/cancellation-requests, the subscription-cancellation queue
// (issue #285). No partner API exists to cancel a merchant subscription
// through, so this is a human-processed queue, same shape as the merchant
// self-listing moderation queue (api/admin/submissions.ts): a member requests,
// an admin (ADMIN_EMAILS) works it by hand outside the app (by phone, by the
// merchant's own site) and reports back here.
//   GET ?status=requested|all         -> list requests (default: requested)
//   POST { id, action: "contacted"|"confirmed"|"failed", admin_notes? }
//        confirmed -> also dismisses the underlying recurring_overrides row,
//                     so the stream drops out of the confirmed total the same
//                     way any dismissed stream would
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

type Request_ = {
  id: string; user_id: string; stream_id: string; stream_name: string;
  monthly_at_request: number | null; member_note: string | null; status: string;
};

const ACTIONS = new Set(["contacted", "confirmed", "failed"]);

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
    const status = new URL(req.url).searchParams.get("status") || "requested";
    const filter = status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`;
    const r = await adminRest(
      `cancellation_requests?select=id,stream_id,stream_name,monthly_at_request,member_note,status,requested_at,resolved_at,admin_notes${filter}&order=requested_at.desc&limit=200`,
    );
    if (!r.ok) return json({ error: "Failed to load requests" }, 500);
    return json({ requests: await r.json() });
  }

  // ── process ─────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string; admin_notes?: string };
    const id = (body.id || "").trim();
    const action = body.action || "";
    const adminNotes = (body.admin_notes || "").trim().slice(0, 1000) || null;
    if (!id || !ACTIONS.has(action)) {
      return json({ error: "id and action ('contacted'|'confirmed'|'failed') are required" }, 400);
    }

    const got = await adminRest(`cancellation_requests?id=eq.${id}&select=id,user_id,stream_id,stream_name,monthly_at_request,member_note,status`);
    if (!got.ok) return json({ error: "Failed to read request" }, 500);
    const reqRow = ((await got.json()) as Request_[])[0];
    if (!reqRow) return json({ error: "Request not found" }, 404);
    if (reqRow.status !== "requested" && reqRow.status !== "contacted") {
      return json({ error: `Already ${reqRow.status}` }, 409);
    }

    if (action === "confirmed") {
      // Same table, same shape api/subscriptions.ts writes on a member's own
      // "Not recurring" action: dismissing is what stops a stream counting
      // toward the confirmed total, and reusing that path rather than
      // inventing a new state transition means there is exactly one way a
      // stream stops being billed-for in this app's own numbers.
      const dismiss = await adminRest("recurring_overrides?on_conflict=user_id,stream_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{
          user_id: reqRow.user_id,
          stream_id: reqRow.stream_id,
          state: "dismissed",
          updated_at: new Date().toISOString(),
        }]),
      });
      if (!dismiss.ok) {
        const detail = await dismiss.text().catch(() => "");
        console.error(`[admin/cancellation-requests] dismiss failed (${dismiss.status}): ${detail}`);
        return json({ error: "Failed to update the subscription" }, 500);
      }
    }

    // Terminal states resolve the request; "contacted" is a status update on
    // an OPEN request, so it does not stamp resolved_at.
    const resolving = action === "confirmed" || action === "failed";
    const upd = await adminRest(`cancellation_requests?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: action,
        admin_notes: adminNotes,
        resolved_at: resolving ? new Date().toISOString() : null,
        resolved_by: resolving ? payload.email : null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upd.ok) return json({ error: "Failed to update the request" }, 500);
    return json({ ok: true, id, status: action });
  }

  return json({ error: "Method not allowed" }, 405);
}
