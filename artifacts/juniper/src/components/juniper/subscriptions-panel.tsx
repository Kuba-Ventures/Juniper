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
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import { colorOf } from "@/lib/category-color";
import { fmtDay, money2 } from "@/lib/txn-format";
import { fetchSubscriptions, setSubscription, type SubItem, type SubPayload, type SubAction } from "@/lib/subscriptions";

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

  const load = useCallback(async () => {
    const d = await fetchSubscriptions();
    setData(d);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: SubAction) => {
    setBusy(id);
    const ok = await setSubscription(id, action);
    // Re-read rather than patching in place. Every total on this panel is
    // recomputed server-side from the confirmed set, so guessing the new total
    // client-side would put a second definition of it in the app.
    if (ok) await load();
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
            <Row key={i.id} i={i} busy={busy === i.id}
              actions={<button className="btn ghost sm" disabled={busy === i.id} onClick={() => void act(i.id, "revert")}>Undo</button>} />
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
      <MerchantMark logo={i.logo} merchant={i.merchant} name={i.name} k={colorOf(i.g)} />
      <div className="sub-id">
        <span className="sub-n">{i.name}</span>
        <span className="sub-sub">
          {i.cadence}
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
