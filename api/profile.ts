export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SECRET = process.env.AUTH_SECRET || "dev-secret-change-in-production";

const enc = new TextEncoder();

async function getKey() {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function verifyToken(token: string): Promise<string | null> {
  const idx = token.lastIndexOf("|");
  if (idx === -1) return null;
  const email = token.slice(0, idx);
  const b64 = token.slice(idx + 1);
  try {
    const key = await getKey();
    const sig = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(email));
    return valid ? email : null;
  } catch {
    return null;
  }
}

function supabaseHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${SUPABASE_ANON_KEY!}`,
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { "Content-Type": "application/json", ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  // Verify session token
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const tokenEmail = await verifyToken(token);
  if (!tokenEmail) return unauthorized();

  if (req.method === "GET") {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...cors },
      });
    }
    // Token must belong to the requested email
    if (tokenEmail !== email.trim().toLowerCase()) return unauthorized();

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: supabaseHeaders() },
    );
    const rows = (await res.json()) as unknown[];
    return new Response(JSON.stringify(rows[0] ?? null), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (req.method === "POST") {
    const body = (await req.json()) as Record<string, unknown>;
    const bodyEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    // Token must belong to the email being written
    if (tokenEmail !== bodyEmail) return unauthorized();

    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
}
