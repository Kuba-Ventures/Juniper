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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

function supabaseHeaders(userJwt: string) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${userJwt}`,
  };
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Origin to use for the share URL. Prefer request origin; fall back to env.
function shareUrlBase(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return "";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }

  const token = extractBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return unauthorized();
  const userId = payload.sub;

  // GET /api/invites?token=xxx — lookup invite by token
  if (req.method === "GET") {
    const inviteToken = new URL(req.url).searchParams.get("token");
    if (!inviteToken) return json({ error: "token required" }, 400);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?invite_token=eq.${encodeURIComponent(inviteToken)}&select=id,user_id,partner_user_id,domain,goal,partner_invite_status`,
      { headers: supabaseHeaders(token) },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[invites GET] supabase ${res.status}:`, detail);
      return json({ error: "lookup failed", detail }, 500);
    }
    const rows = (await res.json()) as Array<{
      id: string;
      user_id: string;
      partner_user_id: string | null;
      domain: string;
      goal: { headline?: string } | null;
      partner_invite_status: string;
    }>;
    if (rows.length === 0) {
      return json({ error: "Invite not found or expired" }, 404);
    }
    const plan = rows[0];

    // Fetch inviter's display name from user_profiles
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(plan.user_id)}&select=name`,
      { headers: supabaseHeaders(token) },
    );
    const profs = profRes.ok ? ((await profRes.json()) as Array<{ name: string | null }>) : [];
    const inviter_first_name = profs[0]?.name?.split(" ")[0] ?? "Your partner";

    return json({
      domain: plan.domain,
      inviter_first_name,
      goal_headline: plan.goal?.headline ?? null,
      already_accepted:
        plan.partner_invite_status === "accepted" && plan.partner_user_id !== null,
      partner_is_self: plan.partner_user_id === userId,
      inviter_is_self: plan.user_id === userId,
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "create" | "accept";
    domain?: string;
    partner_first_name?: string;
    token?: string;
  };

  if (body.action === "create") {
    if (!body.domain) return json({ error: "domain required" }, 400);
    const newToken = generateToken();

    // Update only the plan owned by this user for the given domain.
    const url = `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(body.domain)}`;
    const updateRes = await fetch(url, {
      method: "PATCH",
      headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
      body: JSON.stringify({
        invite_token: newToken,
        partner_invite_status: "invited",
        ...(body.partner_first_name ? { partner_first_name: body.partner_first_name } : {}),
      }),
    });
    if (!updateRes.ok) {
      const detail = await updateRes.text();
      console.error(`[invites create] supabase ${updateRes.status}:`, detail);
      return json({ error: "Could not create invite", detail }, 500);
    }
    const updated = (await updateRes.json()) as Array<{ id: string; invite_token: string }>;
    if (updated.length === 0) {
      return json({ error: "No matching plan for current user" }, 404);
    }
    return json({
      token: newToken,
      url: `${shareUrlBase(req)}/invite/${newToken}`,
      partner_first_name: body.partner_first_name ?? null,
    });
  }

  if (body.action === "accept") {
    if (!body.token) return json({ error: "token required" }, 400);

    // Find the plan by token first (via the broad RLS we added).
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?invite_token=eq.${encodeURIComponent(body.token)}&select=id,user_id,partner_user_id,domain`,
      { headers: supabaseHeaders(token) },
    );
    if (!findRes.ok) {
      const detail = await findRes.text();
      console.error(`[invites accept lookup] supabase ${findRes.status}:`, detail);
      return json({ error: "lookup failed", detail }, 500);
    }
    const rows = (await findRes.json()) as Array<{
      id: string;
      user_id: string;
      partner_user_id: string | null;
      domain: string;
    }>;
    if (rows.length === 0) return json({ error: "Invite not found" }, 404);
    const plan = rows[0];

    if (plan.user_id === userId) {
      return json({ error: "You can't accept your own invite" }, 400);
    }
    if (plan.partner_user_id && plan.partner_user_id !== userId) {
      return json({ error: "This invite already has a partner attached" }, 409);
    }
    if (plan.partner_user_id === userId) {
      return json({ ok: true, domain: plan.domain, already_accepted: true });
    }

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?id=eq.${encodeURIComponent(plan.id)}`,
      {
        method: "PATCH",
        headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
        body: JSON.stringify({
          partner_user_id: userId,
          partner_invite_status: "accepted",
          partner_dialogue_status: "not_started",
        }),
      },
    );
    if (!updateRes.ok) {
      const detail = await updateRes.text();
      console.error(`[invites accept update] supabase ${updateRes.status}:`, detail);
      return json({ error: "Could not accept", detail }, 500);
    }
    return json({ ok: true, domain: plan.domain });
  }

  return json({ error: "Unknown action" }, 400);
}
