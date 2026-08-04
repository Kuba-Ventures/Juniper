// POST /api/plaid/layer-session
// Body: { phone?: string }
// Account discovery, tier 1 (Plaid Layer): creates a Layer session token so the
// browser can open Plaid Link in returning-user mode. Plaid matches the person
// by phone number + device and surfaces the accounts they've already connected
// across the Plaid network, no per-institution login, ready to select and share.
//
// GATED: Layer requires Plaid Production access AND a Layer template configured
// in the Plaid dashboard. Until `PLAID_LAYER_TEMPLATE_ID` is set this returns
// 503 so the client cleanly falls back to the tier-2 gallery. This is the seam,
// activated by ops (env + template) the same way the rest of the data engine is.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  if (!plaidConfigured()) return json({ error: "Plaid not configured" }, 503);

  const templateId = readEnv("PLAID_LAYER_TEMPLATE_ID");
  if (!templateId) {
    // Layer isn't enabled yet, tell the client to use the gallery instead.
    return json({ error: "Layer not enabled", fallback: "gallery" }, 503);
  }

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = (body.phone || "").trim();

  // /session/token/create with a Layer template returns a link object carrying a
  // link_token the browser hands to Plaid Link. Passing the phone lets Plaid
  // pre-fill it and run the returning-user recognition.
  const { ok, status, data } = await plaidFetch<{ link_token?: string; error_message?: string }>(
    "/session/token/create",
    {
      template_id: templateId,
      user: {
        client_user_id: payload.sub,
        ...(phone ? { phone_number: phone } : {}),
      },
    },
  );

  if (!ok || !data.link_token) {
    return json({ error: data.error_message || "Failed to create Layer session" }, status || 502);
  }
  return json({ link_token: data.link_token });
}
