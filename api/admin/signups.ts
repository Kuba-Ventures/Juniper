// /api/admin/signups — the sign-ups & usage roster for the admin page.
//   GET -> { members: [...] }
// Admin-only (ADMIN_EMAILS allowlist), same 4-step shape as
// api/admin/submissions.ts: verify the JWT, check isAdminEmail, then read with
// the service-role key, which is what makes a query spanning every member
// possible at all (RLS would otherwise limit every read to the caller's own
// rows).
//
// Signup time lives nowhere in `public.user_profiles` (no created_at column;
// its own `updated_at` is overwritten on every profile edit, so it is not a
// usable proxy). The one real signup timestamp is `auth.users.created_at`,
// which PostgREST does not expose (only the `public` schema is under
// `/rest/v1/`), so this is the one endpoint in the app that calls Supabase's
// GoTrue admin API directly instead of going through adminRest().
//
// "Activated" / "last active" are deliberately built only from facts the app
// already persists for its own reasons (a linked or hand-entered account, a
// plan, a profile edit) rather than any new instrumentation: monthly income,
// expenses, savings, debt and goals are excluded on purpose, same as the
// admin sheet cleanup this page replaces.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isAdminEmail } from "../_admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// A ceiling on rows read, not on members served, the same convention (and the
// same honest comment) as the cron's own ITEM_SCAN_LIMIT: today this is a
// handful of members, and this is the line to widen the day it is not enough.
const AUTH_PAGE_SIZE = 200;
const MAX_AUTH_PAGES = 10;

type AuthUser = { id: string; email: string | null; created_at: string };

async function listAllAuthUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${AUTH_PAGE_SIZE}`, {
      headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY!}` },
    });
    if (!res.ok) break;
    const data = (await res.json().catch(() => ({}))) as { users?: AuthUser[] };
    const batch = data.users ?? [];
    out.push(...batch);
    if (batch.length < AUTH_PAGE_SIZE) break;
  }
  return out;
}

type ProfileRow = { user_id: string; name: string | null; updated_at: string | null };
type ItemRow = { user_id: string; created_at: string; last_synced_at: string | null };
type ManualRow = { user_id: string; created_at: string; updated_at: string | null };
type PlanRow = { user_id: string; created_at: string; updated_at: string | null };

// The later of any number of ISO timestamps (string comparison is safe for
// Postgres's `timestamptz` output, which is always zero-padded and UTC).
function latest(...dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

export type SignupStatus = "active" | "onboarding" | "stalled";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  if (!isAdminEmail(payload.email)) return json({ error: "Forbidden" }, 403);

  const [authUsers, profilesRes, itemsRes, manualRes, plansRes] = await Promise.all([
    listAllAuthUsers(),
    adminRest("user_profiles?select=user_id,name,updated_at"),
    adminRest("plaid_items?select=user_id,created_at,last_synced_at"),
    adminRest("manual_accounts?select=user_id,created_at,updated_at"),
    adminRest("plans?select=user_id,created_at,updated_at"),
  ]);
  if (!profilesRes.ok || !itemsRes.ok || !manualRes.ok || !plansRes.ok) {
    return json({ error: "Failed to load members" }, 500);
  }
  const profiles = (await profilesRes.json()) as ProfileRow[];
  const items = (await itemsRes.json()) as ItemRow[];
  const manual = (await manualRes.json()) as ManualRow[];
  const plans = (await plansRes.json()) as PlanRow[];

  const nameByUser = new Map(profiles.map((p) => [p.user_id, p.name]));
  const profileUpdatedByUser = new Map(profiles.map((p) => [p.user_id, p.updated_at]));

  const accountsByUser = new Map<string, number>();
  const lastSyncByUser = new Map<string, string>();
  for (const it of items) {
    accountsByUser.set(it.user_id, (accountsByUser.get(it.user_id) ?? 0) + 1);
    const cand = latest(lastSyncByUser.get(it.user_id), it.last_synced_at, it.created_at);
    if (cand) lastSyncByUser.set(it.user_id, cand);
  }
  const manualUpdatedByUser = new Map<string, string>();
  for (const m of manual) {
    accountsByUser.set(m.user_id, (accountsByUser.get(m.user_id) ?? 0) + 1);
    const cand = latest(manualUpdatedByUser.get(m.user_id), m.updated_at, m.created_at);
    if (cand) manualUpdatedByUser.set(m.user_id, cand);
  }
  const plansByUser = new Map<string, number>();
  const plansUpdatedByUser = new Map<string, string>();
  for (const p of plans) {
    plansByUser.set(p.user_id, (plansByUser.get(p.user_id) ?? 0) + 1);
    const cand = latest(plansUpdatedByUser.get(p.user_id), p.updated_at, p.created_at);
    if (cand) plansUpdatedByUser.set(p.user_id, cand);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const members = authUsers
    .filter((u): u is AuthUser & { email: string } => !!u.email)
    .map((u) => {
      const accounts = accountsByUser.get(u.id) ?? 0;
      const planCount = plansByUser.get(u.id) ?? 0;
      const lastActive =
        latest(
          lastSyncByUser.get(u.id),
          manualUpdatedByUser.get(u.id),
          plansUpdatedByUser.get(u.id),
          profileUpdatedByUser.get(u.id),
        ) ?? u.created_at;
      const daysSinceSignup = (now - new Date(u.created_at).getTime()) / DAY_MS;
      const status: SignupStatus = accounts > 0 ? "active" : daysSinceSignup > 7 ? "stalled" : "onboarding";
      return {
        userId: u.id,
        name: nameByUser.get(u.id) || null,
        email: u.email,
        signedUp: u.created_at,
        status,
        accounts,
        plans: planCount,
        lastActive,
      };
    })
    .sort((a, b) => (a.signedUp < b.signedUp ? 1 : -1));

  return json({ members });
}
