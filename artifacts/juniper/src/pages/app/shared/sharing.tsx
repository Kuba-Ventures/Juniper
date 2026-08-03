import { useEffect, useState } from "react";
import { SharedPage } from "@/components/juniper/shared-frame";
import { privacyToggles, partner as demoPartner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";
import { usePartner, setSharingPrefs, disconnectPartner, type PartnerPrefs } from "@/lib/partner";

// Coarse UI toggle -> server pref field. Goals + joint balances are inherent to
// the partnership (always on); the rest are the member's real choices.
const FIELD: Record<string, keyof PartnerPrefs> = {
  balances: "share_balances",
  txns: "share_transactions",
  score: "share_score",
};
const ALWAYS_ON = new Set(["goals", "joint"]);

export function SharedSharing() {
  const { partner, disconnect } = useWorkspace();
  const { data, refresh } = usePartner();
  const name = partner.name || demoPartner.name;
  const live = data?.connected ? data : null;

  const [toggles, setToggles] = useState(() => privacyToggles.map((t) => ({ ...t, locked: t.locked || ALWAYS_ON.has(t.key) })));

  // Hydrate from real prefs when a partnership is active.
  useEffect(() => {
    if (!live?.prefs) return;
    setToggles((cur) => cur.map((t) => {
      const f = FIELD[t.key];
      return f ? { ...t, on: !!live.prefs!.me[f] } : t;
    }));
  }, [live?.prefs]);

  const flip = (key: string) => {
    const t = toggles.find((x) => x.key === key);
    if (!t || t.locked) return;
    const next = !t.on;
    setToggles((cur) => cur.map((x) => (x.key === key ? { ...x, on: next } : x)));
    const f = FIELD[key];
    if (f && live) void setSharingPrefs({ [f]: next }).then(refresh);
  };

  const onDisconnect = async () => {
    if (live) await disconnectPartner();
    disconnect();
  };

  return (
    <SharedPage title="Sharing" sub={`Collaborate on your own terms — choose exactly what ${name} can see from you.`}>
      <div className="card">
        <div className="card-head"><h3>What {name} can see from you</h3><span className="chip shared">Your controls</span></div>
        <div>
          {toggles.map((t) => (
            <div className="priv-row" key={t.key}>
              <div><div className="p-t">{t.title}</div><div className="p-s">{t.sub}</div></div>
              <button className={`toggle ${t.on ? "on" : ""} ${t.locked ? "lock" : ""}`} onClick={() => flip(t.key)} aria-pressed={t.on} aria-label={t.title} disabled={t.locked}><i /></button>
            </div>
          ))}
        </div>
        <p className="disc">🔒 Flip any of these anytime. {name} sees the same controls for their side, and disconnecting unshares everything instantly.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Partner</h3></div>
        <div className="priv-row" style={{ borderTop: 0 }}>
          <div><div className="p-t">Disconnect {name}</div><div className="p-s">Ends sharing and removes the shared space for both of you.</div></div>
          <button className="btn ghost sm" style={{ color: "var(--jnpr-bad)" }} onClick={onDisconnect}>Disconnect</button>
        </div>
      </div>
    </SharedPage>
  );
}
