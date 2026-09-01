// The two Overview widgets that summarize a surface owning its own page: Cards
// and rewards (Credit) and Recurring charges (Transactions). Both ship OFF, in
// the "Not on your Overview" shelf, because #251's rule is that a member who
// never arranges anything sees exactly the page they saw before.
//
// ── WHY THEY FETCH THEMSELVES, AND ONLY WHEN THEY ARE ON ───────────────────
//
// Both need an endpoint the Overview otherwise never calls. A widget in the
// shelf must cost nothing, so each hook takes `active` and does not fetch while
// it is false: the price of a widget is paid by the member who asked for it.
//
// They report `empty` upward rather than rendering an empty box, because the
// Overview has to know before it draws: a widget with nothing to say does not
// hold the slot the member gave it, and a titled card with nothing under it is
// the exact defect #198 removed from Budgets.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { fetchCardRewards, money0, type CardRewards } from "@/lib/cards";
import { linkedCards, manualCards, utilizationSummary, type CreditCardRow } from "@/lib/credit-cards";
import { fetchSubscriptions, type SubPayload } from "@/lib/subscriptions";
import { money2 } from "@/lib/txn-format";
import type { PlaidItem } from "@/lib/plaid";

// ── Cards and rewards ──────────────────────────────────────────────────────

export interface CardsWidgetData {
  loading: boolean;
  empty: boolean;
  rewards: CardRewards | null;
  cards: CreditCardRow[];
}

/**
 * The member's credit cards, merged the same way the Credit page merges them:
 * Plaid's snapshot for the bank-reported limits, /api/card-rewards for the
 * limits the member supplied (#211) and the cards they entered by hand (0046).
 *
 * `items` comes from the Overview's own fetchPlaidItems call, which it already
 * makes for institution art, so this widget adds one request and not two.
 */
export function useCardsWidget(active: boolean, items: PlaidItem[] | null): CardsWidgetData {
  const [rewards, setRewards] = useState<CardRewards | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchCardRewards().then((d) => {
      if (cancelled) return;
      setRewards(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active]);

  // Degrades rather than blocks, the same choice the Credit page makes: if
  // /api/card-rewards is unavailable the member-set limits go missing, every
  // card falls back to its bank-reported one, and utilization understates,
  // which is the safe direction. Holding the whole widget back on a second
  // request would blank the part that has always worked.
  const memberLimits = new Map<string, number>();
  for (const c of rewards?.cards ?? []) {
    if (c.member_limit != null) memberLimits.set(c.plaid_account_id, c.member_limit);
  }
  const cards: CreditCardRow[] = [
    ...linkedCards(items ?? []).map((c) => ({ ...c, memberLimit: memberLimits.get(c.key) ?? null })),
    ...manualCards(rewards?.manual ?? []),
  ];
  // Still loading while the Plaid items are in flight: `items` is null then, and
  // an empty card list would collapse the widget out of a layout the member
  // chose, only for it to reappear a moment later.
  const settled = !loading && items != null;
  return { loading: !settled, empty: settled && cards.length === 0, rewards, cards };
}

export function CardsWidget({ data }: { data: CardsWidgetData }) {
  const { rewards, cards } = data;
  const sum = utilizationSummary(cards);
  // The strongest single instruction the rewards engine produces: the category
  // the member spends most in, and which of their own cards pays best there.
  // Read from the guide the Credit page draws rather than recomputed, so the two
  // cannot name different cards. api/_rewards.ts orders it by their own spend.
  const tip = rewards?.guide?.find((g) => g.best != null) ?? null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Cards and rewards</h3>
        <Link href="/app/credit" className="link">Credit →</Link>
      </div>

      {sum ? (
        <>
          <div className="eyebrow">Utilization</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 4 }}>
            <span className="big-num tnum">{sum.used}%</span>
            <span style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginBottom: 6 }}>
              {money0(sum.balance, sum.currency)} of {money0(sum.limit, sum.currency)} across{" "}
              {sum.counted} {sum.counted === 1 ? "card" : "cards"}
              {sum.excluded > 0 && `, ${sum.excluded} more excluded for having no limit`}
            </span>
          </div>
          <div className="bar" style={{ height: 8, marginTop: 8 }}>
            <i style={{ width: `${Math.min(100, sum.used)}%`, background: sum.used > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} />
          </div>
          {/* THE CAVEAT TRAVELS WITH THE FIGURE. #251's rule: a widget the
              member can switch off must never be the only place a qualification
              is stated, and the inverse holds too, so the figure may not appear
              here without it. Same sentence the Credit page prints. */}
          {sum.memberSet > 0 && (
            <div className="cl-note">
              {sum.memberSet === 1
                ? "One of those limits is one you set rather than one your bank reported."
                : `${sum.memberSet} of those limits are ones you set rather than ones your bank reported.`}{" "}
              Your Juniper Score uses bank-reported limits only.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          None of your {cards.length === 1 ? "cards reports" : "cards report"} a credit limit, so there
          is nothing to measure a balance against. <Link href="/app/credit" className="link">Set one yourself</Link>.
        </div>
      )}

      {tip?.best && (
        <div className="ow-tip">
          <span className="ow-tip-c">{tip.categoryLabel}</span>
          <span>
            Pay with <b>{tip.best.productName}</b> for {tip.best.display}
            {tip.best.cap && <> · {tip.best.cap}</>}
          </span>
          {/* A rate in points is only comparable once a cents-per-point figure
              is applied, and that assumption is disclosed wherever the winner
              rests on it, here as on the Credit page. */}
          {tip.best.assumesPointValue && (
            <span className="ow-tip-n">Compared using Juniper's point value, not the issuer's.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recurring charges ──────────────────────────────────────────────────────

export interface RecurringWidgetData {
  loading: boolean;
  empty: boolean;
  payload: SubPayload | null;
}

export function useRecurringWidget(active: boolean): RecurringWidgetData {
  const [payload, setPayload] = useState<SubPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchSubscriptions().then((d) => {
      if (cancelled) return;
      setPayload(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active]);

  // Empty means Plaid has detected nothing at all. A member who has dismissed
  // everything is NOT empty: they made a decision, and a widget that vanished
  // because of it would hide the control that undoes it.
  return { loading, empty: !loading && (payload?.items.length ?? 0) === 0, payload };
}

export function RecurringWidget({ data }: { data: RecurringWidgetData }) {
  const s = data.payload?.summary;
  const items = data.payload?.items ?? [];
  const pending = items.filter((i) => i.review === "unreviewed" && i.direction === "outflow");

  return (
    <div className="card">
      <div className="card-head">
        <h3>Recurring charges</h3>
        <Link href="/app/transactions" className="link">Manage →</Link>
      </div>

      {s && s.confirmed > 0 ? (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <span className="big-num tnum">{money2(s.monthly)}</span>
            <span style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginBottom: 6 }}>
              a month from {s.confirmed} confirmed
            </span>
          </div>
          {/* Stated, not hidden, exactly as the full panel states it: a total
              that does not cover every charge on the list is worse than the gap
              itself when nothing says so. */}
          {s.unknownCadence > 0 && (
            <div className="cl-note">
              {s.unknownCadence} {s.unknownCadence === 1 ? "charge has" : "charges have"} no set schedule
              yet, so {s.unknownCadence === 1 ? "it is" : "they are"} not counted in this total.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          Nothing confirmed yet. Nothing counts toward a monthly total until you say it is real.
        </div>
      )}

      {pending.length > 0 && (
        <div className="ow-tip">
          <span>
            <b>{pending.length}</b> possible recurring {pending.length === 1 ? "charge" : "charges"} to review
          </span>
          <span className="ow-tip-n">Nothing here counts toward your total until you confirm it.</span>
        </div>
      )}
    </div>
  );
}
