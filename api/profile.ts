import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = readEnv("SUPABASE_ANON_KEY");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function supabaseHeaders(userJwt: string) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${userJwt}`,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_JWT_SECRET) {
    return new Response(
      JSON.stringify({ error: "Supabase env vars not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } },
    );
  }

  const token = extractBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return unauthorized();

  const userId = payload.sub;

  if (req.method === "GET") {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: supabaseHeaders(token) },
    );
    const rows = (await res.json()) as unknown[];
    return new Response(JSON.stringify(rows[0] ?? null), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (req.method === "POST") {
    const body = (await req.json()) as Record<string, unknown>;
    // Strip any client-provided user_id/email — server is the source of truth.
    delete body.user_id;
    delete body.email;

    // Check whether a row already exists; PATCH if so, INSERT if not.
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id`,
      { headers: supabaseHeaders(token) },
    );
    const existing = (await existingRes.json()) as unknown[];

    const payloadBody = { ...body, updated_at: new Date().toISOString() };

    const writeRes = existing.length > 0
      ? await fetch(
          `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
            body: JSON.stringify(payloadBody),
          },
        )
      : await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
          method: "POST",
          headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
          body: JSON.stringify({ ...payloadBody, user_id: userId, email: payload.email }),
        });

    const data = await writeRes.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (req.method === "DELETE") {
    // Reset for testing: drop the caller's profile row. RLS
    // (user_profiles_delete_own) scopes it to their own row.
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: supabaseHeaders(token) },
    );
    if (!delRes.ok) {
      const detail = await delRes.text();
      return new Response(
        JSON.stringify({ error: "Delete failed", status: delRes.status, detail }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
}
