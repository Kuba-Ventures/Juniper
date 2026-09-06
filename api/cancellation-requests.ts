// /api/cancellation-requests
//   GET                              -> the caller's own requests
//   POST { stream_id, member_note? } -> queue a cancellation request
//
// There is no partner API to cancel a subscription through, and there is no
// concierge staff either: Finley processes these by hand today (a future
// concierge hire would use the same queue), through
// api/admin/cancellation-requests.ts. This endpoint only ever creates a
// 'requested' row and reads the caller's own; it never changes a request's
// status, which is exactly the boundary between "the member asked" and
// "someone acted on it".
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { monthlyAmount } from "./_recurring-monthly";

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

type StreamRow = {
  stream_id: string; merchant_name: string | null; description: string | null;
  average_amount: number | null; frequency: string | null;
};
type OverrideRow = { stream_id: string; state: string; name: string | null; expected_amount: number | null; frequency: string | null };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") {
    const r = await adminRest(
      `cancellation_requests?user_id=eq.${uid}&select=id,stream_id,stream_name,monthly_at_request,status,requested_at,resolved_at&order=requested_at.desc`,
    );
    if (!r.ok) return json({ error: "Failed to load requests" }, 500);
    return json({ requests: await r.json() });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { stream_id?: string; member_note?: string };
    const streamId = (body.stream_id || "").trim();
    const memberNote = (body.member_note || "").trim().slice(0, 500) || null;
    if (!streamId) return json({ error: "stream_id is required" }, 400);

    // The stream has to be the caller's own AND already confirmed: only a
    // real, reviewed subscription can be asked to be canceled, the same rule
    // that gates editing a stream in api/subscriptions.ts.
    const [sRes, oRes] = await Promise.all([
      adminRest(
        `recurring_streams?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}&select=stream_id,merchant_name,description,average_amount,frequency&limit=1`,
      ),
      adminRest(
        `recurring_overrides?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}&select=stream_id,state,name,expected_amount,frequency&limit=1`,
      ),
    ]);
    const stream = sRes.ok ? ((await sRes.json()) as StreamRow[])[0] : undefined;
    if (!stream) return json({ error: "Unknown stream" }, 404);
    const override = oRes.ok ? ((await oRes.json()) as OverrideRow[])[0] : undefined;
    if (override?.state !== "confirmed") return json({ error: "Only a confirmed subscription can be canceled" }, 400);

    // Refused rather than silently reused: an open request already answers
    // "has this been asked for", and a second one would just be a duplicate
    // row in the same queue. The partial unique index (0059) is the same
    // rule enforced at the database, in case of a race between two tabs.
    const openRes = await adminRest(
      `cancellation_requests?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}&status=in.(requested,contacted)&select=id&limit=1`,
    );
    const openRows = openRes.ok ? ((await openRes.json()) as unknown[]) : [];
    if (openRows.length) return json({ error: "A cancellation request is already open for this" }, 409);

    const streamName = override.name || stream.merchant_name || stream.description || "Recurring charge";
    const expected = override.expected_amount ?? stream.average_amount;
    const frequency = override.frequency || stream.frequency;
    const monthlyAtRequest = monthlyAmount(expected, frequency);

    const ins = await adminRest("cancellation_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: uid,
        stream_id: streamId,
        stream_name: streamName,
        monthly_at_request: monthlyAtRequest,
        member_note: memberNote,
        status: "requested",
      }),
    });
    if (!ins.ok) {
      const detail = await ins.text().catch(() => "");
      console.error(`[cancellation-requests] insert failed (${ins.status}): ${detail}`);
      return json({ error: "Failed to queue the request" }, 500);
    }
    return json({ ok: true }, 200);
  }

  return json({ error: "Method not allowed" }, 405);
}
