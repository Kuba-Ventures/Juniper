// Read env vars and aggressively sanitize. Vercel pastes occasionally include
// invisible chars (CR, LF, BOM, zero-width spaces) that break fetch headers
// with "TypeError: Invalid header value". Strip anything outside printable
// ASCII (0x20..0x7E). All Juniper env vars are URLs / base64 JWTs / api keys,
// which are printable-ASCII by spec.
export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\x20-\x7E]/g, "");
  return cleaned || undefined;
}
