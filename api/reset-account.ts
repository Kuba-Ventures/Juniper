// POST /api/reset-account
// The nuclear version of the existing "Reset plans & preferences" testing
// control (api/plans.ts DELETE + api/profile.ts DELETE), which deliberately
// leaves linked banks connected. This wipes everything about the caller's own
// account, including unlinking every Plaid connection at Plaid itself, and is
// meant to put a test account back through onboarding as if it had just
// signed up. Gated on `isDeveloperEmail`, same allowlist as the rest of the
// Developer tab, since every table touched here is scoped by the caller's own
// `user_id` anyway (a member calling this directly could only ever reset
// themselves); the gate hides a destructive control from people with no use
// for it, it is not what keeps anyone's data safe.
//
// The one rule every deletion below follows: only ever delete a row this user
// OWNS via its own `user_id` column, never a row that is jointly a partner's
// or a household's. A shared entity (a `shared_goals` row, a `households` row
// itself, another member's own rows) is left standing even if this account
// created it, and a relationship this account is one side of (an active
// partnership, a household membership) is ENDED through the same soft-delete
// convention the app already uses for leaving one deliberately
// (`partnerships.ended_at`, `household_members.left_at`), never hard-deleted
// out from under the other person.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { isDeveloperEmail } from "./_admin";
import { plaidConfigured, plaidFetch } from "./_plaid";
import { adminConfigured, adminRest } from "./_supabase-admin";

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

// Tables identifying a single owned row by `user_id` alone, safe to delete
// outright. Order doesn't matter: nothing here is a foreign key another row
// in this list depends on for its own deletion to succeed.
const OWNED_TABLES = [
  "transactions",
  "budgets",
  "net_worth_snapshots",
  "recurring_streams",
  "recurring_overrides",
  "recurring_amount_history",
  "score_history",
  "manual_accounts",
  "categories",
  "merchant_rules",
  "member_cards",
  "card_benefit_uses",
  "card_benefit_dismissals",
  "notifications",
  "chat_threads",
  "cancellation_requests",
  // This user's OWN sharing choices and messages inside a shared space, never
  // the shared entity itself (a `shared_goals` row has no `user_id`, and a
  // `shared_bills` row's `payer_user_id`/`created_by` are nullable references
  // rather than an owning column, so neither is touched here).
  "partner_sharing_prefs",
  "account_shares",
  "shared_goal_contributions",
  "shared_messages",
  "shared_reactions",
  "household_account_shares",
  "household_plan_shares",
  "plans",
] as const;

type PlaidItemRow = { item_id: string; access_token: string };
type Member = { id: string; household_id: string; role: string };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  if (!isDeveloperEmail(payload.email)) return json({ error: "Not available" }, 403);
  const uid = payload.sub;

  // Plaid first, and read-then-delete rather than one DELETE: the access
  // token has to reach Plaid's /item/remove before the row holding it is
  // gone, and a Plaid refusal is logged and swallowed (best-effort, same as
  // plaid/remove.ts) rather than blocking the rest of the reset. A bank that
  // refuses to unlink cleanly should not leave the account half wiped.
  const itemsRes = await adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,access_token`);
  const items = itemsRes.ok ? ((await itemsRes.json()) as PlaidItemRow[]) : [];
  if (plaidConfigured()) {
    await Promise.all(
      items.map((it) => plaidFetch("/item/remove", { access_token: it.access_token }).catch(() => undefined)),
    );
  }
  await adminRest(`plaid_items?user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

  await Promise.all(
    OWNED_TABLES.map((t) => adminRest(`${t}?user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })),
  );

  // End rather than delete: same convention the app's own "Disconnect" already
  // uses (api/partner.ts), so the other side of the partnership sees exactly
  // what they'd see if this member had disconnected normally.
  let partnershipEnded = false;
  const partnershipsRes = await adminRest(
    `partnerships?or=(inviter_id.eq.${uid},partner_id.eq.${uid})&status=eq.active&select=id`,
  );
  if (partnershipsRes.ok) {
    const active = (await partnershipsRes.json()) as { id: string }[];
    for (const p of active) {
      await adminRest(`partnerships?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
      });
      partnershipEnded = true;
    }
  }

  // Same soft-delete, mirroring api/household.ts's "leave" action exactly,
  // ownership handoff included: a household must never end up with nobody
  // owning it just because its owner reset their own account.
  let householdLeft = false;
  const memberRes = await adminRest(`household_members?user_id=eq.${uid}&left_at=is.null&select=id,household_id,role&limit=1`);
  if (memberRes.ok) {
    const mine = ((await memberRes.json()) as Member[])[0];
    if (mine) {
      await adminRest(`household_members?id=eq.${mine.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ left_at: new Date().toISOString() }),
      });
      householdLeft = true;
      if (mine.role === "owner") {
        const remainingRes = await adminRest(
          `household_members?household_id=eq.${mine.household_id}&left_at=is.null&select=id&order=joined_at.asc&limit=1`,
        );
        if (remainingRes.ok) {
          const next = ((await remainingRes.json()) as { id: string }[])[0];
          if (next) {
            await adminRest(`household_members?id=eq.${next.id}`, {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ role: "owner" }),
            });
          }
        }
      }
    }
  }

  // Last: everything above can still resolve `user_id` against a profile row
  // that no longer exists (adminRest doesn't care), but there's no reason to
  // race it.
  await adminRest(`user_profiles?user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

  return json({ ok: true, itemsUnlinked: items.length, partnershipEnded, householdLeft });
}
