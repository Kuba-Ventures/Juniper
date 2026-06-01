import { readEnv } from "./_env";

// Public, unauthenticated endpoint: the landing page form POSTs
// { email, journey_stage } here. We insert into public.waitlist using the anon
// key — RLS allows anon INSERT (and nothing else) on that table. A Supabase
// Database Webhook on INSERT mirrors each new row into the admin sheet.

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = readEnv("SUPABASE_ANON_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const journeyStage =
    typeof body.journey_stage === "string" && body.journey_stage.trim()
      ? body.journey_stage.trim()
      : null;

  if (!EMAIL_RE.test(email)) {
    return json({ error: "A valid email is required" }, 400);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      journey_stage: journeyStage,
      source: "landing",
    }),
  });

  // Duplicate email hits the unique index (409). Treat repeat sign-ups as a
  // success so the visitor still sees the confirmation state.
  if (res.status === 409) return json({ ok: true, duplicate: true });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "Could not save sign-up", detail }, 502);
  }

  return json({ ok: true });
}
