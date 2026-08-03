// /api/partner — the shared-workspace data layer (Stage 7 partner data model).
//   GET                              -> the caller's shared overview (or { connected:false })
//   POST { action: "invite" }        -> create/return a partnership invite link
//   POST { action: "accept", token } -> accept an invite, activating the partnership
//   POST { action: "disconnect" }    -> end the caller's active partnership
//   POST { action: "set-prefs", ... }-> update the caller's sharing prefs
//   POST { action: "add-goal", ... } -> create a shared goal
//   POST { action: "add-contribution", goalId, amount } -> contribute to a goal
//
// Every table here is server-only (migration 0012). This endpoint is the sole
// mediator: it verifies membership + honors each member's sharing prefs, writing
// with the service-role key and scoping by the JWT uid itself.
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

type Partnership = { id: string; inviter_id: string; partner_id: string | null; status: string; invite_token: string | null };
type Prefs = { user_id: string; share_balances: boolean; share_transactions: boolean; share_score: boolean };
type Acct = { type: string | null; balance: number | null };
type Goal = { id: string; title: string; icon: string; target_amount: number };
type Contrib = { goal_id: string; user_id: string; amount: number };

const DEFAULT_PREFS = { share_balances: true, share_transactions: false, share_score: false };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

async function memberNetWorth(uid: string): Promise<number> {
  const items = await rows<{ accounts: Acct[] }>(`plaid_items?user_id=eq.${uid}&select=accounts`);
  let assets = 0, debts = 0;
  for (const it of items) for (const a of it.accounts || []) {
    const bal = a.balance || 0;
    const type = (a.type || "").toLowerCase();
    if (type === "credit" || type === "loan") debts += Math.abs(bal);
    else assets += bal;
  }
  return Math.round(assets - debts);
}

// The caller's active partnership (else the pending one they created).
async function loadPartnership(uid: string): Promise<{ active?: Partnership; pending?: Partnership }> {
  const parts = await rows<Partnership>(
    `partnerships?or=(inviter_id.eq.${uid},partner_id.eq.${uid})&status=in.(active,pending)&order=created_at.desc`,
  );
  return {
    active: parts.find((p) => p.status === "active"),
    pending: parts.find((p) => p.status === "pending" && p.inviter_id === uid),
  };
}

async function overview(uid: string): Promise<Response> {
  const { active, pending } = await loadPartnership(uid);
  if (!active) return json({ connected: false, pending: !!pending });

  const partnerId = active.inviter_id === uid ? active.partner_id : active.inviter_id;
  if (!partnerId) return json({ connected: false });

  const profs = await rows<{ name: string | null }>(`user_profiles?user_id=eq.${partnerId}&select=name`);
  const partnerName = firstName(profs[0]?.name) || "Partner";

  const prefsRows = await rows<Prefs>(`partner_sharing_prefs?partnership_id=eq.${active.id}&select=user_id,share_balances,share_transactions,share_score`);
  const mine = prefsRows.find((p) => p.user_id === uid) ?? { user_id: uid, ...DEFAULT_PREFS };
  const theirs = prefsRows.find((p) => p.user_id === partnerId) ?? { user_id: partnerId, ...DEFAULT_PREFS };

  const goalRows = await rows<Goal>(`shared_goals?partnership_id=eq.${active.id}&select=id,title,icon,target_amount&order=created_at.asc`);
  let contribs: Contrib[] = [];
  if (goalRows.length) {
    const ids = goalRows.map((g) => `"${g.id}"`).join(",");
    contribs = await rows<Contrib>(`shared_goal_contributions?goal_id=in.(${ids})&select=goal_id,user_id,amount`);
  }
  const goals = goalRows.map((g) => {
    const you = contribs.filter((c) => c.goal_id === g.id && c.user_id === uid).reduce((a, c) => a + Number(c.amount), 0);
    const partner = contribs.filter((c) => c.goal_id === g.id && c.user_id === partnerId).reduce((a, c) => a + Number(c.amount), 0);
    return { id: g.id, t: g.title, icon: g.icon, target: Number(g.target_amount), you: Math.round(you), partner: Math.round(partner) };
  });

  // Combined net worth: the caller always sees their own in full; the partner's
  // is included only if the partner shares balances.
  const youNW = await memberNetWorth(uid);
  const partnerNW = theirs.share_balances ? await memberNetWorth(partnerId) : 0;

  return json({
    connected: true,
    partner: { name: partnerName },
    prefs: {
      me: { share_balances: mine.share_balances, share_transactions: mine.share_transactions, share_score: mine.share_score },
      partner: { share_balances: theirs.share_balances, share_transactions: theirs.share_transactions, share_score: theirs.share_score },
    },
    goals,
    combined: { netWorth: youNW + partnerNW, youShare: youNW, partnerShare: partnerNW },
  });
}

async function ensurePrefs(partnershipId: string, uid: string) {
  await adminRest("partner_sharing_prefs?on_conflict=partnership_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ partnership_id: partnershipId, user_id: uid, ...DEFAULT_PREFS }),
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
    action?: string; token?: string; partnerName?: string;
    share_balances?: boolean; share_transactions?: boolean; share_score?: boolean;
    title?: string; icon?: string; target?: number; goalId?: string; amount?: number;
  };

  if (body.action === "invite") {
    const { active, pending } = await loadPartnership(uid);
    if (active) return json({ error: "You're already connected with a partner" }, 409);
    const origin = new URL(req.url).origin;
    if (pending?.invite_token) return json({ ok: true, token: pending.invite_token, url: `${origin}/invite/partner/${pending.invite_token}` });
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const r = await adminRest("partnerships", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ inviter_id: uid, status: "pending", invite_token: newToken }),
    });
    if (!r.ok) return json({ error: "Failed to create invite", detail: await r.text().catch(() => "") }, 500);
    return json({ ok: true, token: newToken, url: `${origin}/invite/partner/${newToken}` });
  }

  if (body.action === "accept") {
    const tok = (body.token || "").trim();
    if (!tok) return json({ error: "token required" }, 400);
    const found = await rows<Partnership>(`partnerships?invite_token=eq.${encodeURIComponent(tok)}&select=id,inviter_id,partner_id,status`);
    const p = found[0];
    if (!p || p.status !== "pending") return json({ error: "This invite isn't valid anymore" }, 404);
    if (p.inviter_id === uid) return json({ error: "You can't accept your own invite" }, 400);
    const { active } = await loadPartnership(uid);
    if (active) return json({ error: "You're already connected with a partner" }, 409);
    const upd = await adminRest(`partnerships?id=eq.${p.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ partner_id: uid, status: "active", accepted_at: new Date().toISOString(), invite_token: null }),
    });
    if (!upd.ok) return json({ error: "Failed to accept invite" }, 500);
    await ensurePrefs(p.id, p.inviter_id);
    await ensurePrefs(p.id, uid);
    return json({ ok: true, connected: true });
  }

  if (body.action === "disconnect") {
    const { active } = await loadPartnership(uid);
    if (!active) return json({ ok: true });
    await adminRest(`partnerships?id=eq.${active.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
    });
    return json({ ok: true });
  }

  // The remaining actions require an active partnership.
  const { active } = await loadPartnership(uid);
  if (!active) return json({ error: "No active partnership" }, 409);

  if (body.action === "set-prefs") {
    const patch: Record<string, unknown> = { partnership_id: active.id, user_id: uid, updated_at: new Date().toISOString() };
    if (typeof body.share_balances === "boolean") patch.share_balances = body.share_balances;
    if (typeof body.share_transactions === "boolean") patch.share_transactions = body.share_transactions;
    if (typeof body.share_score === "boolean") patch.share_score = body.share_score;
    const r = await adminRest("partner_sharing_prefs?on_conflict=partnership_id,user_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return json({ error: "Failed to update sharing" }, 500);
    return json({ ok: true });
  }

  if (body.action === "add-goal") {
    const title = (body.title || "").trim();
    const target = Number(body.target);
    if (!title || !Number.isFinite(target) || target < 0) return json({ error: "title and a non-negative target are required" }, 400);
    const r = await adminRest("shared_goals", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ partnership_id: active.id, title, icon: (body.icon || "target").trim(), target_amount: target, created_by: uid }),
    });
    if (!r.ok) return json({ error: "Failed to create goal" }, 500);
    return json({ ok: true, goal: (await r.json().catch(() => []))[0] ?? null });
  }

  if (body.action === "add-contribution") {
    const goalId = (body.goalId || "").trim();
    const amount = Number(body.amount);
    if (!goalId || !Number.isFinite(amount) || amount <= 0) return json({ error: "goalId and a positive amount are required" }, 400);
    // Verify the goal belongs to the caller's partnership.
    const g = await rows<{ id: string }>(`shared_goals?id=eq.${goalId}&partnership_id=eq.${active.id}&select=id`);
    if (!g.length) return json({ error: "Goal not found" }, 404);
    const r = await adminRest("shared_goal_contributions", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ goal_id: goalId, user_id: uid, amount }),
    });
    if (!r.ok) return json({ error: "Failed to add contribution" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
