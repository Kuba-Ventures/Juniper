// The recurring-charges panel on the transactions tab.
//
// Two lists, and the split is the product decision: what the member has
// CONFIRMED, which carries a total, and what Plaid has merely DETECTED, which
// is quarantined in a review queue and counts toward nothing until they say so.
//
// The alternative shape, which Rocket Money ships, is to auto-commit every
// detection and sweep it to "Inactive" after one missed month. The reported
// outcome of that is a member surprised by a bill that was never flagged, with
// no way to mark it recurring. A detection is a guess, and a guess presented as
// a fact about someone's money is the failure mode this whole panel is shaped
// to avoid.
//
// Three states are rendered rather than two, because "paid, but not the amount
// we expected" is its own answer. Quietly updating the stored amount, which is
// the easy implementation, hides exactly the price rise a member opens this
// screen to find.
//
// EDITING (treatment B of three, see design/recurring-edit-variants.html).
// A confirmed row opens onto a panel holding the four things the data model has
// always carried and nothing read: the member's own name for the charge, the
// amount they expect, the cadence (migration 0030), and the number of charges
// the detection was built from. Editing is offered on CONFIRMED rows only, and
// that is a constraint rather than a preference: `recurring_overrides.state` is
// NOT NULL and the endpoint takes confirm or dismiss, so there is nowhere to put
// a correction to a stream nobody has decided about yet.
//
// The row stays a div with a real disclosure BUTTON inside it, not a button
// wrapping the whole row, because the row already contains buttons and
// interactive content nested inside a button is invalid and announces badly.
// That is the same call #190 made for plan cards, for the same reason.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import { localBrandLogo } from "@/lib/institution-brand";
import { colorOf, paint } from "@/lib/category-color";
import { fmtDay, money2 } from "@/lib/txn-format";
import { CADENCES, fetchSubscriptions, setSubscription, type SubItem, type SubPayload, type SubAction } from "@/lib/subscriptions";

const CONFIDENCE_NOTE: Record<string, string> = {
  established: "Charged regularly",
  possible: "Possible, not enough history yet",
  missed: "Expected charge has not arrived",
};

export function SubscriptionsPanel() {
  const [data, setData] = useState<SubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  // One open at a time. Two panels of fields open at once turns the card into a
  // form, and the member is editing one charge.
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetchSubscriptions();
    setData(d);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: SubAction, edits?: { name?: string; expectedAmount?: number | null; frequency?: string | null }) => {
    setBusy(id);
    const ok = await setSubscription(id, action, edits);
    // Re-read rather than patching in place. Every total on this panel is
    // recomputed server-side from the confirmed set, so guessing the new total
    // client-side would put a second definition of it in the app.
    if (ok) {
      setOpenId(null);
      await load();
    }
    setBusy(null);
  };

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Recurring</h3></div>
        <div className="sc-empty">Looking for recurring charges…</div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const out = items.filter((i) => i.direction === "outflow");
  const s = data?.summary;

  // Nothing detected is a real and common state (a member who linked minutes
  // ago, or whose bank returns nothing), and it is not an error. It says what
  // has to happen next rather than showing an empty total.
  if (!out.length) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Recurring</h3></div>
        <div className="sc-empty">
          No recurring charges spotted yet. Your bank needs to have shared a few months of transactions before a
          subscription can be told apart from a one-off.
        </div>
      </div>
    );
  }

  const confirmed = out.filter((i) => i.review === "confirmed");
  const pending = out.filter((i) => i.review === "unreviewed");
  const dismissed = out.filter((i) => i.review === "dismissed");
  const incoming = items.filter((i) => i.direction === "inflow");

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3>Recurring</h3>
        {s && s.confirmed > 0 && (
          <span className="sub-total">
            <b className="tnum">{money2(s.monthly)}</b> a month
            <span className="sub-total-s">
              {" "}from {s.confirmed} confirmed
              {/* Stated, not hidden. A list that does not add up to its own
                 total with no explanation is worse than the gap itself. */}
              {s.unknownCadence > 0 && `, ${s.unknownCadence} with no set schedule not counted`}
            </span>
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <div className="sub-review">
          <div className="sub-review-h">
            <span className="sub-review-t">
              {pending.length} possible recurring {pending.length === 1 ? "charge" : "charges"} to review
            </span>
            <span className="sub-review-s">Nothing here counts toward your total until you confirm it.</span>
          </div>
          {pending.map((i) => (
            <Row key={i.id} i={i} busy={busy === i.id}
              actions={
                <>
                  <button className="btn sm" disabled={busy === i.id} onClick={() => void act(i.id, "confirm")}>Confirm</button>
                  <button className="btn ghost sm" disabled={busy === i.id} onClick={() => void act(i.id, "dismiss")}>Not recurring</button>
                </>
              } />
          ))}
        </div>
      )}

      {confirmed.length > 0 && (
        <div className="sub-list">
          {confirmed.map((i) => (
            <div key={i.id} className={`sub-exp${openId === i.id ? " open" : ""}`}>
              <Row i={i} busy={busy === i.id}
                actions={
                  <>
                    <button
                      className="btn ghost sm"
                      id={`sub-edit-${i.id}`}
                      aria-expanded={openId === i.id}
                      aria-controls={`sub-panel-${i.id}`}
                      disabled={busy === i.id}
                      onClick={() => setOpenId(openId === i.id ? null : i.id)}
                    >
                      {openId === i.id ? "Close" : "Edit"}
                    </button>
                    <button className="btn ghost sm" disabled={busy === i.id} onClick={() => void act(i.id, "revert")}>Undo</button>
                  </>
                } />
              {openId === i.id && (
                <EditPanel
                  key={`${i.id}-${i.edited}`}
                  i={i}
                  busy={busy === i.id}
                  onSave={(edits) => void act(i.id, "confirm", edits)}
                  onReset={() => void act(i.id, "confirm")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {confirmed.length === 0 && pending.length === 0 && (
        <div className="sc-empty sm">Everything detected so far has been dismissed.</div>
      )}

      {incoming.length > 0 && (
        <p className="sub-note">
          {incoming.length} recurring {incoming.length === 1 ? "deposit" : "deposits"} also detected, such as pay.
          Money in is not counted in the total above.
        </p>
      )}

      {dismissed.length > 0 && (
        <div className="sub-dismissed">
          <button className="link sub-toggle" onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
          </button>
          {showDismissed && dismissed.map((i) => (
            <Row key={i.id} i={i} busy={busy === i.id} muted
              actions={<button className="btn ghost sm" disabled={busy === i.id} onClick={() => void act(i.id, "revert")}>Undo</button>} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ i, actions, busy, muted }: { i: SubItem; actions: ReactNode; busy: boolean; muted?: boolean }) {
  return (
    <div className={`sub-row${muted ? " muted" : ""}${busy ? " busy" : ""}`}>
      {/* Plaid's merchant logo first, then the bank behind the stream, then the
         monogram MerchantMark falls back to on its own. The middle tier exists
         because a fee charged by the card issuer is not a merchant transaction
         at all, so Plaid names no merchant for it and no merchant art can ever
         cover it, while the institution is known from the item. The server only
         sends `institution` where the merchant is absent, so a Starbucks charge
         cannot end up wearing the card's bank mark. */}
      <MerchantMark
        logo={i.logo ?? (i.institution ? localBrandLogo(i.institution) : null)}
        merchant={i.merchant} name={i.name} k={colorOf(i.g)} paint={paint(i.g, i.hue)} />
      <div className="sub-id">
        <span className="sub-n">
          {i.name}
          {/* Same signal the transactions list uses for a corrected category: a
             figure the member set should be distinguishable from Plaid's. */}
          {i.edited && <span className="sub-dot" title="You edited this" />}
        </span>
        <span className="sub-sub">
          {i.institution ? `${i.institution} · ` : ""}
          {i.cadence}
          {/* The conversion behind the total, on the row it comes from, because
             "$95 yearly" and a monthly figure are not the same number and the
             head only shows the second. */}
          {i.perMonth != null && i.frequencyKey !== "MONTHLY" && ` · ${money2(i.perMonth)} a month`}
          {/* No next-charge date when Plaid did not predict one. Plaid sets
             predicted_next_date "only if the next payment date can be
             predicted", and a date invented from the cadence would be the one
             number on this screen a member would actually plan around. */}
          {i.nextDate
            ? ` · ${i.overdue ? "was due" : "next"} ${fmtDay(i.nextDate)}`
            : i.lastDate ? ` · last charged ${fmtDay(i.lastDate)}` : ""}
        </span>
      </div>
      <div className="sub-amt">
        <span className="tnum">{i.expected != null ? money2(i.expected) : "Amount varies"}</span>
        <Chip i={i} />
      </div>
      <div className="sub-act">{actions}</div>
    </div>
  );
}

function Chip({ i }: { i: SubItem }) {
  if (i.review !== "confirmed") return <span className="sub-chip">{CONFIDENCE_NOTE[i.confidence]}</span>;
  if (i.health === "missed") return <span className="sub-chip bad">Expected, not seen</span>;
  if (i.health === "amount_changed" && i.drift != null) {
    return (
      <span className="sub-chip warn">
        Last was {money2(Math.abs(i.drift))} {i.drift > 0 ? "more" : "less"} than expected
      </span>
    );
  }
  return <span className="sub-chip good">On track</span>;
}

// The expansion under a confirmed row. Everything here already existed in
// `recurring_overrides` (name and expected_amount since 0016, frequency since
// 0030) and nothing read it.
//
// SAVE SENDS ALL THREE FIELDS, always, because the endpoint upserts with
// merge-duplicates and replaces the whole row: sending only what changed would
// clear the rest. Reset sends the confirm with NO fields, which is the same
// write with all three cleared, so the row keeps its confirmation and drops back
// to what the bank says. That is deliberately not the same control as Undo,
// which deletes the override row and returns the charge to the review queue.
function EditPanel({ i, busy, onSave, onReset }: {
  i: SubItem;
  busy: boolean;
  onSave: (edits: { name?: string; expectedAmount?: number | null; frequency?: string | null }) => void;
  onReset: () => void;
}) {
  // Initialized from the member's OWN layer, not the resolved value, so an empty
  // field means "use what my bank says" and stays that way. Pre-filling from the
  // resolved figure would turn a cadence correction into a silent freeze of
  // Plaid's average as an explicit expectation.
  const [name, setName] = useState(i.own.name ?? "");
  const [amount, setAmount] = useState(i.own.expected != null ? i.own.expected.toFixed(2) : "");
  const [freq, setFreq] = useState(i.own.frequency ?? "");

  const trimmed = amount.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  // Refused here as well as server-side, so the member is told before the
  // request rather than by it. The server stays the authority.
  const amountBad = parsed != null && (!Number.isFinite(parsed) || parsed < 0);

  return (
    <div className="sub-panel" id={`sub-panel-${i.id}`} role="group" aria-labelledby={`sub-edit-${i.id}`}>
      <div className="sub-fields">
        <label className="sub-lbl sub-lbl-grow">
          Name
          <input
            className="sub-in"
            value={name}
            placeholder={i.bank.name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="sub-lbl">
          I expect to pay
          <span className="sub-money">
            <span aria-hidden="true">$</span>
            <input
              className="sub-in sub-in-amt tnum"
              value={amount}
              inputMode="decimal"
              placeholder={i.bank.expected != null ? i.bank.expected.toFixed(2) : ""}
              aria-invalid={amountBad}
              aria-label="Expected amount"
              onChange={(e) => setAmount(e.target.value)}
            />
          </span>
        </label>
        <label className="sub-lbl">
          Every
          <select className="sub-in sub-in-cad" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {/* The empty option is how a member gives the cadence back to Plaid,
               so it names what Plaid actually says rather than reading as
               "unset". Where Plaid says nothing that is "No set schedule",
               which is also why this row is missing from the total. */}
            <option value="">
              {i.bank.cadence === "Irregular" ? "No set schedule (my bank)" : `${i.bank.cadence} (my bank)`}
            </option>
            {CADENCES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <p className="sub-help">
        {/* The warning that matters. Correcting the amount to whatever came out
           last month silences the price rise this panel exists to show. */}
        What you expect to pay, not what your bank charged last. A charge more than 5% and $1 away from
        this gets flagged rather than quietly replacing it.
      </p>

      <div className="sub-panel-f">
        <span className="sub-meta">
          {i.charges > 0 && `Detected from ${i.charges} ${i.charges === 1 ? "charge" : "charges"}`}
          {amountBad && <span className="sub-bad"> Enter an amount, or leave it empty.</span>}
        </span>
        <span className="sub-panel-r">
          {i.edited && (
            <button className="link" disabled={busy} onClick={onReset}>Reset to what your bank says</button>
          )}
          <button
            className="btn sm"
            disabled={busy || amountBad}
            // All three, every time, because the upsert replaces the row. An
            // empty field sends null, which is the member handing that one field
            // back to the bank.
            onClick={() => onSave({
              name: name.trim(),
              expectedAmount: parsed,
              frequency: freq || null,
            })}
          >
            Save
          </button>
        </span>
      </div>
    </div>
  );
}
