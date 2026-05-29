import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = readEnv("SUPABASE_ANON_KEY");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// Fields the client is allowed to write. user_id, id, created_at, updated_at are server-controlled.
const ALLOWED_WRITE_FIELDS = new Set([
  "domain",
  "status",
  "has_partner",
  "partner_first_name",
  "goal",
  "current_state",
  "milestones",
  "kpis",
  "next_actions",
  "dialogue_history",
  "current_step_index",
  "partner_invite_status",
]);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_WRITE_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env vars not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
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
    const domain = new URL(req.url).searchParams.get("domain");
    const query = domain
      ? `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}&select=*`
      : `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`;

    const res = await fetch(query, { headers: supabaseHeaders(token) });
    const rows = (await res.json()) as unknown[];
    if (domain) {
      return new Response(JSON.stringify(rows[0] ?? null), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    return new Response(JSON.stringify(rows ?? []), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (req.method === "POST") {
    const body = sanitize((await req.json()) as Record<string, unknown>);
    const domain = body.domain as string | undefined;
    if (!domain || typeof domain !== "string") {
      return new Response(JSON.stringify({ error: "domain required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}&select=id`,
      { headers: supabaseHeaders(token) },
    );
    const existing = (await existingRes.json()) as Array<{ id: string }>;

    const writeRes = existing.length > 0
      ? await fetch(
          `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}`,
          {
            method: "PATCH",
            headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
            body: JSON.stringify(body),
          },
        )
      : await fetch(`${SUPABASE_URL}/rest/v1/plans`, {
          method: "POST",
          headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
          body: JSON.stringify({ ...body, user_id: userId }),
        });

    const data = await writeRes.json();
    return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
}
