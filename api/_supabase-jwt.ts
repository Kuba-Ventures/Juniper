// Verify a Supabase HS256 access token using SUPABASE_JWT_SECRET.
// Returns the decoded payload (sub = auth.users.id, email, exp) if valid,
// or null if the signature, format, or expiry fails.

export type SupabaseJwtPayload = {
  sub: string;
  email?: string;
  exp?: number;
  aud?: string;
  role?: string;
};

function base64UrlDecode(str: string): Uint8Array {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson<T>(str: string): T {
  const bytes = base64UrlDecode(str);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function verifySupabaseJwt(
  token: string,
  secret: string,
): Promise<SupabaseJwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sig = base64UrlDecode(sigB64);
    const data = enc.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("HMAC", key, sig, data);
    if (!valid) return null;
    const payload = base64UrlDecodeJson<SupabaseJwtPayload>(payloadB64);
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
