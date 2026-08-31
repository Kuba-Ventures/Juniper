import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CreditCard as CardIcon } from "lucide-react";
import { PageHeader } from "@/components/juniper/app-frame";
import { fetchInstitutionLogos, fetchPlaidItems, type InstitutionBrandMap, type PlaidItem } from "@/lib/plaid";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import { forgetCard, limitOf, setCardLimit, useCardRewards, type LinkedCard as RewardsCard } from "@/lib/cards";
import { creditPosition, utilizationPct } from "@/lib/credit-balance";
import { CardIdentifyPrompt } from "@/components/juniper/card-identify";
import { RewardsGuide } from "@/components/juniper/rewards-guide";
import { BenefitsTracker } from "@/components/juniper/benefits-tracker";
import { CardSwitches } from "@/components/juniper/card-switches";

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
// The rewards sections render NOTHING until a card is identified, and that is not
// an empty state, it is the honest one: Plaid does not say which product an
// account is, so until the member confirms, Juniper has no rates to show and says
// so through the identify prompt instead of guessing. See card-identify.tsx.

type LinkedCard = {
  key: string;
  // Plaid's id for the issuer, so the brand map (keyed by id) can be read
  // directly rather than matched on a display name.
  institutionId: string | null;
  institution: string;
  name: string;
  mask: string | null;
  // What the member OWES. Plaid reports a credit balance as positive when owed
  // and negative when the account is in credit, and this used to take the
  // magnitude with it, which drew "the issuer owes you $328" as "you owe $328"
  // and read 7% of a limit the member was using none of. See lib/credit-balance.
  balance: number;
  // What the ISSUER owes the member: an overpayment, or a refund that landed after
  // the statement cleared. Kept apart from `balance` because the row has to be
  // able to say which of the two it is drawing.
  inCredit: number;
  // null whenever the bank does not report a limit, and also on every snapshot
  // written before the server started sanitizing `limit` through. This is the
  // BANK's number: a fact.
  limit: number | null;
  // #211: what the MEMBER typed for a card the bank reports no limit for. A
  // claim, kept in its own field rather than folded into `limit`, because every
  // surface that draws it has to be able to say which of the two it drew.
  memberLimit: number | null;
  currency: string | null;
};

const money = (n: number, currency: string | null): string => {
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
};

// Credit accounts are `type === "credit"` in Plaid's taxonomy (cards plus the odd
// line of credit). Loans are a separate type and belong to the debt surfaces, not
// to a utilization calculation.
function linkedCards(items: PlaidItem[]): LinkedCard[] {
  return items.flatMap((it) =>
    (it.accounts ?? [])
      .filter((a) => (a.type ?? "").toLowerCase() === "credit")
      .map((a) => ({
        key: a.account_id,
        institutionId: it.institution_id ?? null,
        institution: it.institution_name || "Linked institution",
        name: a.name,
        mask: a.mask,
        balance: creditPosition(a.balance).owed,
        inCredit: creditPosition(a.balance).inCredit,
        limit: a.limit != null && a.limit > 0 ? a.limit : null,
        // Filled in by the Credit component from /api/card-rewards, which is the
        // only reader of member_cards. This function stays a pure projection of
        // the Plaid snapshot.
        memberLimit: null,
        currency: a.currency,
      })),
  );
}

// Which limit a card actually uses, and where it came from. Delegates to
// `limitOf` in lib/cards.ts so the precedence is defined once: the BANK's number
// wins where it exists, because it is the fact and the member's was a stand-in
// for its absence.
const limitFor = (c: LinkedCard) => limitOf({ bank_limit: c.limit, member_limit: c.memberLimit });

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
  const rated = cards.map((c) => ({ card: c, ...limitFor(c) }));
  const withLimit = rated.filter((r) => r.limit != null);
  const excluded = cards.length - withLimit.length;
  const memberSet = withLimit.filter((r) => r.source === "member").length;
  if (!withLimit.length) {
    return (
      <div className="util-hero">
        <div>
          <div className="eyebrow">Overall utilization</div>
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", marginTop: 6, maxWidth: "48ch", lineHeight: 1.55 }}>
            None of your linked cards report a credit limit, so there is nothing to measure a balance
            against. Refreshing your data on Connections re-reads limits from your bank, and you can
            set a limit yourself on any card below.
          </div>
        </div>
      </div>
    );
  }
  const balance = withLimit.reduce((a, r) => a + r.card.balance, 0);
  const limit = withLimit.reduce((a, r) => a + (r.limit ?? 0), 0);
  const used = pct(balance, limit);
  const currency = withLimit[0].card.currency;
  return (
    <div className="util-hero">
      <div>
        <div className="eyebrow">Overall utilization</div>
        <div className="big tnum">{used}%</div>
        <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 2 }}>
          {money(balance, currency)} of {money(limit, currency)} across {withLimit.length}{" "}
          {withLimit.length === 1 ? "card" : "cards"}
          {excluded > 0 && `, ${excluded} more excluded for reporting no limit`}
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
          {card.inCredit > 0
            ? <><b>{money(card.inCredit, card.currency)} in credit</b>{limit != null
                ? <> of a {money(limit, card.currency)} limit</>
                : <>, limit not reported</>}</>
            : <>{money(card.balance, card.currency)}{limit != null
                ? <> of {money(limit, card.currency)} limit</>
                : <> owed, limit not reported</>}</>}
          {/* THE BADGE IS NOT DECORATION. A number the member typed must never be
              indistinguishable from one their bank reported: the first is a claim
              and the second is a fact, and a utilization built on a mix of them is
              only as good as the claim. */}
          {source === "member" && <span className="cl-mine">You set this</span>}
          {/* OFFERED ONLY WHERE THERE IS SOMETHING TO ANSWER. A card whose bank
              reports a limit gets no control, because `limitOf` gives the bank's
              number precedence: a member limit set on such a card would be stored
              and change nothing on screen, which is worse than an absent control.
              The bank's figure is the fact, and there is nothing here for the
              member to improve on. */}
          {!editing && source !== "bank" && (
            <> · <button type="button" className="cl-set" onClick={() => setEditing(true)}>
              {source === "member" ? "Change limit" : "Set limit"}
            </button></>
          )}
        </div>
        {editing && (
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

export function Credit() {
  const [cards, setCards] = useState<LinkedCard[] | null>(null);
  const [brands, setBrands] = useState<InstitutionBrandMap | null>(null);
  const rewards = useCardRewards();

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

  const withLimits = useMemo(
    () => cards?.map((c) => ({ ...c, memberLimit: memberLimits.get(c.key) ?? null })) ?? null,
    [cards, memberLimits],
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

  return (
    <div className="frame">
      <PageHeader
        title="Credit"
        sub="Every credit card you have linked, what you owe on it, and how much of the limit you are using."
      />

      <ScorePending />

      {/* Above the cards, because it is the one thing on this page with something
          for the member to DO, and because every section below it is gated on the
          answer. */}
      {rewards.data && (
        <CardIdentifyPrompt
          cards={rewards.data.unidentified}
          catalog={rewards.data.catalog}
          onSaved={() => void rewards.refresh()}
        />
      )}

      {withLimits == null ? (
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
              identified={identifiedNames.get(c.key) ?? null}
              onChange={() => void unidentify(c.key)}
              onLimitChanged={() => void afterLimitChange()}
              key={c.key}
            />
          ))}
        </div>
      )}

      {/* Order is deliberate: the guide is the reference somebody reads, the
          tracker is the thing they act on repeatedly, and the switch ideas are
          the money. The guide goes first anyway, because a recommendation to move
          a category reads as arbitrary until you have seen the rate table it came
          from, and this surface can least afford to look like it is guessing. */}
      {rewards.data && (
        <>
          <RewardsGuide data={rewards.data} logoFor={rewardsLogo(brands)} />
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
