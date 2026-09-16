// POST /api/reset-account
// The nuclear version of the existing "Reset plans & preferences" testing
// control (api/plans.ts DELETE + api/profile.ts DELETE), which deliberately
// leaves linked banks connected. This wipes everything about the caller's own
// account, including unlinking every Plaid connection at Plaid itself, and is
// meant to put a test account back through onboarding as if it had just
// signed up. Gated on `isDeveloperEmail`, same allowlist as the rest of the
// Developer tab, since every table touched here is scoped by the caller's own
// `user_id` anyway (a member calling this directly could only ever reset
// themselves); the gate hides a destructive control from people with no use
// for it, it is not what keeps anyone's data safe.
//
// The data wipe itself (every OWNED_TABLES delete, the Plaid unlink, the
// partnership/household soft-delete) lives in `_member-data.ts`, shared with
// api/admin/delete-member.ts, so the two paths can never disagree about what
// "delete this member's data" means. This endpoint's own job is just the
// gate, plus deleting the profile row after: it deliberately never deletes
// the `auth.users` row, so the member can sign back in and go through
// onboarding again.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { isDeveloperEmail } from "./_admin";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { deleteOwnedData } from "./_member-data";

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  if (!isDeveloperEmail(payload.email)) return json({ error: "Not available" }, 403);
  const uid = payload.sub;

  const { itemsUnlinked, partnershipEnded, householdLeft } = await deleteOwnedData(uid);

  // Last: everything above can still resolve `user_id` against a profile row
  // that no longer exists (adminRest doesn't care), but there's no reason to
  // race it.
  await adminRest(`user_profiles?user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

  return json({ ok: true, itemsUnlinked, partnershipEnded, householdLeft });
}
