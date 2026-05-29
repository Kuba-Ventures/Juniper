// Temporary diagnostic endpoint to investigate env var corruption.
// Returns lengths + positions/codes of any non-printable characters,
// without exposing the actual secret values.
// Hit at /api/env-diag in the browser when signed in.

import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const NAMES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_JWT_SECRET",
  "ANTHROPIC_API_KEY",
];

export default async function handler(): Promise<Response> {
  const out: Record<string, unknown> = {};
  for (const n of NAMES) {
    const raw = process.env[n];
    const cleaned = readEnv(n);
    if (raw === undefined) {
      out[n] = { present: false };
      continue;
    }
    const nonPrintable: { idx: number; code: number; hex: string }[] = [];
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code < 0x20 || code > 0x7E) {
        nonPrintable.push({ idx: i, code, hex: "0x" + code.toString(16) });
        if (nonPrintable.length >= 20) break;
      }
    }
    out[n] = {
      present: true,
      raw_length: raw.length,
      cleaned_length: cleaned?.length ?? 0,
      diff: raw.length - (cleaned?.length ?? 0),
      first_4_codes: Array.from(raw.slice(0, 4)).map((c) => c.charCodeAt(0)),
      last_4_codes: Array.from(raw.slice(-4)).map((c) => c.charCodeAt(0)),
      non_printable: nonPrintable,
    };
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
