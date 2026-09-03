import { useState } from "react";
import { money0, periodWord, setBenefitUsed, readableDate,
         type BenefitSummary, type TrackedBenefit } from "@/lib/cards";

// The benefits tracker. Originally treatment A of three
// (design/card-rewards-variants.html), issue #168; the evidence-linked row below
// is treatment C of three redesigns rendered for issue #264
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
// ── THE NARROW EXCEPTION (issue #264), AND WHY THE EVIDENCE IS ON SCREEN ────
//
// Two benefits in the whole catalog (Amex Platinum and Amex Gold's Uber Cash)
// are not "a charge that MIGHT mean the credit applied" -- they ARE the credit,
// restated: the merchant is Uber and only Uber. api/card-rewards.ts ticks those
// itself when it finds a matching charge (`benefit.source === "auto"`), and rule
// 1 above is respected rather than broken by never letting that tick stand
// alone: `benefit.evidence` carries the matched charge as a plain string, and it
// is rendered directly under the row, not hidden behind a tooltip or a details
// toggle, because the whole point of an automatic tick is that the member can
// see exactly what Juniper saw. The checkbox is still a real checkbox, still
// wired to the same `onToggle` a manual row uses, so "not this one" is one tap
// away and behaves exactly like unticking anything else on this list.

// Icons per perk family. A small fixed table rather than per-benefit art: the
// groups come from the catalog and there are five of them, so a lookup that
// falls back cleanly is the whole requirement.
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

function BenefitRow({
  benefit,
  onToggle,
  busy,
}: {
  benefit: TrackedBenefit;
  onToggle: (used: boolean) => void;
  busy: boolean;
}) {
  const period = periodWord(benefit.period);
  const used = readableDate(benefit.usedAt ? benefit.usedAt.slice(0, 10) : null);
  // An automatic tick with its own evidence line below states the date and
  // amount there, so repeating "ticked off <date>" on this line would be the
  // same fact twice in two different formats.
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
          {/* Not decoration: the one visual difference between a tick the member
              made and one Juniper made for them, at the point they'd actually
              look, the name itself. See the evidence line below for the receipt
              that backs it up. */}
          {auto && <span className="cr-bt-auto" title="Juniper matched a charge to this benefit" aria-hidden="true">⚡</span>}
          {benefit.name}
        </span>
        <span className="cr-bt-bd">
          {benefit.productName}
          {benefit.detail && <> &middot; {benefit.detail}</>}
          {benefit.used && used && !auto && <> &middot; ticked off {used}</>}
          {/* Said out loud rather than letting the benefit disappear on the day it
              lapses. Anything already expired is filtered out server-side, so a
              date here is always still ahead -- and a credit that is ending is
              exactly the one worth using. */}
          {benefit.expires_on && <> &middot; <b>ends {endsOn(benefit.expires_on)}</b></>}
        </span>
      </span>
      <span className="cr-bt-val">
        {/* No invented number. A benefit with no dollar figure says so rather
            than showing a zero, which would read as "worth nothing". */}
        {benefit.value_amount != null ? money0(benefit.value_amount) : <span className="cr-bt-nov">No set value</span>}
        {period && <span className="cr-bt-per">{period}</span>}
      </span>
    </label>
    {/* Outside the label, deliberately: a button nested inside a label sits next
        to a form control that toggles on any click landing in the label, and
        keeping the evidence line as a sibling rather than a label descendant
        means "not this one?" can never accidentally double-fire the checkbox
        it already controls through `onToggle`. */}
    {auto && benefit.evidence && (
      <div className="cr-bt-evidence">
        <span aria-hidden="true">🧾</span> matched: <code>{benefit.evidence}</code>
        <button type="button" className="cr-bt-undo" disabled={busy} onClick={() => onToggle(false)}>
          not this one?
        </button>
      </div>
    )}
    </>
  );
}

function BenefitGroup({
  group,
  benefits,
  usedCount,
  onToggle,
  busyId,
}: {
  group: string;
  benefits: TrackedBenefit[];
  usedCount: number;
  onToggle: (b: TrackedBenefit, used: boolean) => void;
  busyId: string | null;
}) {
  // Open by default. A tracker whose contents are hidden behind a click is a
  // tracker nobody looks at, and the whole point is noticing an unused credit.
  const [open, setOpen] = useState(true);
  return (
    <div className="cr-bt-grp">
      <button type="button" className="cr-bt-gh" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cr-bt-gi" aria-hidden="true">{GROUP_ICON[group] ?? "🎁"}</span>
        {group}
        <span className="n">{usedCount} of {benefits.length} ticked off</span>
        <span className={open ? "cr-bt-caret open" : "cr-bt-caret"} aria-hidden="true">›</span>
      </button>
      {open && benefits.map((b) => (
        <BenefitRow
          key={b.id}
          benefit={b}
          busy={busyId === b.id}
          onToggle={(used) => onToggle(b, used)}
        />
      ))}
    </div>
  );
}

export function BenefitsTracker({
  summary,
  cardCount,
  periods,
  onChanged,
}: {
  summary: BenefitSummary;
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

  const withPending = (b: TrackedBenefit): TrackedBenefit =>
    b.id in pending ? { ...b, used: pending[b.id] } : b;

  const usedCount = summary.groups
    .flatMap((g) => g.benefits)
    .filter((b) => withPending(b).used).length;

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

      {summary.groups.map((g) => {
        const benefits = g.benefits.map(withPending);
        return (
          <BenefitGroup
            key={g.group}
            group={g.group}
            benefits={benefits}
            usedCount={benefits.filter((b) => b.used).length}
            onToggle={(b, used) => void toggle(b, used)}
            busyId={busyId}
          />
        );
      })}

      {error && <div className="cr-pk-err">{error}</div>}

      <div className="cr-prov">
        {usedCount} of {summary.total} ticked off. Unticking one clears it for the current period only and
        leaves earlier periods alone. A recurring credit unticks itself when its period rolls over.
      </div>
    </div>
  );
}
