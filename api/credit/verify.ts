// POST /api/credit/verify — Stage 10d: complete the SMS OTP started by
// api/credit/connect.ts, and on success write the ONE durable record Stage
// 10d retains. This is the only writer of credit_consents (see that
// migration's header): a row here is the legal claim that a real OTP was
// verified before Juniper obtained this member's credit profile, so nothing
// else is allowed to insert one.
//
// Upserts on user_id (one Spinwheel identity per member): a member who goes
// through this a second time, e.g. after a phone number change, replaces
// their existing consent rather than accumulating a stale second identity
// nothing will ever pull against again.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { creditConfigured, creditFetch } from "../_credit-provider";
import { adminConfigured, adminRest } from "../_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

type SpinwheelVerifyResp = {
  status?: { messages?: { desc?: string }[] };
  data?: { connectionStatus?: string; profile?: { phoneNumber?: string } };
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Not configured" }, 503);
  if (!creditConfigured()) return json({ error: "Credit provider not configured" }, 503);
  if (!adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { userId?: string; code?: string };
  const spinwheelUserId = body.userId?.trim();
  const code = body.code?.trim();
  if (!spinwheelUserId) return json({ error: "Missing connection" }, 400);
  if (!code || !/^\d{4,8}$/.test(code)) return json({ error: "Enter the code from the text message" }, 400);

  const r = await creditFetch<SpinwheelVerifyResp>(
    `/v1/users/${spinwheelUserId}/connect/sms/verify`,
    { code },
  );
  if (!r.ok || r.data.data?.connectionStatus !== "SUCCESS") {
    console.error(`[credit] connect/sms/verify failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    return json({ error: "That code didn't work. Check it and try again." }, 400);
  }

  const phone = r.data.data.profile?.phoneNumber ?? "";
  const last4 = phone.replace(/[^\d]/g, "").slice(-4).padStart(4, "0");

  const upsert = await adminRest("credit_consents?on_conflict=user_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([
      { user_id: payload.sub, spinwheel_user_id: spinwheelUserId, phone_last4: last4, consented_at: new Date().toISOString() },
    ]),
  });
  if (!upsert.ok) {
    console.error(`[credit] failed to record consent (${upsert.status})`);
    return json({ error: "Verified, but couldn't save your consent. Try again." }, 500);
  }

  return json({ ok: true });
}
