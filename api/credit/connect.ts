// POST /api/credit/connect — Stage 10d: start a real, per-member Spinwheel
// SMS connect. Takes the member's own phone number and date of birth
// (Spinwheel's own identity-match minimum, the Stage 10c decision) and kicks
// off a real text message; the member types the code they receive into
// api/credit/verify.ts, which is the only place a consent record is ever
// written. Nothing is stored here: a connection is not a consent until the
// OTP is verified, so a member who abandons this step (never receives the
// text, closes the tab) leaves no row behind.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { creditConfigured, creditFetch } from "../_credit-provider";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// Accepts a plain 10-digit US number or one already in E.164; Spinwheel's own
// docs require E.164 ("+1XXXXXXXXXX"). Refuses anything else rather than
// guessing, since a malformed number sent to Spinwheel is a wasted SMS at
// best and a wrong person's phone at worst.
function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Accepts MM/DD/YYYY (what the onboarding field's placeholder asks for) or
// YYYY-MM-DD, and normalizes to the YYYY-MM-DD Spinwheel's API requires.
function toIsoDob(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

type SpinwheelConnectResp = {
  status?: { messages?: { desc?: string }[] };
  data?: { userId?: string; connectionId?: string };
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Not configured" }, 503);
  if (!creditConfigured()) return json({ error: "Credit provider not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { phone?: string; dob?: string };
  const phone = toE164(body.phone ?? "");
  const dob = toIsoDob(body.dob ?? "");
  if (!phone) return json({ error: "Enter a valid US phone number" }, 400);
  if (!dob) return json({ error: "Enter your date of birth as MM/DD/YYYY" }, 400);

  const r = await creditFetch<SpinwheelConnectResp>("/v1/users/connect/sms", {
    phoneNumber: phone,
    dateOfBirth: dob,
    extUserId: payload.sub,
  });
  if (!r.ok || !r.data.data?.userId) {
    console.error(`[credit] connect/sms failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    return json({ error: "Couldn't send a verification code. Check the number and try again." }, 502);
  }

  return json({ userId: r.data.data.userId, connectionId: r.data.data.connectionId ?? null });
}
