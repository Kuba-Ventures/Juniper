import { useMemo, useState } from "react";
import { money0, periodWord, setBenefitUsed, dismissBenefitSuggestion, readableDate,
         type BenefitSummary, type TrackedBenefit, type CardRewards } from "@/lib/cards";
import { CardFace } from "@/components/juniper/card-rewards-bits";

// The benefits tracker. Originally treatment A of three
// (design/card-rewards-variants.html), issue #168; the evidence-linked row was
// treatment C of three redesigns rendered for issue #264
// (previews/credit-guide-benefits-options.html).
//
// ── IT IS THE MEMBER'S CHECKLIST, NOT A STATEMENT ABOUT THE ISSUER ─────────
//
// Two things Juniper cannot know for MOST benefits here, and this is still the
// rule for nearly every row:
//
//   1. WHETHER A CREDIT WAS ACTUALLY APPLIED. A matching charge proves a hotel
//      was paid for, not that the issuer credited it back, and those arrive weeks
//      apart. So nothing here is ticked automatically by default. An automatic
//      tick that is sometimes wrong is worse than no tick at all, because the
//      member would stop trusting the list and stop checking.
//   2. WHEN THE ISSUER'S OWN PERIOD RESETS. A good share of real card credits
//      reset on the CARDMEMBER year, the anniversary of the account opening.
//      Plaid's `transactions` product does not return an account's open date, so
//      a calendar year is the only bucket Juniper can compute. Presenting it as
//      the issuer's reset date would be a small lie that costs somebody a $120
//      credit, so the period is named on screen and framed as Juniper's own.
//
// A benefit with no dollar figure is still listed and still tickable. Lounge
// access and primary rental coverage are real and worth remembering; they just
// cannot be summed, so the total says it is partial rather than assigning them a
// guess.
//
// ── TWO NARROW EXCEPTIONS TO "NOTHING IS TICKED AUTOMATICALLY" ─────────────
//
// Two benefits in the whole catalog (Amex Platinum and Amex Gold's Uber Cash,
// migration 0052) are not "a charge that MIGHT mean the credit applied" -- they
// ARE the credit, restated: the merchant is Uber and only Uber. api/card-rewards.ts
// ticks those itself when it finds a matching charge (`benefit.source === "auto"`),
// and rule 1 above is respected rather than broken by never letting that tick
// stand alone: `benefit.evidence` carries the matched charge as a plain string,
// rendered directly under the row, not hidden behind a tooltip. The checkbox is
// still a real checkbox, still wired to the same `onToggle` a manual row uses,
// so "not this one" is one tap away.
//
// A third benefit (the Sapphire Preferred's Chase Travel hotel credit, migration
// 0053) fails rule 1's test -- a Chase Travel charge could be a flight, a car, or
// the hotel this $50 covers, and even a hotel charge doesn't prove the credit
// applied -- so it does NOT get ticked automatically. It gets a SUGGESTION
// instead: the same evidence a member would want to see, `benefit.suggestedEvidence`,
// with a banner asking them to confirm. "Yes, used it" is then a plain member tick,
// same as tapping the checkbox by hand; "Not this" writes the same dismissal
// tombstone an undone auto-tick does, so the same charge does not reappear on the
// next load.
//
// ── GROUPED BY CARD, NOT BY BENEFIT TYPE ────────────────────────────────────
//
// Was Travel / Shopping / Protection; Finley asked for benefits grouped by card,
// with the real photo leading each group, matching how the rewards guide and the
// wallet already think about the member's cards
// (previews/benefits-tracker-cleanup-options.html, then
// previews/benefits-tracker-by-card-options.html, option H chosen). Within a
// card, benefits split into two columns on whether they are ticked THIS period:
// "To use" and "Used", so ticking one reads as moving it across rather than a
// line quietly changing color in a single long list. Most rows have no dollar
// figure and no evidence to show, so they render as a single compact line; a row
// that carries a suggestion or an auto-tick's evidence keeps the fuller,
// multi-line treatment, because that is the one case with something to read.

// Icons per perk family, kept for the suggestion banner's icon only now that
// benefits no longer group by this field on screen.
const GROUP_ICON: Record<string, string> = {
  Travel: "✈️", Airport: "🛄", Shopping: "🛍️", Dining: "🍽️", Protection: "🛡️",
};

/** "12/31/2027" -> "31 Dec 2027". Parsed as UTC parts rather than through the
    Date constructor, which would read a bare YYYY-MM-DD as UTC midnight and then
    print it in local time -- one day early for anybody west of Greenwich. */
function endsOn(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !m || !d || !MONTHS[m - 1]) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A benefit worth the fuller, multi-line treatment: it carries a suggestion to
    confirm, or it was ticked automatically and its evidence is the receipt that
    tick has to carry. Everything else is a name and a value, one line. */
const isFeatured = (b: TrackedBenefit) => !!b.suggestedEvidence || (b.used && b.source === "auto");

function FeaturedBenefitRow({
  benefit, onToggle, onDismissSuggestion, busy,
}: {
  benefit: TrackedBenefit;
  onToggle: (used: boolean) => void;
  onDismissSuggestion: () => void;
  busy: boolean;
}) {
  const period = periodWord(benefit.period);
  const usedDate = readableDate(benefit.usedAt ? benefit.usedAt.slice(0, 10) : null);
  const auto = benefit.used && benefit.source === "auto";
  return (
    <>
      <label className={benefit.used ? "cr-bt-b done" : "cr-bt-b"}>
        <input
          className="cr-bt-tick"
          type="checkbox"
          checked={benefit.used}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="cr-bt-body">
          <span className="cr-bt-bn">
            {auto && <span className="cr-bt-auto" title="Juniper matched a charge to this benefit" aria-hidden="true">⚡</span>}
            {benefit.name}
          </span>
          <span className="cr-bt-bd">
            {benefit.detail}
            {benefit.used && usedDate && !auto && <> &middot; ticked off {usedDate}</>}
            {benefit.expires_on && <> &middot; <b>ends {endsOn(benefit.expires_on)}</b></>}
          </span>
        </span>
        <span className="cr-bt-val">
          {benefit.value_amount != null ? money0(benefit.value_amount) : <span className="cr-bt-nov">No set value</span>}
          {period && <span className="cr-bt-per">{period}</span>}
        </span>
      </label>
      {/* Outside the label, deliberately: nested inside it, a click on the undo
          or confirm button would also fire the checkbox it sits beside. */}
      {auto && benefit.evidence && (
        <div className="cr-bt-evidence">
          <span aria-hidden="true">🧾</span> matched: <code>{benefit.evidence}</code>
          <button type="button" className="cr-bt-undo" disabled={busy} onClick={() => onToggle(false)}>
            not this one?
          </button>
        </div>
      )}
      {benefit.suggestedEvidence && (
        <div className="cr-bt-suggest">
          {/* One span around the whole sentence, not bare text beside <b>: a flex
              container turns each bare text run between elements into its own
              anonymous flex item, so text before and after <b> would wrap and
              gap independently, stranding punctuation on its own line. */}
          <span>
            <span aria-hidden="true">{GROUP_ICON[benefit.group] ?? "🔍"}</span> We saw a charge that might be
            this: <b>{benefit.suggestedEvidence}</b>. Mark this used?
          </span>
          <button type="button" className="cr-bt-sug-btn ghost" disabled={busy} onClick={onDismissSuggestion}>
            Not this
          </button>
          <button type="button" className="cr-bt-sug-btn" disabled={busy} onClick={() => onToggle(true)}>
            Yes, used it
          </button>
        </div>
      )}
    </>
  );
}

/** One line: a checkbox, the name, the value. Everything a benefit with no
    suggestion and no auto evidence needs, which is most of them. */
function CompactBenefitRow({
  benefit, onToggle, busy,
}: {
  benefit: TrackedBenefit;
  onToggle: (used: boolean) => void;
  busy: boolean;
}) {
  return (
    <label className={benefit.used ? "cr-bt-crow done" : "cr-bt-crow"}>
      <input
        className="cr-bt-tick"
        type="checkbox"
        checked={benefit.used}
        disabled={busy}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="nm">{benefit.name}</span>
      <span className="val">
        {benefit.value_amount != null ? money0(benefit.value_amount) : "No set value"}
      </span>
    </label>
  );
}

interface CardFaceInfo { brandColor: string | null; artUrl: string | null }

function CardBenefitGroup({
  productId, productName, benefits, faces, onToggle, onDismissSuggestion, busyId,
}: {
  productId: string;
  productName: string;
  benefits: TrackedBenefit[];
  faces: Map<string, CardFaceInfo>;
  onToggle: (b: TrackedBenefit, used: boolean) => void;
  onDismissSuggestion: (b: TrackedBenefit) => void;
  busyId: string | null;
}) {
  const face = faces.get(productId);
  // Featured rows lead their column; the rest sort alphabetically, same order
  // the flat list used before this was grouped by card.
  const order = (list: TrackedBenefit[]) => [
    ...list.filter(isFeatured),
    ...list.filter((b) => !isFeatured(b)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const toUse = order(benefits.filter((b) => !b.used));
  const used = order(benefits.filter((b) => b.used));

  const row = (b: TrackedBenefit) => isFeatured(b) ? (
    <FeaturedBenefitRow
      key={b.id}
      benefit={b}
      busy={busyId === b.id}
      onToggle={(u) => onToggle(b, u)}
      onDismissSuggestion={() => onDismissSuggestion(b)}
    />
  ) : (
    <CompactBenefitRow key={b.id} benefit={b} busy={busyId === b.id} onToggle={(u) => onToggle(b, u)} />
  );

  return (
    <div className="cr-bt-cardgrp">
      <div className="cr-bt-cardh">
        <CardFace size="sm" brandColor={face?.brandColor ?? null} artUrl={face?.artUrl ?? null} />
        <div>
          <div className="cr-bt-cardname">{productName}</div>
          <div className="cr-bt-cardsub">{used.length} of {benefits.length} ticked off</div>
        </div>
      </div>
      <div className="cr-bt-cols">
        <div className="cr-bt-col">
          <div className="cr-bt-colh">To use &middot; {toUse.length}</div>
          {toUse.length === 0
            ? <div className="cr-bt-empty-col">Nothing left to use this period.</div>
            : toUse.map(row)}
        </div>
        <div className="cr-bt-col">
          <div className="cr-bt-colh">Used &middot; {used.length}</div>
          {used.length === 0
            ? <div className="cr-bt-empty-col">Nothing ticked off here yet.</div>
            : used.map(row)}
        </div>
      </div>
    </div>
  );
}

export function BenefitsTracker({
  summary, catalog, cardCount, periods, onChanged,
}: {
  summary: BenefitSummary;
  /** For the real card photo on each group's header. Only `product_id`,
      `brand_color` and `art_url` are read. */
  catalog: CardRewards["catalog"];
  cardCount: number;
  /** The buckets ticks are recorded against right now, computed server-side, so
      the copy names the real period rather than describing one. */
  periods: { month: string; quarter: string; year: string };
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ticks applied locally the moment they are made, so the checkbox responds at
  // once rather than after a round trip and a re-fetch. Reverted on failure, and
  // the authoritative state still comes from the server on the next read: this is
  // a display overlay, not a second source of truth.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // Same overlay, for a dismissed suggestion: the server stops matching it once
  // the dismissal lands, but the banner should not wait for a round trip to go
  // away, and a failed dismiss should bring it right back.
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const faces = useMemo(
    () => new Map(catalog.map((p) => [p.product_id, { brandColor: p.brand_color, artUrl: p.art_url }])),
    [catalog],
  );

  if (!summary.total) return null;

  const toggle = async (b: TrackedBenefit, used: boolean) => {
    setBusyId(b.id);
    setError(null);
    setPending((p) => ({ ...p, [b.id]: used }));
    const ok = await setBenefitUsed(b.id, used);
    setBusyId(null);
    if (!ok) {
      setPending((p) => {
        const next = { ...p };
        delete next[b.id];
        return next;
      });
      setError("Could not save that. Try again in a moment.");
      return;
    }
    onChanged();
  };

  const dismissSuggestion = async (b: TrackedBenefit) => {
    setBusyId(b.id);
    setError(null);
    setDismissed((d) => ({ ...d, [b.id]: true }));
    const ok = await dismissBenefitSuggestion(b.id);
    setBusyId(null);
    if (!ok) {
      setDismissed((d) => {
        const next = { ...d };
        delete next[b.id];
        return next;
      });
      setError("Could not save that. Try again in a moment.");
      return;
    }
    onChanged();
  };

  const withPending = (b: TrackedBenefit): TrackedBenefit => {
    const next = b.id in pending ? { ...b, used: pending[b.id] } : b;
    return dismissed[b.id] ? { ...next, suggestedEvidence: null } : next;
  };

  const allBenefits = summary.groups.flatMap((g) => g.benefits).map(withPending);
  const usedCount = allBenefits.filter((b) => b.used).length;

  const byProduct = new Map<string, { productName: string; benefits: TrackedBenefit[] }>();
  for (const b of allBenefits) {
    const entry = byProduct.get(b.product_id);
    if (entry) entry.benefits.push(b);
    else byProduct.set(b.product_id, { productName: b.productName, benefits: [b] });
  }
  // Biggest card first, then alphabetical, the same ordering rule the old
  // benefit-type groups used, so the order does not shuffle as rows are ticked.
  const cardGroups = [...byProduct.entries()]
    .map(([productId, { productName, benefits }]) => ({ productId, productName, benefits }))
    .sort((a, b) => b.benefits.length - a.benefits.length || a.productName.localeCompare(b.productName));

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h3>Benefits tracker</h3>
        <span className="cr-rg-head">
          {summary.total} {summary.total === 1 ? "benefit" : "benefits"} from your {cardCount}{" "}
          {cardCount === 1 ? "card" : "cards"}
        </span>
      </div>
      <div className="cr-rg-intro">
        Your own checklist. Juniper cannot see whether an issuer applied a credit, so tick these off
        yourself. {summary.unusedValue > 0 && (
          <>
            <b>{money0(summary.unusedValue)}{summary.valuePartial ? " or more" : ""}</b> a year is
            currently unticked.{" "}
          </>
        )}
        Periods are calendar periods ({periods.month} this month, {periods.quarter} this quarter,{" "}
        {periods.year} this year). Several issuers reset on your cardmember year instead, which Juniper
        has no way to know.
      </div>

      {cardGroups.map((g) => (
        <CardBenefitGroup
          key={g.productId}
          productId={g.productId}
          productName={g.productName}
          benefits={g.benefits}
          faces={faces}
          onToggle={(b, used) => void toggle(b, used)}
          onDismissSuggestion={(b) => void dismissSuggestion(b)}
          busyId={busyId}
        />
      ))}

      {error && <div className="cr-pk-err">{error}</div>}

      <div className="cr-prov">
        {usedCount} of {summary.total} ticked off. Unticking one clears it for the current period only and
        leaves earlier periods alone. A recurring credit unticks itself when its period rolls over.
      </div>
    </div>
  );
}
