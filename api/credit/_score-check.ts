// The Stage 10e monthly cron leg: detect a bureau-score CHANGE for a
// consented member and, when one exists, insert a notification directly.
// This is the one notification kind that bypasses the client-reconcile flow
// every other kind goes through (src/lib/notifications.ts posts a set of
// currently-true facts on every load) -- see migration 0066's header for
// exactly why: whether a score changed can only be known by comparing two
// pulls over time, which is state only the server holds
// (credit_consents.last_score), not something a client read can derive by
// itself in one shot.
//
// No notification on a member's very FIRST pull (row.last_score is null):
// there is nothing to compare against yet, and "your score is now 691" reads
// as an alert about nothing. The first pull only ever sets the baseline.
import { adminRest } from "../_supabase-admin";
import { pullCreditScore } from "../_credit-provider";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type ConsentRow = { user_id: string; spinwheel_user_id: string; last_score: number | null };

export async function runCreditScoreCheck(userId: string): Promise<Response> {
  const res = await adminRest(
    `credit_consents?user_id=eq.${userId}&select=user_id,spinwheel_user_id,last_score&limit=1`,
  );
  if (!res.ok) return json({ error: "Failed to read consent" }, 500);
  const rows = (await res.json().catch(() => [])) as ConsentRow[];
  const row = rows[0];
  if (!row) return json({ checked: false, reason: "not consented" });

  const result = await pullCreditScore(row.spinwheel_user_id);
  if ("failed" in result) return json({ checked: false, reason: `pull failed (${result.status})` });

  const changed = row.last_score != null && row.last_score !== result.score;

  const patch = await adminRest(`credit_consents?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ last_score: result.score, last_score_at: new Date().toISOString() }),
  });
  if (!patch.ok) return json({ error: "Failed to save baseline" }, 500);

  if (changed) {
    const direction = result.score > (row.last_score as number) ? "up" : "down";
    const notif = await adminRest("notifications?on_conflict=user_id,dedupe_key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([
        {
          user_id: userId,
          kind: "score_change",
          dedupe_key: `score:${result.score}:${result.asOf}`,
          title: direction === "up" ? "Your credit score went up" : "Your credit score went down",
          detail: `${row.last_score} → ${result.score} (VantageScore 3.0, ${result.sourceBureau})`,
          href: "/app/credit",
          status: "active",
        },
      ]),
    });
    if (!notif.ok) return json({ error: "Failed to write notification" }, 500);
  }

  return json({ checked: true, changed, score: result.score });
}
