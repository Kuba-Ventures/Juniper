import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CreditCard as CardIcon } from "lucide-react";
import { PageHeader } from "@/components/juniper/app-frame";
import { fetchInstitutionLogos, fetchPlaidItems, type InstitutionBrandMap, type PlaidItem } from "@/lib/plaid";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import {
  forgetCard, setCardLimit, useCardRewards, type CardRewards, type LinkedCard as RewardsCard,
} from "@/lib/cards";
import {
  limitFor, linkedCards, manualCards, utilizationSummary, type CreditCardRow as LinkedCard,
} from "@/lib/credit-cards";
import { creditPosition, utilizationPct } from "@/lib/credit-balance";
import { CardIdentifyPrompt } from "@/components/juniper/card-identify";
import { CardWallet } from "@/components/juniper/card-wallet";
import { RewardsGuide, RewardsSummaryCharts } from "@/components/juniper/rewards-guide";
import { BenefitsTracker } from "@/components/juniper/benefits-tracker";
import { CardSwitches } from "@/components/juniper/card-switches";
import type { HolderStyle } from "@/lib/holder-style";

// The Credit tab shows only what Juniper actually holds: the credit-card accounts
// the member linked through Plaid, their balances, and their limits. Everything
// else this page used to claim was seeded demo data (a 726 score, a band, an
// eight-month trend, bureau-style factor rows, "refreshed monthly through a
// credit-data provider, soft pull") presented as the member's own. No credit-data
// provider is integrated anywhere in this codebase, so none of that had a source,
// and a fabricated score is the single most damaging thing to get wrong on a money
// product. Score monitoring is Stage 10 in ROADMAP.md; until a provider is under
// contract this page says so plainly instead of drawing a number.
//
// Deliberately reads accounts via fetchPlaidItems() (GET /api/plaid/accounts, the
// stored sanitized snapshot) rather than useFinances(), even though the house rule
// is to route money features through the lib/finances.ts seam. The original reason
// is gone: api/finances.ts no longer withholds everything until transactions exist,
// it gates per section, so balances arrive for a member whose card has no feed yet.
// One reason remains, and it is why this page still has its own data path: the
// /api/finances account rollup carries name/institution/balance only, and
// utilization needs each card's `limit`, which lives on the stored snapshot this
// endpoint returns. Collapsing onto useFinances() means widening that rollup first.
//
// APR is not shown. Plaid only returns card APRs under the `liabilities` product,
// and PLAID_PRODUCTS is `transactions` (see api/_plaid.ts), so there is no honest
// source for a rate. The old page printed one anyway.
//
// ── THE REWARDS SURFACE BELOW (issue #168) ─────────────────────────────────
//
// Treatment A of three, rendered in design/card-rewards-variants.html: identify
// each card, then a per-category earning guide, a benefits checklist, and what
// the wrong card is costing. It reads ONE endpoint, /api/card-rewards, which
// computes all of it server-side through the pure api/_rewards.ts (checked by
// scripts/src/check-rewards.ts). Nothing on the client does rewards arithmetic,
// so there is no second answer to "what is this worth a year".
//
// THREE FETCHES ON THIS PAGE, AND EACH ONE EARNS ITS PLACE, which is worth
// saying because it looks like sloppiness:
//   - fetchPlaidItems, for the balances and LIMITS the utilization card needs
//     (the reason for the exception documented above).
//   - fetchInstitutionLogos, for the marks, which is a separate endpoint by
//     design so it can be cached per institution and fail silently.
//   - /api/card-rewards, which needs the member's taxonomy, their per-account
//     spend and the catalog joined together, none of which the other two carry.
// Collapsing them means widening the /api/finances rollup with `limit` and with
// per-account spend, which is the follow-up this page has been waiting on since
// #132 and is deliberately not attempted here.
//
// ── CARDS THE MEMBER ENTERED BY HAND (migration 0046) ──────────────────────
//
// Some credit cards can NEVER arrive through Plaid, however many times somebody
// relinks. The case that forced this: a card issued to the member as an
// authorized user on another person's login. Plaid returns only the accounts
// belonging to the login it authenticates, so no credential the member holds will
// ever surface it. Credit Karma and the issuer's own site show it because they
// read credit-bureau data, and Juniper has no bureau feed (ROADMAP.md Stage 10).
//
// That made this page's utilization WRONG rather than merely incomplete, because
// a limit missing from the denominator makes the percentage too HIGH: 3 percent
// here against 1.5 percent on the member's own credit report, on the same
// balance. So a manual credit account with a limit is folded into the card list
// and the utilization figure, carrying LIMIT AND BALANCE and nothing else.
//
// It gets no product, no rates, no benefits and NO PLACE IN THE IDENTIFY PROMPT,
// because all of those key on a `plaid_account_id` a hand-entered account does
// not have, and none of them could say anything true about a card Juniper knows
// only the limit of. It is badged "You added this", distinct from #211's "You set
// this", which means a member-supplied limit on a BANK-LINKED card.
//
// AND IT MUST NOT REACH THE JUNIPER SCORE. Same rule as #211's member limits, and
// the sentence under the utilization figure says so on screen. A limit somebody
// typed is a claim; the Score is a figure Juniper asserts from what it can
// measure, and a member able to move it by typing a bigger number would be
// scoring themselves. The isolation is structural, not a convention: the column
// is absent from the shared `fetchManualAccounts` select the score path reads.
// See api/_manual-accounts.ts and migration 0046.
//
// The rewards sections render NOTHING until a card is identified, and that is not
// an empty state, it is the honest one: Plaid does not say which product an
// account is, so until the member confirms, Juniper has no rates to show and says
// so through the identify prompt instead of guessing. See card-identify.tsx.

// The row shape, the two projections into it, and the limit precedence all
// live in lib/credit-cards.ts now, because the Overview's Cards and rewards
// widget is a shorter version of this page and the two must not be able to
// disagree about a percentage. See that file's header.

const money = (n: number, currency: string | null): string => {
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
};

// THE PROVENANCE BADGE, and it is the load-bearing piece of both features rather
// than decoration: a number somebody typed must never be indistinguishable from
// one their bank reported.
//
// TWO different member-supplied cases, and they are not the same claim, so they
// do not share a label. "You set this" (#211) is a limit the member typed for a
// card their BANK reports, where Juniper can see the account and only the limit
// was missing. "You added this" (0046) is a whole card Juniper cannot see at all,
// where the member is the source of the account's existence as well as its limit.
// Collapsing them would tell somebody their linked card was hand-entered.
const limitBadge = (c: LinkedCard, source: string): string | null => {
  if (c.origin === "manual") return "You added this";
  return source === "member" ? "You set this" : null;
};

// Kept as a thin alias so every call site reads the same, and so the clamping and
// the null-for-no-limit rule live in one place. See lib/credit-balance.ts.
const pct = (owed: number, limit: number) => utilizationPct(owed, limit) ?? 0;

// The factors a real score is built from, named so the not-live panel is specific
// about what is coming rather than vaguely promising "credit features".
//
// FOUR, not five, and that is a statutory cap rather than a layout choice.
// 15 U.S.C. 1681g(f) and Cal. Civ. Code 1785.15.1 both require that a disclosed
// score come with AT MOST FOUR adverse key factors, ordered by importance, per
// model. This list is illustrative today because no score is displayed, but the
// moment a real one is, the live component must render the provider's own
// ordered factors and must not exceed four. Do not grow this array.
const PLANNED_FACTORS = [
  "Utilization",
  "On-time payments",
  "Age of credit",
  "Inquiries",
];

function ScorePending() {
  return (
    <div className="card pad-lg" style={{ marginBottom: 16 }}>
      <div className="eyebrow">Credit score</div>
      <h3 style={{ fontSize: 15, marginTop: 7 }}>Not tracked yet</h3>
      {/* Deliberately names no score model. An earlier version promised "FICO 8 and
          VantageScore 3.0" together, and research since (see docs/CREDIT_PROVIDER.md)
          found that pairing may be barred by FICO's Open Access license, which
          forbids disclosing any other score to consumers alongside a FICO score in
          that program. Across eighteen consumer products checked, none showed both.
          Until a provider agreement settles it in writing, promising both is a
          promise we may not be able to keep, so the copy commits to a bureau score
          and to the factors, which are safe either way. */}
      <p className="cs-note">
        Juniper does not read your credit score, and nothing on this page is one. Score tracking is
        planned: a real bureau score, alongside the factors that move it. It needs a credit-data
        provider under contract first, so there is no date to give you.
      </p>
      <div className="cs-chips">
        {PLANNED_FACTORS.map((f) => <span key={f}>{f}</span>)}
      </div>
    </div>
  );
}

function CardsEmpty() {
  return (
    <div className="card nudge-card">
      <div className="nc-mark"><CardIcon /></div>
      <h3>No credit cards linked</h3>
      <p>Connect a card and Juniper shows its balance, its limit, and how much of that limit you are using.</p>
      <Link href="/app/connections" className="btn" style={{ marginTop: 4 }}>Connect a card</Link>
    </div>
  );
}

function OverallUtilization({ cards }: { cards: LinkedCard[] }) {
  // Only cards with a known limit can be part of a utilization figure. Folding in
  // a card with an unknown limit either understates the ratio (limit treated as 0
  // and dropped from the denominator) or invents one, so it is excluded and the
  // exclusion is stated.
  //
  // Since #211 "known" includes a limit the MEMBER supplied, and the count of
  // those is stated too. A percentage built partly from numbers somebody typed is
  // only as good as what they typed, and a member who has forgotten they set one
  // would otherwise have no way to know this figure rests on it.
  //
  // Since 0046 that count also includes cards the member entered by hand, which
  // are member-supplied end to end. They are counted TOGETHER in one sentence
  // rather than in two, because the disclosure the member needs from this figure
  // is a single fact ("some of this rests on your own numbers"); the per-card rows
  // below are where the two cases are told apart.
  const sum = utilizationSummary(cards);
  if (!sum) {
    return (
      <div className="util-hero">
        <div>
          <div className="eyebrow">Overall utilization</div>
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", marginTop: 6, maxWidth: "48ch", lineHeight: 1.55 }}>
            None of your cards report a credit limit, so there is nothing to measure a balance
            against. Refreshing your data on Connections re-reads limits from your bank, and you can
            set a limit yourself on any card below.
          </div>
        </div>
      </div>
    );
  }
  const { balance, limit, used, currency, counted, excluded, memberSet } = sum;
  return (
    <div className="util-hero">
      <div>
        <div className="eyebrow">Overall utilization</div>
        <div className="big tnum">{used}%</div>
        <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 2 }}>
          {money(balance, currency)} of {money(limit, currency)} across {counted}{" "}
          {counted === 1 ? "card" : "cards"}
          {/* "reporting no limit" was true when every card on this page came from a
              bank. A hand-entered card has nothing reporting anything, so the
              phrasing is about the ABSENCE of a limit rather than about a bank
              failing to send one. This is not hypothetical: production already
              holds four manual credit accounts, none of them with a limit yet, so
              this line would have blamed four banks for a field the member has
              simply not filled in. */}
          {excluded > 0 && `, ${excluded} more excluded for having no limit`}
        </div>
        {memberSet > 0 && (
          <div className="cl-note">
            {memberSet === 1
              ? "One of those limits is one you set rather than one your bank reported."
              : `${memberSet} of those limits are ones you set rather than ones your bank reported.`}{" "}
            Your Juniper Score uses bank-reported limits only.
          </div>
        )}
      </div>
      <div className="ub">
        <div className="bar" style={{ height: 10 }}>
          <i style={{ width: `${Math.min(100, used)}%`, background: used > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 7 }}>
          Scoring models generally favor staying under 30% of your limit.
        </div>
      </div>
    </div>
  );
}

// The issuer's own mark, resolved the same way the Connections list does it:
// Plaid's logo, then bundled brand art, then a monogram tinted with the issuer's
// brand color. The old flat "C on a coral tile" was the account's first letter,
// which never matched anything.
function CardMark({ card, brands }: { card: LinkedCard; brands: InstitutionBrandMap | null }) {
  const brand = card.institutionId ? brands?.[card.institutionId] : null;
  const mark = resolveInstitutionMark(card.institution, brand);
  if (mark.kind === "logo") return <img className="blogo" src={mark.src} alt="" />;
  if (mark.kind === "monogram") {
    return (
      <div className="tile" style={{ background: mark.background, color: mark.color }}>
        {mark.letter}
      </div>
    );
  }
  return (
    <div className="tile" style={{ background: "var(--jnpr-c4)" }}>
      {(card.institution[0] || "C").toUpperCase()}
    </div>
  );
}

/**
 * The inline "what is the limit on this card?" editor (#211, treatment A of
 * three, rendered in design/credit-limit-variants.html).
 *
 * It sits on the row that states the gap, which is the point of treatment A: the
 * member is looking at this card's name and mask while they type, and that is
 * what stops them entering the Chase limit against the Capital One row.
 *
 * Uncontrolled-ish on purpose: the field holds a raw string, commas and dollar
 * sign included, because that is what somebody reads off a statement. Parsing
 * happens server-side so there is ONE definition of what counts as a number
 * rather than a client regex and a server regex free to drift.
 */
function LimitForm({
  card, onSaved, onCancel,
}: {
  card: LinkedCard;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(card.memberLimit != null ? String(card.memberLimit) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const ok = await setCardLimit(card.key, value);
    setBusy(false);
    if (!ok) { setError("Could not save that. Check the number and try again."); return; }
    onSaved();
  };

  return (
    <>
      <div className="cl-form">
        <span className="cl-cur">$</span>
        <input
          className="cl-in"
          type="text"
          inputMode="numeric"
          value={value}
          placeholder="8,000"
          aria-label={`Credit limit for ${card.institution} ${card.name}`}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") onCancel(); }}
          autoFocus
        />
        <button type="button" className="cl-btn" disabled={busy} onClick={() => void save()}>Save</button>
        <button type="button" className="cl-btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        {/* Clearing is offered only once there is something to clear, and it is
            the honest inverse of setting one: the member is saying they no longer
            stand behind the number, so the card goes back to being excluded from
            utilization rather than keeping a figure nobody vouches for. */}
        {card.memberLimit != null && (
          <button
            type="button"
            className="cl-btn ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await setCardLimit(card.key, null);
              setBusy(false);
              if (ok) onSaved(); else setError("Could not remove that.");
            }}
          >
            Remove
          </button>
        )}
      </div>
      <div className="cl-hint">
        The limit printed on your statement or in your issuer's app. Juniper cannot read it, so this is
        your number and it is labelled as yours wherever it appears. It does not affect your Juniper Score.
      </div>
      {error && <div className="cl-err">{error}</div>}
    </>
  );
}

function CardRow({
  card, brands, identified, onChange, onLimitChanged,
}: {
  card: LinkedCard;
  brands: InstitutionBrandMap | null;
  /** What the member said this card is, once they have said. Null covers both
      "not asked yet" and "they told us it is not in the catalog", which the
      identify prompt above already distinguishes; on this row the only useful
      thing to draw is a product name or nothing. */
  identified: string | null;
  /** Undo the identification, which puts the card back in the identify queue.
      This exists because the picker is a member's answer and a member can get it
      wrong: two Chase cards with the same mask-less "CREDIT CARD" name are easy
      to mix up, and without a way back the wrong rates would sit on their
      spending permanently, quoting confident figures off the wrong product. */
  onChange: () => void;
  /** A limit was set, cleared or changed, so the page needs to re-read. */
  onLimitChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { limit, source } = limitFor(card);
  const badge = limitBadge(card, source);
  const used = limit != null ? pct(card.balance, limit) : null;
  return (
    <div className="card-row">
      <CardMark card={card} brands={brands} />
      <div className="ci">
        <div className="cn">{card.institution} · {card.name}</div>
        <div className="csub">
          {card.mask && <>····{card.mask} · </>}
          {/* A card in credit is not debt, and saying "$328 owed" about a refund is
              the kind of specific, confident wrongness this page exists to avoid.
              The amount still shows, because the member wants to know it is there. */}
          {/* "not reported" is only true of a LINKED card: on a hand-entered one
              there is no bank reporting anything, and blaming the absence on a
              report the member never expected reads as a fault rather than as a
              field they have not filled in. */}
          {card.inCredit > 0
            ? <><b>{money(card.inCredit, card.currency)} in credit</b>{limit != null
                ? <> of a {money(limit, card.currency)} limit</>
                : card.origin === "manual" ? <>, no limit added</> : <>, limit not reported</>}</>
            : <>{money(card.balance, card.currency)}{limit != null
                ? <> of {money(limit, card.currency)} limit</>
                : card.origin === "manual" ? <> owed, no limit added</> : <> owed, limit not reported</>}</>}
          {/* THE BADGE IS NOT DECORATION. A number the member typed must never be
              indistinguishable from one their bank reported: the first is a claim
              and the second is a fact, and a utilization built on a mix of them is
              only as good as the claim. Two member-supplied cases, two labels: see
              `limitBadge`. */}
          {badge && <span className="cl-mine">{badge}</span>}
          {/* OFFERED ONLY WHERE THERE IS SOMETHING TO ANSWER. A card whose bank
              reports a limit gets no control, because `limitOf` gives the bank's
              number precedence: a member limit set on such a card would be stored
              and change nothing on screen, which is worse than an absent control.
              The bank's figure is the fact, and there is nothing here for the
              member to improve on.
              A hand-entered card gets no INLINE control either, and that is not an
              oversight: its limit is one field of an account record that also holds
              a name, an institution, a category and a balance, and those are
              edited together by the Edit control on the Connections row. Two
              editors for one number would be two places for it to be changed and
              one of them would go stale.
              It now says "Edit" rather than "Manage". The earlier wording was
              honest about a real gap, Connections offered add and remove only, so
              promising an editor would have sent the member looking for a control
              that was not there. That editor exists, so the link says what it
              does. */}
          {card.origin === "manual" ? (
            <> · <Link href="/app/connections" className="cl-set">Edit on Connections</Link></>
          ) : !editing && source !== "bank" ? (
            <> · <button type="button" className="cl-set" onClick={() => setEditing(true)}>
              {source === "member" ? "Change limit" : "Set limit"}
            </button></>
          ) : null}
        </div>
        {editing && card.origin === "linked" && (
          <LimitForm
            card={card}
            onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); onLimitChanged(); }}
          />
        )}
        {identified && (
          <div className="cr-row-id">
            {identified}
            <button type="button" className="cr-row-change" onClick={onChange}>Change</button>
          </div>
        )}
      </div>
      <div className="util">
        {used != null ? (
          <>
            <div className="ut"><span>Used</span><span className={used > 30 ? "hi" : undefined}>{used}%</span></div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, used)}%`, background: used > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} />
            </div>
          </>
        ) : (
          <div className="ut"><span>Used</span><span>Unknown</span></div>
        )}
      </div>
    </div>
  );
}

export function Credit({ holderStyle = null }: { holderStyle?: HolderStyle | null }) {
  const [cards, setCards] = useState<LinkedCard[] | null>(null);
  const [brands, setBrands] = useState<InstitutionBrandMap | null>(null);
  const rewards = useCardRewards();
  // Bumped to open the identify picker from somewhere other than the prompt's own
  // button: the wallet in the rewards hero draws an outline for each card still
  // to be named, and tapping one has to land on the answer. A counter rather than
  // a boolean, so the same slot can be tapped twice after a dismissal. The state
  // sits here because the prompt and the wallet are siblings, and the alternative
  // is a second picker mounted in the hero, which would be a second place the
  // same answer gets written.
  const [identifyRequest, setIdentifyRequest] = useState(0);

  // account id -> the product the member said it is. Built from the rewards
  // payload rather than fetched again, so the two halves of this page cannot
  // disagree about which card is which.
  const identifiedNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of rewards.data?.cards ?? []) {
      if (c.product) m.set(c.plaid_account_id, c.product.name);
    }
    return m;
  }, [rewards.data]);

  // account id -> the limit the member supplied (#211). `/api/card-rewards` is
  // the only reader of member_cards, so the limits arrive with it and are folded
  // into the Plaid-derived rows here rather than fetched a fourth time.
  //
  // DEGRADES RATHER THAN BLOCKS: if that endpoint is unavailable this map is
  // empty, every card falls back to its bank-reported limit, and the utilization
  // card behaves exactly as it did before #211. A member-set limit going
  // temporarily missing understates utilization, which is the safe direction; the
  // alternative, holding the whole card back on a second request, would blank the
  // one section of this page that has always worked.
  const memberLimits = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rewards.data?.cards ?? []) {
      if (c.member_limit != null) m.set(c.plaid_account_id, c.member_limit);
    }
    return m;
  }, [rewards.data]);

  // The cards the member entered by hand (migration 0046), projected into the
  // same row shape. `?? []` rather than a guard: the rewards endpoint failing
  // must not take the linked cards down with it, which is the same degradation
  // `memberLimits` above already chooses.
  const manual = useMemo(() => manualCards(rewards.data?.manual ?? []), [rewards.data]);

  // ONE list, and the order is deliberate: linked cards first, hand-entered ones
  // after. A member's linked cards are the page's subject and a hand-entered one
  // is a correction they made to it, so interleaving them by name would bury the
  // distinction the badges exist to draw.
  //
  // Null only while the Plaid read is still in flight. A member whose ONLY credit
  // card is a hand-entered one still gets a list, which is the case that made
  // this feature necessary in the first place.
  const withLimits = useMemo(
    () => cards == null
      ? null
      : [...cards.map((c) => ({ ...c, memberLimit: memberLimits.get(c.key) ?? null })), ...manual],
    [cards, memberLimits, manual],
  );

  // Both halves re-read: a limit changes utilization here AND the rewards
  // payload's own copy of it, and refreshing one would leave the two disagreeing
  // about the same card until the next page load.
  const afterLimitChange = async () => {
    await Promise.all([reloadCards(), rewards.refresh()]);
  };

  const unidentify = async (accountId: string) => {
    // Forget, then re-read. Deleting the row is what returns the account to the
    // identify queue, and the prompt at the top of the page picks it up on the
    // next render; a local edit would have to reproduce the whole server
    // computation to keep the guide, the tracker and the switch ideas consistent.
    if (await forgetCard(accountId)) await rewards.refresh();
  };

  const reloadCards = useCallback(async () => {
    const items = await fetchPlaidItems();
    setCards(linkedCards(items));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPlaidItems().then((items) => {
      if (!cancelled) setCards(linkedCards(items));
      // Brand art is fetched off the same item list, so the logo endpoint gets
      // the id set its cache is keyed on. Silent on failure: the resolver falls
      // through to bundled art and then a monogram.
      void fetchInstitutionLogos(items.map((it) => it.institution_id))
        .then((m) => {
          if (!cancelled) setBrands(m);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Computed once, ahead of the return, because both the two-column row and
  // its single-column fallback below need the SAME two pieces of JSX rather
  // than two independent copies of the identify handler and the card map.
  //
  // `hasHolder` mirrors `CardHolderSection`'s OWN internal "any confirmed
  // cards?" check, and has to be computed here rather than inferred from
  // `holderSection` itself: a React element is a plain object describing
  // what to render, truthy the moment it is constructed regardless of what
  // the component decides to return once React actually calls it, so
  // `holderSection && ...` could never tell "renders nothing" apart from
  // "renders the section."
  const hasHolder = !!rewards.data && rewards.data.cards.some((c) => c.product);
  const holderSection = rewards.data && (
    <CardHolderSection
      data={rewards.data}
      brands={brands}
      onIdentify={() => setIdentifyRequest((n) => n + 1)}
      holderStyle={holderStyle}
    />
  );
  const creditCardsList = withLimits == null ? (
    <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>Loading…</div>
  ) : withLimits.length === 0 ? (
    <CardsEmpty />
  ) : (
    <div className="card pad-lg">
      <div className="card-head">
        <h3>Credit cards</h3>
        <span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>
          {withLimits.length} {withLimits.length === 1 ? "card" : "cards"}
        </span>
      </div>
      <OverallUtilization cards={withLimits} />
      {withLimits.map((c) => (
        <CardRow
          card={c}
          brands={brands}
          // A hand-entered card has no product and cannot be identified, so
          // there is nothing to name and nothing to undo. Both are held to
          // null explicitly rather than left to the map missing the key,
          // because that would be the right answer by accident.
          identified={c.origin === "manual" ? null : identifiedNames.get(c.key) ?? null}
          onChange={() => { if (c.origin === "linked") void unidentify(c.key); }}
          onLimitChanged={() => void afterLimitChange()}
          key={c.key}
        />
      ))}
    </div>
  );

  return (
    <div className="frame">
      <PageHeader
        title="Credit"
        sub="Every credit card you have linked, what you owe on it, and how much of the limit you are using."
      />

      {/* 1. Credit score. Not tracked yet, and the panel says so honestly; stays
          first because it is what the page is named after. Issue #264 orders the
          rest of the page below it: the holder, then the card list, then benefits
          and credits. */}
      <ScorePending />

      {/* Above the holder, because it is the one thing on this page with something
          for the member to DO, and because the holder and everything below it is
          gated on the answer. */}
      {rewards.data && (
        <CardIdentifyPrompt
          cards={rewards.data.unidentified}
          catalog={rewards.data.catalog}
          openRequest={identifyRequest}
          onSaved={() => void rewards.refresh()}
        />
      )}

      {/* 2 and 3, side by side (issue #264 follow-up: treatment B of three
          rendered in previews/credit-holder-list-layout-options.html). Each
          keeps its own card border and shadow exactly as it did stacked; only
          the row wrapping them is new. Grid rather than a fixed two-up flex
          because `.credit-row` collapses to one column under 860px the same
          way `.hero` and `.two` already do, so a narrow viewport still gets
          the holder above the list rather than a squeezed sidebar. */}
      {hasHolder ? (
        <div className="grid credit-row" style={{ marginBottom: 16 }}>
          {holderSection}
          {creditCardsList}
        </div>
      ) : (
        <>
          {holderSection}
          {creditCardsList}
        </>
      )}

      {/* 4. Benefits, credits, and what is being left on the table, as charts
          rather than as a list of rows (RewardsSummaryCharts), with the rewards
          guide -- the instruction for which card to reach for -- ahead of them,
          since a recommendation to move a category reads as arbitrary until you
          have seen where it comes from, and the checklist and the switch ideas
          are what a member acts on once they have. */}
      {rewards.data && (
        <>
          <RewardsGuide data={rewards.data} />
          <RewardsSummaryCharts data={rewards.data} />
          {rewards.data.benefits && (
            <BenefitsTracker
              summary={rewards.data.benefits}
              cardCount={rewards.data.cards.filter((c) => c.product).length}
              periods={rewards.data.provenance.periods}
              onChanged={() => void rewards.refresh()}
            />
          )}
          <CardSwitches data={rewards.data} />
        </>
      )}
    </div>
  );
}

/**
 * The card holder, on its own (issue #264, position 2 on the page). Owns the
 * "N of M identified" subtitle that used to sit beside the wallet inside the
 * old rewards hero, since that count is about the CARDS rather than about
 * rewards math, and belongs with the thing it counts.
 */
function CardHolderSection({
  data, brands, onIdentify, holderStyle,
}: {
  data: CardRewards;
  brands: InstitutionBrandMap | null;
  onIdentify: () => void;
  holderStyle: HolderStyle | null;
}) {
  const confirmed = data.cards.filter((c) => c.product);
  if (!confirmed.length) return null;
  const handCount = (data.manual ?? []).length;
  return (
    // No marginBottom here: this only ever renders inside `.credit-row`
    // (the page returns this section OR nothing, and the row only exists when
    // this has something to draw), where the row's own bottom margin and
    // align-items:stretch already do the job. A margin here would eat into
    // the stretch and put this card's border a few pixels short of its
    // sibling's, exactly the mismatch the row was just asked to fix.
    <div className="card pad-lg">
      <div className="eyebrow">Your cards</div>
      {/* "N of M identified" used to describe the whole stack. It cannot any
          more: a hand-entered card can never be identified, so counting it in M
          would leave a total that never completes, and leaving it out
          contradicts the pocket beside it. The count is therefore about LINKED
          cards, said so, with the hand-entered ones named separately. */}
      <div className="cr-hero-sub" style={{ marginBottom: 12 }}>
        {confirmed.length} of {data.cards.length}{" "}
        {data.cards.length === 1 ? "linked card" : "linked cards"} identified
        {data.unidentified.length > 0 && <>, {data.unidentified.length} still to go</>}
        {handCount > 0 && <> · {handCount} added by hand</>}
      </div>
      <CardWallet
        cards={confirmed}
        unidentified={data.unidentified}
        manual={data.manual ?? []}
        logoFor={rewardsLogo(brands)}
        onIdentify={onIdentify}
        holderStyle={holderStyle}
      />
    </div>
  );
}

// The institution mark for a rewards card, resolved through the SAME chain the
// card rows above use (`resolveInstitutionMark`: Plaid's logo, then bundled brand
// art, then a monogram). A second resolution here would be a second fallback
// ladder, which is exactly what institution-brand.ts exists to prevent.
//
// Only a real logo is returned. A card face already carries the brand colour and
// the product name, so a monogram letter on top of it would be a third mark in
// one small box; falling through to nothing is the right answer here even though
// it is the wrong answer on a list row.
function rewardsLogo(brands: InstitutionBrandMap | null) {
  return (card: RewardsCard): string | null => {
    const brand = card.institution_id ? brands?.[card.institution_id] : null;
    const mark = resolveInstitutionMark(card.institution, brand);
    return mark.kind === "logo" ? mark.src : null;
  };
}
