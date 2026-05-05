export const config = { runtime: "edge" };

const PASSWORD = process.env.APP_PASSWORD || "juniper";
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

export async function signToken(email: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${email}|${b64}`;
}

export async function verifyToken(token: string): Promise<string | null> {
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

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "email and password required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (password !== PASSWORD) {
    return new Response(JSON.stringify({ error: "incorrect password" }), {
      status: 401, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const token = await signToken(email.trim().toLowerCase());
  return new Response(JSON.stringify({ token }), {
    headers: { "Content-Type": "application/json", ...cors },
  });
}
