// POST /api/admin/delete-member { user_id }
// Admin-only (ADMIN_EMAILS allowlist), same 4-step gate as the rest of
// api/admin/*.ts. This is a real account removal, not a reset: it wipes the
// same owned data api/reset-account.ts wipes (via the shared
// `deleteOwnedData()` in `../_member-data`), then also deletes the
// `auth.users` row itself through Supabase's GoTrue admin API, which
// reset-account.ts deliberately never does. There is no way back from this
// one — the member would have to sign up again from scratch.
//
// Built for the sign-ups roster (api/admin/signups.ts): removing a stray test
// or duplicate account from that list, not something a member can trigger on
// themselves or on anyone else.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isAdminEmail } from "../_admin";
import { deleteOwnedData } from "../_member-data";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  if (!isAdminEmail(payload.email)) return json({ error: "Forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { user_id?: string };
  const uid = (body.user_id || "").trim();
  if (!uid) return json({ error: "user_id is required" }, 400);
  // An admin removing their OWN account through the roster, rather than
  // Settings, would sign them out mid-request with no way to confirm it
  // finished; refused rather than allowed to race.
  if (uid === payload.sub) return json({ error: "Can't delete your own account from here." }, 400);

  await deleteOwnedData(uid);
  await adminRest(`user_profiles?user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

  // The one step reset-account.ts never takes: remove the auth identity
  // itself, through the same GoTrue admin endpoint signups.ts already reads
  // from. A failure here is reported rather than swallowed, since every table
  // above is already gone and a member left with a login but no data is a
  // worse, harder-to-notice state than this endpoint simply erroring out.
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY!}` },
  });
  if (!authRes.ok) {
    return json({ error: "Data was deleted, but the account itself could not be removed." }, 502);
  }

  return json({ ok: true });
}
