// /api/subscriptions
//   GET                                          -> the member's recurring streams, with their own decisions applied
//   POST { stream_id, action, name?, expected_amount? }
//        action: confirm | dismiss | revert       -> write (or clear) their decision
//
// Reads the Plaid cache in `recurring_streams` and lays the member's own
// `recurring_overrides` on top. Those are two tables rather than one because
// Plaid deprecated `is_user_modified` and discontinued modifying streams, so a
// correction sent upstream has nowhere to live and would be lost the next time
// detection runs. Plaid generates candidates; Juniper owns the answer.
//
// THE RULE THIS ENDPOINT ENFORCES: nothing counts until the member confirms it.
// `monthly` is the total of CONFIRMED outflows only. What is still waiting is
// reported separately as `monthlyUnreviewed` so it is visible without being
// counted. Rocket Money auto-commits its detections and sweeps them to
// "Inactive" after one missed month with no documented way to dismiss one, and
// the reported result is a member surprised by a bill that was never flagged.
// Monarch quarantines detections behind a review step. This follows Monarch.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";

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

type StreamRow = {
  stream_id: string; item_id: string | null; account_id: string | null;
  description: string | null; merchant_name: string | null;
  category: string | null; category_id: string | null;
  plaid_status: string | null; frequency: string | null; direction: string;
  average_amount: number | null; last_amount: number | null;
  last_date: string | null; predicted_next_date: string | null;
  is_active: boolean; transaction_ids: string[];
};
type OverrideRow = { stream_id: string; state: string; name: string | null; expected_amount: number | null };

// How many times a year each cadence bills. UNKNOWN is deliberately absent
// rather than defaulting to monthly: a stream Plaid cannot put a cadence on
// cannot be converted into a monthly figure, and guessing "monthly" would
// silently add an annual charge to every month's total. Those streams are
// listed, and counted in `unknownCadence`, but never folded into `monthly`.
const PER_YEAR: Record<string, number> = {
  WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1,
};
const monthly = (amount: number | null, frequency: string | null): number | null => {
  const per = PER_YEAR[(frequency || "").toUpperCase()];
  if (amount == null || !per) return null;
  return (amount * per) / 12;
};

const CADENCE_LABEL: Record<string, string> = {
  WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly", ANNUALLY: "Yearly",
};

// An amount is "different from expected" only when it moves by BOTH a
// meaningful fraction and a meaningful number of dollars. A utility bill that
// swings 4% is not news, and neither is a 12% move on a $2 charge. Without both
// tests the whole list renders amber every month and the state stops meaning
// anything.
const AMOUNT_TOLERANCE = 0.05;
const AMOUNT_FLOOR = 1;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      stream_id?: string; action?: string; name?: string; expected_amount?: number | string | null;
    };
    const streamId = (body.stream_id || "").trim();
    const action = (body.action || "").trim();
    if (!streamId) return json({ error: "stream_id is required" }, 400);
    if (!["confirm", "dismiss", "revert"].includes(action)) {
      return json({ error: "action must be confirm, dismiss, or revert" }, 400);
    }

    // The stream has to be the caller's own. The service-role key bypasses RLS,
    // so this check is the access control, not a nicety: without it any
    // stream_id could be written an override row under this user.
    const owned = await adminRest(`recurring_streams?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}&select=stream_id&limit=1`);
    const ownedRows = owned.ok ? ((await owned.json()) as unknown[]) : [];
    if (!ownedRows.length) return json({ error: "Unknown stream" }, 404);

    if (action === "revert") {
      // Deleted, not flagged. Reverting has to restore the not-yet-reviewed
      // state exactly, and "no row" is what that state is.
      const del = await adminRest(`recurring_overrides?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
      if (!del.ok) return json({ error: "Failed to revert" }, 500);
      return json({ ok: true, state: null });
    }

    const rawExpected = body.expected_amount;
    const expected = rawExpected == null || rawExpected === "" ? null : Number(rawExpected);
    if (expected != null && (!Number.isFinite(expected) || expected < 0)) {
      return json({ error: "expected_amount must be a positive number" }, 400);
    }
    const row = {
      user_id: uid,
      stream_id: streamId,
      state: action === "confirm" ? "confirmed" : "dismissed",
      name: body.name?.trim() || null,
      expected_amount: expected,
      updated_at: new Date().toISOString(),
    };
    const up = await adminRest("recurring_overrides?on_conflict=user_id,stream_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([row]),
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      console.error(`[subscriptions] override write failed (${up.status}): ${detail}`);
      return json({ error: "Failed to save" }, 500);
    }
    return json({ ok: true, state: row.state });
  }

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const [sRes, oRes] = await Promise.all([
    adminRest(`recurring_streams?user_id=eq.${uid}&select=*&order=average_amount.desc`),
    adminRest(`recurring_overrides?user_id=eq.${uid}&select=stream_id,state,name,expected_amount`),
  ]);
  // A missing table reads as "nothing detected yet" rather than an error, so the
  // panel renders its empty state on a deploy where migration 0016 has not been
  // applied instead of showing the member a failure they cannot act on.
  const streams: StreamRow[] = sRes.ok ? await sRes.json() : [];
  const overrides: OverrideRow[] = oRes.ok ? await oRes.json() : [];
  const byStream = new Map(overrides.map((o) => [o.stream_id, o]));

  // Same merchant art the transactions list uses, so a subscription and the
  // charges behind it show the same mark. Plaid's recurring streams carry a
  // merchant name but no logo, so the cache filled by the transactions sync is
  // the only source, and it is the right one: they are the same merchants.
  const wanted = [...new Set(streams.map((x) => x.merchant_name).filter((m): m is string => !!m && m.length > 0))];
  const logoOf = new Map<string, string>();
  if (wanted.length) {
    const list = wanted.map((m) => `"${m.replace(/["\\]/g, "")}"`).join(",");
    const r = await adminRest(`merchant_logos?merchant_name=in.(${list})&select=merchant_name,logo_url`);
    if (r.ok) {
      const marks = (await r.json()) as { merchant_name: string; logo_url: string | null }[];
      for (const m of marks) if (m.logo_url) logoOf.set(m.merchant_name, m.logo_url);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // One resolve for the whole response, not one per stream. Stage 2 of
  // docs/CUSTOM_CATEGORIES.md.
  const tax = await taxonomyFor(uid);
  const items = streams.map((s) => {
    const o = byStream.get(s.stream_id);
    const review: "confirmed" | "dismissed" | "unreviewed" =
      o?.state === "confirmed" ? "confirmed" : o?.state === "dismissed" ? "dismissed" : "unreviewed";
    const status = (s.plaid_status || "UNKNOWN").toUpperCase();
    // What the member is owed an honest word for. EARLY_DETECTION is Plaid
    // saying it has seen this once or twice, so it renders as a possibility and
    // never as a fact. TOMBSTONED means the expected charge date passed and
    // nothing arrived, which is information, not a reason to delete the row.
    const confidence: "established" | "possible" | "missed" =
      status === "MATURE" ? "established" : status === "TOMBSTONED" ? "missed" : "possible";

    const expected = o?.expected_amount ?? s.average_amount;
    const last = s.last_amount;
    const drift = expected != null && last != null ? last - expected : null;
    const amountChanged =
      drift != null && expected != null && expected > 0 &&
      Math.abs(drift) > AMOUNT_FLOOR && Math.abs(drift) / expected > AMOUNT_TOLERANCE;

    // Tri-state, matching the only convention found in a shipped product:
    // paid as expected, paid at a DIFFERENT amount than expected, or expected
    // and never arrived. The middle state is the one that gets silently
    // swallowed elsewhere by just updating the stored amount.
    const health: "on_track" | "amount_changed" | "missed" | null =
      review !== "confirmed" ? null
        : confidence === "missed" ? "missed"
        : amountChanged ? "amount_changed"
        : "on_track";

    const perMonth = monthly(expected, s.frequency);
    // Id first, same as every other read since stage 3, so a stream and the
    // charges behind it name the category the same way after a rename.
    const cat = tax.classify(s.category_id, s.category);
    return {
      id: s.stream_id,
      name: o?.name || s.merchant_name || s.description || "Recurring charge",
      merchant: s.merchant_name,
      logo: s.merchant_name ? logoOf.get(s.merchant_name) ?? null : null,
      c: cat.c,
      g: cat.g,
      direction: s.direction === "inflow" ? "inflow" : "outflow",
      review,
      confidence,
      health,
      // Both, because they answer different questions: `expected` is what to
      // budget, `last` is what actually came out. Where they differ that IS the
      // story, so neither is dropped in favour of the other.
      expected,
      last,
      drift: amountChanged ? Math.round((drift ?? 0) * 100) / 100 : null,
      // Null whenever Plaid declined to predict one. Never filled in from the
      // cadence: a made-up date on the one screen that tells a member what is
      // about to leave their account is worse than no date.
      nextDate: s.predicted_next_date,
      overdue: !!s.predicted_next_date && s.predicted_next_date < today,
      lastDate: s.last_date,
      cadence: CADENCE_LABEL[(s.frequency || "").toUpperCase()] ?? "Irregular",
      // The client uses this to decide whether a per-month figure can be shown
      // at all, rather than rendering a number the server could not compute.
      perMonth: perMonth == null ? null : Math.round(perMonth * 100) / 100,
      // Set by the member, so the UI can offer "revert to what your bank says".
      edited: !!o && (o.name != null || o.expected_amount != null),
      // Free: Plaid returns the backing charges with the stream.
      charges: Array.isArray(s.transaction_ids) ? s.transaction_ids.length : 0,
    };
  });

  const out = items.filter((i) => i.direction === "outflow");
  const confirmed = out.filter((i) => i.review === "confirmed");
  const unreviewed = out.filter((i) => i.review === "unreviewed");
  const sumMonthly = (arr: typeof out) => Math.round(arr.reduce((a, i) => a + (i.perMonth ?? 0), 0));

  return json({
    items,
    summary: {
      // Confirmed only. This is the whole point of the review step.
      monthly: sumMonthly(confirmed),
      yearly: sumMonthly(confirmed) * 12,
      confirmed: confirmed.length,
      // Surfaced next to the total, never inside it.
      unreviewed: unreviewed.length,
      monthlyUnreviewed: sumMonthly(unreviewed),
      dismissed: out.filter((i) => i.review === "dismissed").length,
      // Confirmed streams whose cadence Plaid could not name, so they are in
      // the list but not in the monthly figure. Stated rather than hidden,
      // because an unexplained gap between a list and its total is worse than
      // the gap itself.
      unknownCadence: confirmed.filter((i) => i.perMonth == null).length,
      incoming: items.filter((i) => i.direction === "inflow").length,
    },
  });
}
