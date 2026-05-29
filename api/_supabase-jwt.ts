// Verify Supabase access tokens. Supports both:
//   - ES256 via the project's JWKS endpoint (modern asymmetric keys)
//   - HS256 via SUPABASE_JWT_SECRET (legacy projects)
//
// The verifier picks the path based on the `alg` claim in the token header.

export type SupabaseJwtPayload = {
  sub: string;
  email?: string;
  exp?: number;
  aud?: string;
  role?: string;
};

type JwkLike = JsonWebKey & { kid?: string; alg?: string };

// Per-instance JWKS cache. Edge instances are short-lived; 5 min is plenty.
let jwksCache: { url: string; keys: JwkLike[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000;

function base64UrlDecode(str: string): Uint8Array {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson<T>(str: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(str))) as T;
}

async function fetchJwks(supabaseUrl: string): Promise<JwkLike[]> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JwkLike[] };
  jwksCache = { url, keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

type VerifyOptions = {
  supabaseUrl: string;
  legacySecret?: string;
};

export async function verifySupabaseJwt(
  token: string,
  opts: VerifyOptions,
): Promise<SupabaseJwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg: string; kid?: string };
  try {
    header = base64UrlDecodeJson<{ alg: string; kid?: string }>(headerB64);
  } catch {
    return null;
  }

  const enc = new TextEncoder();
  const data = enc.encode(`${headerB64}.${payloadB64}`);
  const sig = base64UrlDecode(sigB64);

  try {
    let valid = false;

    if (header.alg === "ES256") {
      if (!header.kid) return null;
      const keys = await fetchJwks(opts.supabaseUrl);
      const jwk = keys.find((k) => k.kid === header.kid);
      if (!jwk) return null;
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        sig,
        data,
      );
    } else if (header.alg === "HS256" && opts.legacySecret) {
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(opts.legacySecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      valid = await crypto.subtle.verify("HMAC", key, sig, data);
    } else {
      return null;
    }

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
