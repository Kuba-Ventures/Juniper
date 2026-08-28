// GET /api/cron/daily-sync
//
// The dashboard refreshes itself when a member opens it, and there is no other
// trigger. A member who does not open the app for a week therefore has a week
// with no net-worth point and no score row, and those holes are permanent: both
// tables are keyed by (user, day), so a day nobody wrote is a day nobody can
// write later. The trend and the score history are the two things in Juniper
// that only exist if something records them daily.
//
// AUTH. Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
// invocation when that variable is set on the project, and this endpoint refuses
// everything else. With no CRON_SECRET set it refuses everyone, including Vercel:
// an unauthenticated endpoint that syncs arbitrary members on demand is worse
// than a cron that has not been switched on yet.
// Ops: set CRON_SECRET in the Vercel project, Production only.
//
// WHY IT DOES NOT MINT TOKENS. The three sync endpoints authenticate a member's
// JWT, and a cron has none. Rather than teach them a second way to be trusted,
// each one is split into a handler that establishes the caller and a run
// function that does the work for a user id. This calls those, so a scheduled
// refresh and a member-triggered one are the same code, not two implementations
// that drift.
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { plaidConfigured } from "../_plaid";
import { runTransactionsSync } from "../plaid/transactions-sync";
import { runNetworthSnapshot } from "../plaid/networth-snapshot";
import { runScoreCompute } from "../score/compute";

export const config = { runtime: "edge" };

const CRON_SECRET = readEnv("CRON_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Long enough that a member synced this morning is left alone, short enough that
// a daily cron always finds yesterday's members due. The client's own threshold
// is six hours (lib/auto-sync.ts); this is deliberately looser, because the cron
// exists to prevent empty days, not to keep data warm.
const STALE_HOURS = 20;

// The edge runtime kills a function that has not answered in 25 seconds, and one
// member with a dozen institutions can take most of ten. So the run works to a
// deadline and reports what it did not reach, rather than being killed halfway
// through with nothing written down.
const DEADLINE_MS = 18_000;
// Below this there is no point starting another member: the three legs would not
// finish, and a half-run member is worse than one left for tomorrow, because the
// snapshot would land without the transactions that inform the score.
const PER_MEMBER_MS = 6_000;
// A ceiling on rows read, not on members served. Today this is one member and a
// dozen items; the comment in the response says plainly when it is not enough.
const ITEM_SCAN_LIMIT = 1000;

type ItemRow = { user_id: string; last_synced_at: string | null };

// Constant time comparison. The secret is compared on every scheduled request,
// and a short circuit on the first differing byte is the classic way to let
// someone guess it one character at a time.
function secretMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!CRON_SECRET) return json({ error: "Cron not configured" }, 503);

  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!given || !secretMatches(given, CRON_SECRET)) return json({ error: "Unauthorized" }, 401);

  if (!adminConfigured() || !plaidConfigured()) return json({ error: "Not configured" }, 503);

  const startedAt = Date.now();
  const left = () => DEADLINE_MS - (Date.now() - startedAt);

  // One read of every linked item, then the grouping happens here. PostgREST has
  // no GROUP BY through this interface, and the alternative, a view or an RPC,
  // is a migration to answer a question this size.
  const itemsRes = await adminRest(
    `plaid_items?select=user_id,last_synced_at&order=last_synced_at.asc.nullsfirst&limit=${ITEM_SCAN_LIMIT}`,
  );
  if (!itemsRes.ok) {
    const detail = await itemsRes.text().catch(() => "");
    console.error(`[cron] daily-sync could not read items (${itemsRes.status}): ${detail}`);
    return json({ error: "Failed to read items" }, 500);
  }
  const rows = (await itemsRes.json().catch(() => [])) as ItemRow[];

  // A member is as stale as their STALEST connection, matching what
  // /api/finances reports to the client. Never synced sorts first, because that
  // is the case a background refresh exists for.
  const stalest = new Map<string, number>();
  for (const r of rows) {
    const t = r.last_synced_at ? Date.parse(r.last_synced_at) : 0;
    const at = Number.isNaN(t) ? 0 : t;
    const seen = stalest.get(r.user_id);
    if (seen === undefined || at < seen) stalest.set(r.user_id, at);
  }

  const cutoff = Date.now() - STALE_HOURS * 60 * 60 * 1000;
  const due = [...stalest.entries()]
    .filter(([, at]) => at < cutoff)
    .sort((a, b) => a[1] - b[1])
    .map(([userId]) => userId);

  const results: { user_id: string; transactions: number; networth: number; score: number }[] = [];
  let skipped = 0;

  for (const userId of due) {
    if (left() < PER_MEMBER_MS) { skipped = due.length - results.length; break; }
    // Ordered the way syncFinances orders them, and for its reason: transactions
    // and balances populate what the score reads, so scoring first would score
    // yesterday.
    const transactions = await runTransactionsSync(userId);
    const networth = await runNetworthSnapshot(userId);
    const score = await runScoreCompute(userId);
    results.push({
      user_id: userId,
      transactions: transactions.status,
      networth: networth.status,
      score: score.status,
    });
  }

  // Stated rather than silently dropped. A run that served three of forty
  // members and said "ok" would look like coverage, and the holes it is supposed
  // to prevent would go on appearing with nothing in the logs to explain them.
  if (skipped > 0) {
    console.warn(`[cron] daily-sync ran out of time with ${skipped} member(s) still due. They sort first tomorrow.`);
  }
  if (rows.length === ITEM_SCAN_LIMIT) {
    console.warn(`[cron] daily-sync read the full ${ITEM_SCAN_LIMIT} item scan limit, so some members were never considered.`);
  }

  return json({
    members_due: due.length,
    members_synced: results.length,
    members_skipped_for_time: skipped,
    items_scanned: rows.length,
    item_scan_truncated: rows.length === ITEM_SCAN_LIMIT,
    ms: Date.now() - startedAt,
    results,
  });
}
