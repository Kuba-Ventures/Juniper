// POST /api/partners/submit
// A merchant self-listing submission (the marketplace supply side). Writes to
// the partner_submissions moderation queue as 'pending', scoped to the signed-in
// user. An admin later reviews and, if approved, promotes it into `partners`.
// Requires: migration 0010 applied and a signed-in user.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
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

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// Accept http(s) URLs only, so we never store a javascript:/data: link.
function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    name?: string; category?: string; url?: string; contactEmail?: string; description?: string;
  };
  const name = (body.name || "").trim();
  const category = (body.category || "").trim();
  const url = (body.url || "").trim();
  const contactEmail = (body.contactEmail || "").trim();
  const description = (body.description || "").trim().slice(0, 2000);

  if (!name || !category) return json({ error: "Name and category are required" }, 400);
  if (!isHttpUrl(url)) return json({ error: "A valid http(s) URL is required" }, 400);
  if (!isEmail(contactEmail)) return json({ error: "A valid contact email is required" }, 400);

  const r = await adminRest("partner_submissions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      submitted_by: payload.sub,
      name, category, url, contact_email: contactEmail,
      description: description || null,
      status: "pending",
    }),
  });
  if (!r.ok) return json({ error: "Failed to submit listing", detail: await r.text().catch(() => "") }, 500);
  const rows = (await r.json().catch(() => [])) as { id?: string }[];
  return json({ ok: true, id: rows[0]?.id ?? null, status: "pending" });
}
