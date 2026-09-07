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
import { limitFor, linkedCards, manualCards, utilizationSummary, type CreditCardRow } from "@/lib/credit-cards";
import { fetchSubscriptions, type SubItem, type SubPayload } from "@/lib/subscriptions";
import { fmtDay, money2 } from "@/lib/txn-format";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import { localBrandLogo } from "@/lib/institution-brand";
import { colorOf, paint } from "@/lib/category-color";
import type { PlaidItem } from "@/lib/plaid";
import { money, type ScoreImprovement } from "@/lib/mock-data";
import { timeAgo, type SyncState } from "@/lib/auto-sync";
import { usePartner } from "@/lib/partner";
import { cssVar } from "@/components/juniper/primitives";

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

/**
 * A small version of the Credit page's own card holder (rewards-guide.tsx):
 * the back-most and front-most cards only, in their real brand colors, so a
 * card reads the same color here as it does there. Only ever asked for two
 * cards; a member with one sees a single face at full brightness rather than
 * a dimmed "back" card with nothing behind it.
 */
function CardHolderMini({ cards }: { cards: CreditCardRow[] }) {
  const shown = cards.slice(0, 2);
  const palette = ["--jnpr-c3", "--jnpr-c5", "--jnpr-c1", "--jnpr-c4"];
  return (
    <div className="cw-holder">
      {shown.map((c, i) => (
        <div
          key={c.key}
          className={i === shown.length - 1 ? "cw-face b" : "cw-face a"}
          style={{ background: `var(${palette[i % palette.length]})` }}
        >
          <span className="brand">{c.institution.toUpperCase()}</span>
          <span className="fname">{c.name}</span>
        </div>
      ))}
    </div>
  );
}

export function CardsWidget({ data, size }: { data: CardsWidgetData; size: string }) {
  const { rewards, cards } = data;
  const sum = utilizationSummary(cards);

  if (size === "holder") {
    return (
      <div className="card">
        <div className="card-head">
          <h3>Cards and rewards</h3>
          <Link href="/app/credit" className="link">Credit →</Link>
        </div>
        {cards.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            No cards linked yet.
          </div>
        ) : (
          <>
            <CardHolderMini cards={cards} />
            <div className="cw-holder-cover">
              <div className="cw-cover-n">{cards.length} {cards.length === 1 ? "card" : "cards"}</div>
              <div className="cw-cover-u">
                {sum
                  ? `${sum.used}% utilized · ${money0(sum.balance, sum.currency)} of ${money0(sum.limit, sum.currency)}`
                  : "No limit reported yet"}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (size === "figures" || size === "bars") {
    const rated = cards
      .map((c) => ({ card: c, ...limitFor(c) }))
      .filter((r): r is typeof r & { limit: number } => r.limit != null);
    const maxLimit = Math.max(1, ...rated.map((r) => r.limit));
    return (
      <div className="card">
        <div className="card-head">
          <h3>Cards and rewards</h3>
          <Link href="/app/credit" className="link">Credit →</Link>
        </div>
        {rated.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            None of your {cards.length === 1 ? "cards reports" : "cards report"} a credit limit yet.
          </div>
        ) : size === "figures" ? (
          <div className="cw-lb-list">
            {rated.map((r) => (
              <div className="cw-lb-row" key={r.card.key}>
                <span className="nm">{r.card.name}</span>
                <span className="v"><b>{money0(r.card.balance, r.card.currency)}</b> of {money0(r.limit, r.card.currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cw-dbar">
            {rated.map((r) => (
              <div className="cw-dbar-row" key={r.card.key}>
                <div className="top">
                  <span className="nm">{r.card.name}</span>
                  <span className="v">{money0(r.card.balance, r.card.currency)} / {money0(r.limit, r.card.currency)}</span>
                </div>
                <div className="cw-dbar-track" style={{ width: `${(r.limit / maxLimit) * 100}%` }}>
                  <div className="cw-dbar-fill" style={{ width: `${Math.min(100, (r.card.balance / r.limit) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (size === "guide") {
    // Same guide the Credit page's rewards list is built from, shortened to
    // the member's top categories. api/_rewards.ts orders it by their own
    // spend, so the order here is the order there.
    const rows = (rewards?.guide ?? []).filter((g) => g.best != null).slice(0, 4);
    return (
      <div className="card">
        <div className="card-head">
          <h3>Cards and rewards</h3>
          <Link href="/app/credit" className="link">Credit →</Link>
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            Identify your cards on the Credit page to see a rewards guide here.
          </div>
        ) : (
          <div className="cw-guide">
            {rows.map((g) => (
              <div className="cw-g-row" key={g.categoryId}>
                <span className="cat">{g.categoryLabel}</span>
                <span className="card">
                  <b>{g.best!.productName}</b> · <span className="rate">{g.best!.display}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Stat, the shipped default: unchanged.
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

/** The mark the Subscriptions panel already draws for this row, at its own
 *  size and color, so a merchant reads the same in both places. */
function SubMark({ i }: { i: SubItem }) {
  return (
    <MerchantMark
      logo={i.logo ?? (i.institution ? localBrandLogo(i.institution) : null)}
      merchant={i.merchant} name={i.name} k={colorOf(i.g)} paint={paint(i.g, i.hue)}
    />
  );
}

export function RecurringWidget({ data, size }: { data: RecurringWidgetData; size: string }) {
  const s = data.payload?.summary;
  const items = data.payload?.items ?? [];
  const pending = items.filter((i) => i.review === "unreviewed" && i.direction === "outflow");
  const confirmedOut = items.filter((i) => i.review === "confirmed" && i.direction === "outflow");

  if (size === "list") {
    return (
      <div className="card">
        <div className="card-head">
          <h3>Recurring charges</h3>
          <Link href="/app/transactions" className="link">Manage →</Link>
        </div>
        {confirmedOut.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            Nothing confirmed yet.
          </div>
        ) : (
          <div className="rw-list">
            {confirmedOut.map((i) => (
              <div className="rw-row" key={i.id}>
                <SubMark i={i} />
                <div className="nm">
                  <div className="t">{i.name}</div>
                  <div className="s">{i.cadence}</div>
                </div>
                <div className="amt">
                  {i.perMonth != null ? `${money2(i.perMonth)}/mo` : i.expected != null ? money2(i.expected) : "Varies"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (size === "upcoming") {
    const dated = confirmedOut
      .filter((i) => i.nextDate != null)
      .map((i) => ({ i, days: Math.round((Date.parse(i.nextDate!) - Date.now()) / 86400000) }))
      .sort((a, b) => a.days - b.days);
    const soon = dated.filter((d) => d.days <= 7);
    const later = dated.filter((d) => d.days > 7);
    return (
      <div className="card">
        <div className="card-head">
          <h3>Recurring charges</h3>
          <Link href="/app/transactions" className="link">Manage →</Link>
        </div>
        {dated.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            Nothing with a known next charge date yet.
          </div>
        ) : (
          <>
            {soon.length > 0 && (
              <>
                <div className="rw-grp-lab">This week</div>
                {soon.map(({ i }) => (
                  <div className="rw-up-row" key={i.id}>
                    <div className="rw-up-date">{fmtDay(i.nextDate!)}</div>
                    <SubMark i={i} />
                    <div className="nm"><div className="t">{i.name}</div></div>
                    <div className="amt">{i.expected != null ? money2(i.expected) : "Varies"}</div>
                  </div>
                ))}
              </>
            )}
            {later.length > 0 && (
              <>
                <div className="rw-grp-lab">Later</div>
                {later.slice(0, 3).map(({ i }) => (
                  <div className="rw-up-row" key={i.id}>
                    <div className="rw-up-date">{fmtDay(i.nextDate!)}</div>
                    <SubMark i={i} />
                    <div className="nm"><div className="t">{i.name}</div></div>
                    <div className="amt">{i.expected != null ? money2(i.expected) : "Varies"}</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  if (size === "attention") {
    // Missed first (a stream the member expects that stopped showing up),
    // then a changed amount, then new candidates still waiting on a decision.
    // Same three states the full panel already separates by `health`/`review`.
    const missed = confirmedOut.filter((i) => i.health === "missed").map((i) => ({ i, flag: "missed" as const }));
    const changed = confirmedOut.filter((i) => i.health === "amount_changed").map((i) => ({ i, flag: "changed" as const }));
    const fresh = pending.map((i) => ({ i, flag: "new" as const }));
    const rows = [...missed, ...changed, ...fresh].slice(0, 4);
    return (
      <div className="card">
        <div className="card-head">
          <h3>Recurring charges</h3>
          <Link href="/app/transactions" className="link">Manage →</Link>
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            Nothing needs a look right now.
          </div>
        ) : (
          rows.map(({ i, flag }) => (
            <div className="rw-att-row" key={i.id}>
              <span className={`rw-flag ${flag}`}>{flag === "missed" ? "Missed" : flag === "changed" ? "Changed" : "New"}</span>
              <div className="nm">
                <div className="t">{i.name}</div>
                <div className="s">
                  {flag === "changed" && i.drift != null
                    ? `was ${money2((i.expected ?? 0) - i.drift)}, now ${money2(i.expected ?? 0)}`
                    : flag === "missed"
                      ? "expected, not seen"
                      : `${i.expected != null ? money2(i.expected) : "amount varies"}, looks recurring`}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (size === "wall") {
    return (
      <div className="card">
        <div className="card-head">
          <h3>Recurring charges</h3>
          <Link href="/app/transactions" className="link">Manage →</Link>
        </div>
        {confirmedOut.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
            Nothing confirmed yet.
          </div>
        ) : (
          <>
            <div className="rw-wall">
              {confirmedOut.map((i) => <SubMark i={i} key={i.id} />)}
            </div>
            {s && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--jnpr-ink-3)" }}>
                <b style={{ color: "var(--jnpr-ink)" }}>{money2(s.monthly)}</b>/mo across {s.confirmed} confirmed
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Stat, the shipped default: unchanged.
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

// ── Score levers ────────────────────────────────────────────────────────────
//
// The four widgets below are issue #290's "a few more could ship off in the
// shelf, roughly an hour each": each an existing component with a home page.
// Two of them (this one and Connection health) need no fetch of their own at
// all, because the figure they summarize is already part of the same
// /api/finances payload the Overview reads for its full-size widgets, so they
// cost nothing whether or not they are on. The other two (Benefits tracker,
// Together summary) do fetch, and take `active` the same way Cards and
// Recurring charges do.

export interface ScoreLeversWidgetData {
  empty: boolean;
  improvements: ScoreImprovement[];
}

/** No `active` gate: `improvements` is handed in from the Overview's own
 *  `data.score`, already fetched for the full Score widget, so there is
 *  nothing here to switch off. */
export function useScoreLeversWidget(improvements: ScoreImprovement[]): ScoreLeversWidgetData {
  return { empty: improvements.length === 0, improvements };
}

export function ScoreLeversWidget({ data }: { data: ScoreLeversWidgetData }) {
  const top = [...data.improvements].sort((a, b) => b.potentialPts - a.potentialPts).slice(0, 3);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Score levers</h3>
        <Link href="/app/score" className="link">Score →</Link>
      </div>
      {top.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          You're firing on all cylinders, no weak spots to shore up right now.
        </div>
      ) : (
        <div className="cw-guide">
          {top.map((im) => (
            <div className="cw-g-row" key={im.factor}>
              <span className="cat">{im.title}</span>
              <b style={{ fontSize: 12.5, color: "var(--jnpr-good)" }}>+{im.potentialPts} pts</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connection health ────────────────────────────────────────────────────────

export interface ConnectionHealthWidgetData {
  empty: boolean;
  connections: number;
  needsRelink: { institution: string; since: string | null }[];
  syncedAt: string | null;
}

/** Also free: `sync` is the same object Connections itself reads off
 *  /api/finances (lib/finances.ts), computed server-side with no Plaid call. */
export function useConnectionHealthWidget(sync: SyncState | undefined): ConnectionHealthWidgetData {
  return {
    empty: !sync || sync.connections === 0,
    connections: sync?.connections ?? 0,
    needsRelink: sync?.needsRelink ?? [],
    syncedAt: sync?.syncedAt ?? null,
  };
}

export function ConnectionHealthWidget({ data }: { data: ConnectionHealthWidgetData }) {
  const ago = timeAgo(data.syncedAt);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Connection health</h3>
        <Link href="/app/connections" className="link">Connections →</Link>
      </div>
      {data.needsRelink.length > 0 ? (
        <>
          <div className="eyebrow">Needs a look</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 4 }}>
            <span className="big-num tnum" style={{ color: "var(--jnpr-bad)" }}>{data.needsRelink.length}</span>
            <span style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginBottom: 6 }}>
              {data.needsRelink.length === 1 ? "connection needs" : "connections need"} reconnecting
            </span>
          </div>
          <div className="ow-tip">
            <span>{data.needsRelink.map((n) => n.institution).join(", ")}</span>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <span className="big-num tnum">{data.connections}</span>
          <span style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginBottom: 6 }}>
            {data.connections === 1 ? "connection" : "connections"}, all healthy{ago ? ` · updated ${ago}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Benefits tracker ─────────────────────────────────────────────────────────

export interface BenefitsWidgetData {
  loading: boolean;
  empty: boolean;
  rewards: CardRewards | null;
}

/** Same /api/card-rewards call `useCardsWidget` makes, independently gated:
 *  a member with both widgets on pays for two requests rather than one, the
 *  same tradeoff Cards and Recurring charges already accept by each owning
 *  their own fetch rather than sharing one. */
export function useBenefitsWidget(active: boolean): BenefitsWidgetData {
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

  return {
    loading,
    empty: !loading && (!rewards?.benefits || rewards.benefits.total === 0),
    rewards,
  };
}

export function BenefitsWidget({ data }: { data: BenefitsWidgetData }) {
  const summary = data.rewards?.benefits ?? null;
  const identified = data.rewards?.cards.filter((c) => c.product) ?? [];
  const currency = identified[0]?.currency ?? null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Benefits tracker</h3>
        <Link href="/app/credit" className="link">Credit →</Link>
      </div>
      {!summary || summary.total === 0 ? (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          Identify your cards on the Credit page to track their benefits here.
        </div>
      ) : (
        <>
          <div className="eyebrow">Ticked off this period</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 4 }}>
            <span className="big-num tnum">{summary.usedCount}</span>
            <span style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginBottom: 6 }}>
              of {summary.total} from your {identified.length} {identified.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <div className="bar" style={{ height: 8, marginTop: 8 }}>
            <i style={{ width: `${Math.round((summary.usedCount / summary.total) * 100)}%`, background: "var(--jnpr-accent)" }} />
          </div>
          {summary.unusedValue > 0 && (
            <div className="ow-tip">
              <span>
                <b>{money0(summary.unusedValue, currency)}{summary.valuePartial ? "+" : ""}</b> in unused credits this period
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Together summary ────────────────────────────────────────────────────────

export interface TogetherWidgetData {
  loading: boolean;
  empty: boolean;
  connected: boolean;
  total: number;
  youShare: number;
  partnerShare: number;
  partnerName: string | null;
}

/** `usePartner(active)` only starts its fetch once `active` is true (see
 *  lib/partner.ts): a member who never turns this widget on, and one who has
 *  no partner at all, never sends /api/partner from the Overview. */
export function useTogetherWidget(active: boolean): TogetherWidgetData {
  const { data, loading } = usePartner(active);
  const connected = !!data?.connected;
  const combined = data?.combined;
  return {
    loading: active && loading,
    empty: active && !loading && (!connected || !combined || combined.netWorth === 0),
    connected,
    total: combined?.netWorth ?? 0,
    youShare: combined?.youShare ?? 0,
    partnerShare: combined?.partnerShare ?? 0,
    partnerName: data?.partner?.name ?? null,
  };
}

export function TogetherWidget({ data }: { data: TogetherWidgetData }) {
  const name = data.partnerName ?? "your partner";
  const yShare = data.total ? Math.round((data.youShare / data.total) * 100) : 0;
  const pShare = data.total ? 100 - yShare : 0;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Together summary</h3>
        <Link href="/app/shared" className="link">Together →</Link>
      </div>
      {!data.connected ? (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          Invite a partner to see your combined total here.
        </div>
      ) : data.total === 0 ? (
        <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", lineHeight: 1.55 }}>
          Neither of you is sharing a balance yet.
        </div>
      ) : (
        <>
          <div className="eyebrow">Together</div>
          <div className="big-num tnum" style={{ margin: "4px 0 8px" }}>{money(data.total)}</div>
          <div className="split-bar">
            <i style={{ width: `${yShare}%`, background: cssVar("--jnpr-c3") }} />
            <i style={{ width: `${pShare}%`, background: cssVar("--jnpr-c5") }} />
          </div>
          <div className="split-legend">
            <span><span className="dot" style={{ background: cssVar("--jnpr-c3") }} /> You · <b className="tnum">{money(data.youShare)}</b></span>
            <span><span className="dot" style={{ background: cssVar("--jnpr-c5") }} /> {name} · <b className="tnum">{money(data.partnerShare)}</b></span>
          </div>
        </>
      )}
    </div>
  );
}
