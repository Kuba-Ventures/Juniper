// /api/household, the household data layer (issue #258).
//   GET                                  -> the caller's household overview (or { connected:false })
//   POST { action: "create", name }      -> create a household, caller becomes owner
//   POST { action: "invite", ... }       -> owner-only: create/return a household invite link
//   POST { action: "accept", token }     -> accept an invite, joining the household
//   POST { action: "leave" }             -> leave the caller's household
//   POST { action: "remove-member", userId } -> owner-only: remove another member
//   POST { action: "set-account-share", accountId, scope } -> update the caller's per-account sharing
//
// Every table here is server-only (migration 0055), same posture as
// partnerships (0012). This endpoint is the sole mediator: it verifies
// membership + role + honors each member's sharing, writing with the
// service-role key and scoping by the JWT uid itself.
//
// Deliberately does not import from api/partner.ts or touch its tables: a
// household is a distinct model from a two-person partnership (see 0055's
// header), and the small memberAccounts()/rows() helpers below are copied
// rather than shared, so this change cannot regress the live partner path.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

type Role = "owner" | "adult" | "teen";
type Member = { id: string; household_id: string; user_id: string; role: Role; joined_at: string; left_at: string | null };
type Household = { id: string; name: string; created_by: string };
type Invite = { id: string; household_id: string; invite_token: string; invited_name: string | null; invited_role: Role; status: string };
type Share = { user_id: string; account_id: string; scope: string };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

type PAcct = { account_id: string; name?: string; type?: string | null; subtype?: string | null; balance?: number | null };
type PItem = { institution_name?: string | null; accounts: PAcct[] };
type DisplayAcct = { account_id: string; n: string; inst: string; v: number; type: string };

// A member's accounts flattened for display (debts shown negative). Copied
// from api/partner.ts's memberAccounts() rather than shared, see header.
async function memberAccounts(uid: string): Promise<DisplayAcct[]> {
  const items = await rows<PItem>(`plaid_items?user_id=eq.${uid}&select=institution_name,accounts`);
  return items.flatMap((it) =>
    (it.accounts || []).map((a) => {
      const type = (a.type || "").toLowerCase();
      const bal = a.balance || 0;
      return {
        account_id: a.account_id,
        n: a.name || "Account",
        inst: it.institution_name || a.subtype || a.type || "Account",
        v: type === "credit" || type === "loan" ? -Math.abs(bal) : bal,
        type,
      };
    }),
  );
}

// The caller's active household membership, if any.
async function loadMembership(uid: string): Promise<Member | null> {
  const m = await rows<Member>(`household_members?user_id=eq.${uid}&left_at=is.null&select=*&limit=1`);
  return m[0] ?? null;
}

async function overview(uid: string): Promise<Response> {
  const mine = await loadMembership(uid);
  if (!mine) return json({ connected: false });

  const [households, members] = await Promise.all([
    rows<Household>(`households?id=eq.${mine.household_id}&select=id,name,created_by&limit=1`),
    rows<Member>(`household_members?household_id=eq.${mine.household_id}&left_at=is.null&select=*&order=joined_at.asc`),
  ]);
  const household = households[0];
  if (!household) return json({ connected: false });

  const userIds = members.map((m) => m.user_id);
  const nameFilter = userIds.map((id) => `"${id}"`).join(",");
  const profs = await rows<{ user_id: string; name: string | null }>(
    `user_profiles?user_id=in.(${nameFilter})&select=user_id,name`,
  );
  const nameOf = (id: string) => firstName(profs.find((p) => p.user_id === id)?.name) || "Member";

  const shareRows = await rows<Share>(`household_account_shares?household_id=eq.${mine.household_id}&select=user_id,account_id,scope`);
  const scopeFor = (memberId: string, acctId: string): string =>
    shareRows.find((s) => s.user_id === memberId && s.account_id === acctId)?.scope ?? "private";

  const accounts: { account_id: string; n: string; inst: string; v: number; owner_id: string; scope: string; mine: boolean }[] = [];
  let netWorth = 0;
  for (const m of members) {
    const accts = await memberAccounts(m.user_id);
    for (const a of accts) {
      const scope = scopeFor(m.user_id, a.account_id);
      const isMine = m.user_id === uid;
      // The caller always sees their own rows, including private ones, so
      // they can change their mind. Everyone else's private accounts are
      // hidden entirely. Only shared accounts count toward the total, and it
      // is accumulated in this same pass so it cannot disagree with the list
      // (the same rule #195 established for the shared partner total).
      if (!isMine && scope !== "shared") continue;
      if (scope === "shared") netWorth += a.v;
      accounts.push({ account_id: a.account_id, n: a.n, inst: a.inst, v: a.v, owner_id: m.user_id, scope, mine: isMine });
    }
  }

  return json({
    connected: true,
    household: { id: household.id, name: household.name },
    role: mine.role,
    members: members.map((m) => ({ userId: m.user_id, name: nameOf(m.user_id), role: m.role, isMe: m.user_id === uid })),
    accounts,
    combined: { netWorth: Math.round(netWorth) },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ connected: false });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") return overview(uid);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string; name?: string; token?: string; role?: string;
    userId?: string; accountId?: string; scope?: string;
  };

  if (body.action === "create") {
    const name = (body.name || "").trim().slice(0, 60);
    if (!name) return json({ error: "name is required" }, 400);
    const existing = await loadMembership(uid);
    if (existing) return json({ error: "You're already in a household" }, 409);
    const hh = await adminRest("households", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name, created_by: uid }),
    });
    if (!hh.ok) return json({ error: "Failed to create household" }, 500);
    const created = (await hh.json().catch(() => []))[0] as Household | undefined;
    if (!created) return json({ error: "Failed to create household" }, 500);
    const mem = await adminRest("household_members", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ household_id: created.id, user_id: uid, role: "owner" }),
    });
    if (!mem.ok) return json({ error: "Failed to join household" }, 500);
    return json({ ok: true, household: { id: created.id, name: created.name } });
  }

  if (body.action === "accept") {
    // Unlike every other action below, accept needs NO existing membership —
    // that is the normal case, a caller with no household yet joining one.
    const existing = await loadMembership(uid);
    if (existing) return json({ error: "You're already in a household" }, 409);
    const tok = (body.token || "").trim();
    if (!tok) return json({ error: "token required" }, 400);
    const found = await rows<Invite>(`household_invites?invite_token=eq.${encodeURIComponent(tok)}&select=id,household_id,invited_role,status`);
    const inv = found[0];
    if (!inv || inv.status !== "pending") return json({ error: "This invite isn't valid anymore" }, 404);
    const mem = await adminRest("household_members", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ household_id: inv.household_id, user_id: uid, role: inv.invited_role }),
    });
    if (!mem.ok) return json({ error: "Failed to join household" }, 500);
    await adminRest(`household_invites?id=eq.${inv.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: uid }),
    });
    return json({ ok: true, connected: true });
  }

  // Every remaining action requires an active membership.
  const mine = await loadMembership(uid);
  if (!mine) return json({ error: "You're not in a household" }, 409);

  if (body.action === "invite") {
    if (mine.role !== "owner") return json({ error: "Only the household owner can invite" }, 403);
    const invitedRole: Role = body.role === "teen" ? "teen" : "adult";
    const invitedName = (body.name || "").trim().slice(0, 60) || null;
    const origin = new URL(req.url).origin;
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const r = await adminRest("household_invites", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        household_id: mine.household_id, invite_token: newToken,
        invited_name: invitedName, invited_role: invitedRole, created_by: uid,
      }),
    });
    if (!r.ok) return json({ error: "Failed to create invite", detail: await r.text().catch(() => "") }, 500);
    return json({ ok: true, token: newToken, url: `${origin}/invite/household/${newToken}` });
  }

  if (body.action === "leave") {
    await adminRest(`household_members?id=eq.${mine.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ left_at: new Date().toISOString() }),
    });
    // If the owner left and others remain, promote the earliest-joined
    // remaining member so the household is never left ownerless.
    if (mine.role === "owner") {
      const remaining = await rows<Member>(
        `household_members?household_id=eq.${mine.household_id}&left_at=is.null&select=*&order=joined_at.asc&limit=1`,
      );
      if (remaining[0]) {
        await adminRest(`household_members?id=eq.${remaining[0].id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ role: "owner" }),
        });
      }
    }
    return json({ ok: true });
  }

  if (body.action === "remove-member") {
    if (mine.role !== "owner") return json({ error: "Only the household owner can remove a member" }, 403);
    const targetId = (body.userId || "").trim();
    if (!targetId) return json({ error: "userId is required" }, 400);
    if (targetId === uid) return json({ error: "Use leave to remove yourself" }, 400);
    const target = await rows<Member>(
      `household_members?household_id=eq.${mine.household_id}&user_id=eq.${targetId}&left_at=is.null&select=id&limit=1`,
    );
    if (!target[0]) return json({ error: "Member not found" }, 404);
    await adminRest(`household_members?id=eq.${target[0].id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ left_at: new Date().toISOString() }),
    });
    return json({ ok: true });
  }

  if (body.action === "set-account-share") {
    const accountId = (body.accountId || "").trim();
    const scope = body.scope;
    if (!accountId || (scope !== "shared" && scope !== "private")) {
      return json({ error: "accountId and a valid scope are required" }, 400);
    }
    const r = await adminRest("household_account_shares?on_conflict=household_id,user_id,account_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ household_id: mine.household_id, user_id: uid, account_id: accountId, scope, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return json({ error: "Failed to update account sharing" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
