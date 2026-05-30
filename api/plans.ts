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
    if (!res.ok) {
      const body = await res.text();
      console.error(`[plans GET] supabase ${res.status}:`, body);
      return new Response(
        JSON.stringify({ error: "Fetch failed", status: res.status, detail: body }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }
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
    const rawBody = (await req.json()) as Record<string, unknown>;
    const body = sanitize(rawBody);
    const domain = body.domain as string | undefined;
    if (!domain || typeof domain !== "string") {
      return new Response(JSON.stringify({ error: "domain required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Upsert pattern: PostgREST treats this as INSERT, falling back to UPDATE
    // when the (user_id, domain) unique index matches. Single roundtrip; no
    // SELECT-then-decide race.
    const payloadBody = { ...body, user_id: userId };
    const url = `${SUPABASE_URL}/rest/v1/plans?on_conflict=user_id,domain`;
    console.log(
      `[plans POST] user=${userId} domain=${domain} status=${String(body.status)} keys=${Object.keys(body).join(",")}`,
    );

    const writeRes = await fetch(url, {
      method: "POST",
      headers: {
        ...supabaseHeaders(token),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payloadBody),
    });

    if (!writeRes.ok) {
      const errText = await writeRes.text();
      console.error(`[plans POST] supabase ${writeRes.status}:`, errText);
      return new Response(
        JSON.stringify({ error: "Save failed", status: writeRes.status, detail: errText }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }

    const data = await writeRes.json();
    return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
}
