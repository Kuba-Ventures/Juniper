// Temporary diag — verify what the server currently sees in env vars.
import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET", "ANTHROPIC_API_KEY"];

export default async function handler(): Promise<Response> {
  const out: Record<string, unknown> = {};
  for (const n of NAMES) {
    const raw = process.env[n];
    const cleaned = readEnv(n);
    if (raw === undefined) {
      out[n] = { present: false };
      continue;
    }
    out[n] = {
      present: true,
      raw_length: raw.length,
      cleaned_length: cleaned?.length ?? 0,
      first_8: cleaned?.slice(0, 8),
      last_8: cleaned?.slice(-8),
    };
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
