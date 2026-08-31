import { useState } from "react";
import { money0, periodWord, setBenefitUsed, readableDate,
         type BenefitSummary, type TrackedBenefit } from "@/lib/cards";

// The benefits tracker. Treatment A of three
// (design/card-rewards-variants.html), issue #168.
//
// ── IT IS THE MEMBER'S CHECKLIST, NOT A STATEMENT ABOUT THE ISSUER ─────────
//
// Two things Juniper cannot know, both of which shape this component:
//
//   1. WHETHER A CREDIT WAS ACTUALLY APPLIED. A matching charge proves a hotel
//      was paid for, not that the issuer credited it back, and those arrive weeks
//      apart. So nothing is ticked automatically. An automatic tick that is
//      sometimes wrong is worse than no tick at all, because the member would
//      stop trusting the list and stop checking.
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

// Icons per perk family. A small fixed table rather than per-benefit art: the
// groups come from the catalog and there are five of them, so a lookup that
// falls back cleanly is the whole requirement.
const GROUP_ICON: Record<string, string> = {
  Travel: "✈️", Airport: "🛄", Shopping: "🛍️", Dining: "🍽️", Protection: "🛡️",
};

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
  return (
    <label className={benefit.used ? "cr-bt-b done" : "cr-bt-b"}>
      <input
        className="cr-bt-tick"
        type="checkbox"
        checked={benefit.used}
        disabled={busy}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="cr-bt-body">
        <span className="cr-bt-bn">{benefit.name}</span>
        <span className="cr-bt-bd">
          {benefit.productName}
          {benefit.detail && <> &middot; {benefit.detail}</>}
          {benefit.used && used && <> &middot; ticked off {used}</>}
        </span>
      </span>
      <span className="cr-bt-val">
        {/* No invented number. A benefit with no dollar figure says so rather
            than showing a zero, which would read as "worth nothing". */}
        {benefit.value_amount != null ? money0(benefit.value_amount) : <span className="cr-bt-nov">No set value</span>}
        {period && <span className="cr-bt-per">{period}</span>}
      </span>
    </label>
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
