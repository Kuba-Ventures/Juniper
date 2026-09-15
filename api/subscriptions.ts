// /api/subscriptions
//   GET                                          -> the member's recurring streams, with their own decisions applied
//   POST { stream_id, action, name?, expected_amount?, frequency? }
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
//
// TWO KINDS OF STREAM PLAID NEVER GENERATES, ADDED HERE ALONGSIDE ITS OWN:
//
//   1. A JUNIPER SUGGESTION (`juniper:<merchantKey>`, api/_recurring-suggestions.ts).
//      Found live: a member's Ancestry and Apple subscriptions both clear
//      through a PayPal account rather than a direct card charge, and Plaid's
//      own detection never clustered either into a stream despite four clean
//      monthly charges sitting in `transactions`. Recomputed fresh on every
//      GET from the member's own transaction history (never stored itself),
//      merged into the same map() every real stream goes through, and laid
//      over `recurring_overrides` exactly like a Plaid stream: no decision
//      yet reads as a pending suggestion, confirmed or dismissed persists the
//      same way. A merchant Plaid already tracks is never re-proposed.
//   2. A MANUAL ENTRY (`manual:<uuid>`, minted by the client). For a charge
//      with no transaction pattern to find at all (paid in cash, or too new
//      to have repeated yet). Lives ONLY in `recurring_overrides`, since
//      `recurring_streams` is a cache Plaid's own sync overwrites wholesale
//      on every run and would delete a synthetic row it never returned.
//
// Both are told apart from a real Plaid stream by `origin`, computed from the
// id's prefix, which the client uses to badge either "Added by you" the same
// way a manual credit account already is elsewhere in this app.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";
import { isMeaningfulDrift } from "./_recurring-drift";
import { PER_YEAR, monthlyAmount } from "./_recurring-monthly";
import { findRecurringSuggestions, type SuggestionTxn } from "./_recurring-suggestions";

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
type OverrideRow = { stream_id: string; state: string; name: string | null; expected_amount: number | null; frequency: string | null };

// The cadences a member may set on a stream themselves (migration 0030). These
// are exactly the keys PER_YEAR can convert, deliberately: storing UNKNOWN would
// let somebody drop a charge out of their own total with nothing on the row to
// show they had, and "this is not really recurring" is what dismiss is for.
const SETTABLE_FREQUENCY = new Set(Object.keys(PER_YEAR));

const CADENCE_LABEL: Record<string, string> = {
  WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly", ANNUALLY: "Yearly",
};

// Plaid's `description` is the raw string the bank sent, which for a fee charged
// by the card issuer rather than a merchant arrives in capitals: "ANNUAL
// MEMBERSHIP FEE". It is only ever used when Plaid gave no merchant name, so
// there is no casing to preserve and nothing here can touch a name the member
// chose or a merchant Plaid enriched. Sentence case rather than title case
// because these strings are descriptions of a charge and not proper nouns, so
// "Annual membership fee" reads truer than "Annual Membership Fee"; the cost is
// that a genuinely brand-like description comes back as "Amazon prime".
function unshout(raw: string): string {
  const t = raw.trim();
  if (t.length < 2 || t !== t.toUpperCase() || !/\p{L}/u.test(t)) return t;
  return t.toLowerCase().replace(/\p{L}/u, (c) => c.toUpperCase());
}

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
      frequency?: string | null;
    };
    const streamId = (body.stream_id || "").trim();
    const action = (body.action || "").trim();
    if (!streamId) return json({ error: "stream_id is required" }, 400);
    if (!["confirm", "dismiss", "revert"].includes(action)) {
      return json({ error: "action must be confirm, dismiss, or revert" }, 400);
    }

    // A manual entry or a Juniper suggestion has no row in `recurring_streams`
    // to own: a manual one never did (it lives only in `recurring_overrides`),
    // and a suggestion is recomputed fresh from transactions on every GET
    // rather than stored. Both are still scoped to THIS caller regardless,
    // because the row written below always carries `user_id: uid` from the
    // verified JWT, never from anything the client sent. For a real Plaid
    // stream the ownership check stays load-bearing: without it, any
    // stream_id could be written an override row under this user.
    const isSynthetic = streamId.startsWith("manual:") || streamId.startsWith("juniper:");
    if (!isSynthetic) {
      const owned = await adminRest(`recurring_streams?user_id=eq.${uid}&stream_id=eq.${encodeURIComponent(streamId)}&select=stream_id&limit=1`);
      const ownedRows = owned.ok ? ((await owned.json()) as unknown[]) : [];
      if (!ownedRows.length) return json({ error: "Unknown stream" }, 404);
    }

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
    // Validated against the same five keys the CHECK constraint in 0030 names,
    // so a bad value is a 400 here rather than a 23514 from Postgres.
    const rawFreq = body.frequency;
    let frequency: string | null = null;
    if (rawFreq != null && rawFreq !== "") {
      const f = String(rawFreq).trim().toUpperCase();
      if (!SETTABLE_FREQUENCY.has(f)) {
        return json({ error: `frequency must be one of ${[...SETTABLE_FREQUENCY].join(", ")}` }, 400);
      }
      frequency = f;
    }
    // A manual entry has no Plaid-side name, amount, or cadence to fall back
    // on if the member's own is missing, unlike confirming a real stream or a
    // Juniper suggestion, both of which already carry a guess from the data
    // behind them. So creating one (the only manual action there is) requires
    // all three explicitly, rather than accepting nulls the way confirming an
    // existing stream can.
    if (streamId.startsWith("manual:") && action === "confirm") {
      if (!body.name?.trim() || expected == null || !frequency) {
        return json({ error: "A manual subscription needs a name, an amount, and a cadence" }, 400);
      }
    }
    // WHOLE ROW, EVERY TIME. `resolution=merge-duplicates` replaces the row it
    // conflicts with rather than patching it, so a caller sending only the field
    // it changed would silently clear the other two. Any client that edits one
    // of name, expected_amount or frequency has to send all three, which is why
    // the panel's save reads its own current values back into the request.
    const row = {
      user_id: uid,
      stream_id: streamId,
      state: action === "confirm" ? "confirmed" : "dismissed",
      name: body.name?.trim() || null,
      expected_amount: expected,
      frequency,
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

  const [sRes, oRes, iRes, hRes, tRes] = await Promise.all([
    adminRest(`recurring_streams?user_id=eq.${uid}&select=*&order=average_amount.desc`),
    adminRest(`recurring_overrides?user_id=eq.${uid}&select=stream_id,state,name,expected_amount,frequency`),
    // For the mark on a stream Plaid gave no merchant for. A fee charged by the
    // card issuer is not a merchant transaction, so `merchant_name` is null and
    // no amount of merchant art will ever cover it, but the bank behind it is
    // known: the stream carries `item_id` and `plaid_items` has held
    // `institution_name` since 0007. The client resolves that name through the
    // same institution chain Connections and Credit already use.
    adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,institution_name`),
    // Migration 0058. Ordered oldest first per stream so the client can render
    // it directly as a left-to-right timeline with no client-side sort.
    adminRest(`recurring_amount_history?user_id=eq.${uid}&select=stream_id,amount,observed_on&order=observed_on.asc`),
    // The member's own outflow history, for the Juniper-suggestion fallback
    // (_recurring-suggestions.ts). Outflow-only (`amount=gt.0`, Plaid's own
    // sign convention) and merchant-named, the same scope Plaid's own detector
    // works over; a blank-merchant fee or transfer is out of scope for either.
    adminRest(`transactions?user_id=eq.${uid}&amount=gt.0&merchant_name=not.is.null&select=id,merchant_name,amount,date`),
  ]);
  // A missing table reads as "nothing detected yet" rather than an error, so the
  // panel renders its empty state on a deploy where migration 0016 has not been
  // applied instead of showing the member a failure they cannot act on.
  const streams: StreamRow[] = sRes.ok ? await sRes.json() : [];
  const overrides: OverrideRow[] = oRes.ok ? await oRes.json() : [];
  const byStream = new Map(overrides.map((o) => [o.stream_id, o]));

  // Juniper's own fallback candidates, excluding any merchant Plaid already
  // clustered into a real stream so the two can never propose the same charge
  // twice. Recomputed fresh every request rather than stored: the source of
  // truth is `transactions`, which the member's own decision (an override row
  // keyed by the same `juniper:<merchantKey>` id) then lays over, same as a
  // real Plaid stream.
  const txnRows: { id: string; merchant_name: string; amount: number; date: string }[] = tRes.ok ? await tRes.json() : [];
  const plaidMerchantKeys = new Set(
    streams.map((s) => (s.merchant_name || "").trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean),
  );
  const suggestionTxns: SuggestionTxn[] = txnRows.map((t) => ({ id: t.id, merchantName: t.merchant_name, amount: t.amount, date: t.date }));
  const suggestions = findRecurringSuggestions(suggestionTxns, plaidMerchantKeys);
  const suggestionStreams: StreamRow[] = suggestions.map((sug) => ({
    stream_id: `juniper:${sug.merchantKey}`,
    item_id: null, account_id: null, description: null, merchant_name: sug.merchantName,
    category: null, category_id: null,
    // Never MATURE: this is Juniper's own guess, not Plaid's, and the client
    // routes on `origin` rather than this status anyway, but a suggestion that
    // has not yet been confirmed should still read as a possibility if it
    // somehow reaches anywhere that does look at confidence.
    plaid_status: "EARLY_DETECTION",
    frequency: "MONTHLY", direction: "outflow",
    average_amount: sug.averageAmount, last_amount: sug.lastAmount,
    last_date: sug.lastDate, predicted_next_date: null,
    is_active: true, transaction_ids: sug.transactionIds,
  }));

  // A manual entry has no backing stream at all; it exists purely because an
  // override row under a `manual:` id does. Reconstructed here, from that row
  // alone, so it flows through the exact same map() as everything else below.
  const manualStreams: StreamRow[] = overrides
    .filter((o) => o.stream_id.startsWith("manual:"))
    .map((o) => ({
      stream_id: o.stream_id,
      item_id: null, account_id: null, description: null, merchant_name: null,
      category: null, category_id: null,
      plaid_status: "MATURE", frequency: o.frequency, direction: "outflow",
      average_amount: o.expected_amount, last_amount: o.expected_amount,
      last_date: null, predicted_next_date: null,
      is_active: true, transaction_ids: [],
    }));

  const allStreams = [...streams, ...suggestionStreams, ...manualStreams];
  // A failed read costs a logo and nothing else, so it degrades rather than 500s.
  const instRows: { item_id: string; institution_name: string | null }[] = iRes.ok ? await iRes.json() : [];
  const instOf = new Map(instRows.filter((r) => r.institution_name).map((r) => [r.item_id, r.institution_name as string]));
  // Same degrade-rather-than-500 rule as everything else here: a deploy ahead
  // of migration 0058 shows no history, not a broken panel.
  const historyRows: { stream_id: string; amount: number; observed_on: string }[] = hRes.ok ? await hRes.json() : [];
  const historyOf = new Map<string, { amount: number; observedOn: string }[]>();
  for (const h of historyRows) {
    const list = historyOf.get(h.stream_id) ?? [];
    list.push({ amount: h.amount, observedOn: h.observed_on });
    historyOf.set(h.stream_id, list);
  }

  // Same merchant art the transactions list uses, so a subscription and the
  // charges behind it show the same mark. Plaid's recurring streams carry a
  // merchant name but no logo, so the cache filled by the transactions sync is
  // the only source, and it is the right one: they are the same merchants.
  const wanted = [...new Set(allStreams.map((x) => x.merchant_name).filter((m): m is string => !!m && m.length > 0))];
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
  const hueOfGroup = new Map(tax.groups.map((g) => [g.label, g.hue]));
  const items = allStreams.map((s) => {
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
    const amountChanged = isMeaningfulDrift(expected, last);

    // Tri-state, matching the only convention found in a shipped product:
    // paid as expected, paid at a DIFFERENT amount than expected, or expected
    // and never arrived. The middle state is the one that gets silently
    // swallowed elsewhere by just updating the stored amount.
    const health: "on_track" | "amount_changed" | "missed" | null =
      review !== "confirmed" ? null
        : confidence === "missed" ? "missed"
        : amountChanged ? "amount_changed"
        : "on_track";

    // The member's cadence beats Plaid's (0030). This is the field most worth
    // overriding: Plaid answers UNKNOWN whenever three charges were not enough
    // to be sure, and PER_YEAR cannot convert UNKNOWN, so those streams are
    // listed and left out of the total until somebody who knows says otherwise.
    const frequency = o?.frequency || s.frequency;
    const perMonth = monthlyAmount(expected, frequency);
    // Id first, same as every other read since stage 3, so a stream and the
    // charges behind it name the category the same way after a rename.
    const cat = tax.classify(s.category_id, s.category);
    const bankName = s.merchant_name || (s.description ? unshout(s.description) : null) || "Recurring charge";
    const origin: "plaid" | "juniper" | "manual" = s.stream_id.startsWith("manual:")
      ? "manual"
      : s.stream_id.startsWith("juniper:")
        ? "juniper"
        : "plaid";
    return {
      id: s.stream_id,
      origin,
      name: o?.name || bankName,
      merchant: s.merchant_name,
      logo: s.merchant_name ? logoOf.get(s.merchant_name) ?? null : null,
      // Only where Plaid named no merchant, which is the same gate the mark uses.
      // A Starbucks charge must not fall back to wearing the bank's logo just
      // because the card behind it is a Chase card; a fee charged BY Chase
      // should, because Chase is what it is.
      institution: s.merchant_name ? null : instOf.get(s.item_id ?? "") ?? null,
      c: cat.c,
      g: cat.g,
      hue: hueOfGroup.get(cat.g) ?? null,
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
      // Migration 0058, written only on a genuine move: a stream that has never
      // moved has an empty history, not a single point equal to the average.
      priceHistory: historyOf.get(s.stream_id) ?? [],
      // Null whenever Plaid declined to predict one. Never filled in from the
      // cadence: a made-up date on the one screen that tells a member what is
      // about to leave their account is worse than no date.
      nextDate: s.predicted_next_date,
      overdue: !!s.predicted_next_date && s.predicted_next_date < today,
      lastDate: s.last_date,
      cadence: CADENCE_LABEL[(frequency || "").toUpperCase()] ?? "Irregular",
      // Raw, for the cadence control to preselect. The label is for reading and
      // cannot be sent back, since "Irregular" is not a value Plaid or 0030 has.
      frequencyKey: SETTABLE_FREQUENCY.has((frequency || "").toUpperCase()) ? (frequency || "").toUpperCase() : null,
      // The client uses this to decide whether a per-month figure can be shown
      // at all, rather than rendering a number the server could not compute.
      perMonth: perMonth == null ? null : Math.round(perMonth * 100) / 100,
      // Set by the member, so the UI can offer "revert to what your bank says".
      edited: !!o && (o.name != null || o.expected_amount != null || o.frequency != null),
      // Free: Plaid returns the backing charges with the stream.
      charges: Array.isArray(s.transaction_ids) ? s.transaction_ids.length : 0,
      // THE TWO LAYERS, SEPARATELY, for the edit panel and nothing else. Every
      // field above is already resolved (the member's answer where they gave
      // one, the bank's otherwise), which is what a reader wants and exactly
      // what an EDITOR must not have: a form pre-filled from the resolved value
      // cannot tell "I chose $95" from "Plaid averaged $95", so saving a change
      // to the cadence would quietly write the average in as an explicit
      // expectation and freeze it there. With both layers sent, an empty field
      // means "use what my bank says" and a filled one is the member's own
      // answer, which is also the clearer thing to put on screen.
      own: {
        name: o?.name ?? null,
        expected: o?.expected_amount ?? null,
        frequency: o?.frequency ?? null,
      },
      bank: {
        name: bankName,
        expected: s.average_amount,
        cadence: CADENCE_LABEL[(s.frequency || "").toUpperCase()] ?? "Irregular",
      },
    };
  });

  const out = items.filter((i) => i.direction === "outflow");
  const confirmed = out.filter((i) => i.review === "confirmed");
  const unreviewed = out.filter((i) => i.review === "unreviewed");
  // Rounded to CENTS, not to whole dollars. It used to round to the nearest
  // dollar and then render with money2, so an $7.92 annual fee beside a $6.98
  // subscription summed to $14.90 and reported "$15.00": a total claiming a
  // precision it did not have, sitting directly above the two rows that
  // disproved it.
  const sumMonthly = (arr: typeof out) => Math.round(arr.reduce((a, i) => a + (i.perMonth ?? 0), 0) * 100) / 100;

  return json({
    items,
    summary: {
      // Confirmed only. This is the whole point of the review step.
      monthly: sumMonthly(confirmed),
      yearly: Math.round(sumMonthly(confirmed) * 12 * 100) / 100,
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
