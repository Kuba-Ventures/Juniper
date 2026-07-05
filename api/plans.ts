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
  "plan_chat_history",
  "current_step_index",
  "partner_invite_status",
  "partner_collected",
  "partner_dialogue_history",
  "partner_current_step_index",
  "partner_dialogue_status",
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
    const domainClause = domain
      ? `&domain=eq.${encodeURIComponent(domain)}`
      : "&order=updated_at.desc";

    // Two parallel queries: plans where caller is owner, plans where caller
    // is partner. Then merge + dedupe. Avoids PostgREST OR filter URL quirks.
    const ownerUrl = `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&select=*${domainClause}`;
    const partnerUrl = `${SUPABASE_URL}/rest/v1/plans?partner_user_id=eq.${encodeURIComponent(userId)}&select=*${domainClause}`;

    const [ownerRes, partnerRes] = await Promise.all([
      fetch(ownerUrl, { headers: supabaseHeaders(token) }),
      fetch(partnerUrl, { headers: supabaseHeaders(token) }),
    ]);

    if (!ownerRes.ok || !partnerRes.ok) {
      const badRes = !ownerRes.ok ? ownerRes : partnerRes;
      const which = !ownerRes.ok ? "owner" : "partner";
      const body = await badRes.text();
      console.error(`[plans GET ${which}] supabase ${badRes.status}:`, body);
      return new Response(
        JSON.stringify({ error: "Fetch failed", status: badRes.status, detail: body }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }

    const ownerRows = (await ownerRes.json()) as Array<{ id: string }>;
    const partnerRows = (await partnerRes.json()) as Array<{ id: string }>;
    // Partner rows first: if a user has both an owned plan and a partnered
    // plan in the same domain (e.g. they clicked Start before accepting an
    // invite), the partnered plan is the shared one — that's what they
    // should land on. Owner rows that aren't already seen come after.
    const seen = new Set<string>();
    const rows: unknown[] = [];
    for (const r of [...partnerRows, ...ownerRows]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }

    if (domain) {
      return new Response(JSON.stringify(rows[0] ?? null), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    return new Response(JSON.stringify(rows), {
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

    console.log(
      `[plans POST] user=${userId} domain=${domain} status=${String(body.status)} keys=${Object.keys(body).join(",")}`,
    );

    // Find an existing plan in this domain that the caller participates in
    // (either as inviter or partner). If found → PATCH. If not → INSERT.
    // Two queries instead of an OR filter (avoids URL syntax quirks).
    const ownerFindUrl = `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}&select=id`;
    const partnerFindUrl = `${SUPABASE_URL}/rest/v1/plans?partner_user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}&select=id`;
    const [ownerFindRes, partnerFindRes] = await Promise.all([
      fetch(ownerFindUrl, { headers: supabaseHeaders(token) }),
      fetch(partnerFindUrl, { headers: supabaseHeaders(token) }),
    ]);
    if (!ownerFindRes.ok || !partnerFindRes.ok) {
      const badRes = !ownerFindRes.ok ? ownerFindRes : partnerFindRes;
      const which = !ownerFindRes.ok ? "owner" : "partner";
      const detail = await badRes.text();
      console.error(`[plans POST find ${which}] supabase ${badRes.status}:`, detail);
      return new Response(
        JSON.stringify({ error: "Lookup failed", status: badRes.status, detail }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }
    const ownerExisting = (await ownerFindRes.json()) as Array<{ id: string }>;
    const partnerExisting = (await partnerFindRes.json()) as Array<{ id: string }>;
    const existing = [...ownerExisting, ...partnerExisting];

    let writeRes: Response;
    if (existing.length > 0) {
      // PATCH the existing plan. Strip user_id from the body — ownership
      // is server-controlled and cannot be re-assigned via this endpoint.
      const patchBody = { ...body };
      delete (patchBody as Record<string, unknown>).user_id;
      writeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/plans?id=eq.${encodeURIComponent(existing[0].id)}`,
        {
          method: "PATCH",
          headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
          body: JSON.stringify(patchBody),
        },
      );
    } else {
      // INSERT a fresh plan with caller as the owner.
      writeRes = await fetch(`${SUPABASE_URL}/rest/v1/plans`, {
        method: "POST",
        headers: { ...supabaseHeaders(token), Prefer: "return=representation" },
        body: JSON.stringify({ ...body, user_id: userId }),
      });
    }

    if (!writeRes.ok) {
      const errText = await writeRes.text();
      console.error(`[plans POST write] supabase ${writeRes.status}:`, errText);
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

  if (req.method === "DELETE") {
    // Reset for testing: delete every plan the caller OWNS. RLS
    // (plans_delete_own) scopes this to their own rows, and the user_id
    // filter means plans where they're only a partner are left untouched.
    console.log(`[plans DELETE] user=${userId} deleting owned plans`);
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: supabaseHeaders(token) },
    );
    if (!delRes.ok) {
      const detail = await delRes.text();
      console.error(`[plans DELETE] supabase ${delRes.status}:`, detail);
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
