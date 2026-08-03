import { useState } from "react";
import { SharedPage } from "@/components/juniper/shared-frame";
import { privacyToggles, partner as demoPartner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";

export function SharedSharing() {
  const { partner, disconnect } = useWorkspace();
  const name = partner.name || demoPartner.name;
  const [toggles, setToggles] = useState(() => privacyToggles.map((t) => ({ ...t })));
  const flip = (key: string) => setToggles((cur) => cur.map((t) => (t.key === key && !t.locked ? { ...t, on: !t.on } : t)));

  return (
    <SharedPage title="Sharing" sub={`Collaborate on your own terms — choose exactly what ${name} can see from you.`}>
      <div className="card">
        <div className="card-head"><h3>What {name} can see from you</h3><span className="chip shared">Your controls</span></div>
        <div>
          {toggles.map((t) => (
            <div className="priv-row" key={t.key}>
              <div><div className="p-t">{t.title}</div><div className="p-s">{t.sub}</div></div>
              <button
                className={`toggle ${t.on ? "on" : ""} ${t.locked ? "lock" : ""}`}
                onClick={() => flip(t.key)}
                aria-pressed={t.on}
                aria-label={t.title}
                disabled={t.locked}
              ><i /></button>
            </div>
          ))}
        </div>
        <p className="disc">🔒 Flip any of these anytime. {name} sees the same controls for their side, and disconnecting unshares everything instantly.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Partner</h3></div>
        <div className="priv-row" style={{ borderTop: 0 }}>
          <div><div className="p-t">Disconnect {name}</div><div className="p-s">Ends sharing and removes the shared space for both of you.</div></div>
          <button className="btn ghost sm" style={{ color: "var(--jnpr-bad)" }} onClick={disconnect}>Disconnect</button>
        </div>
      </div>
    </SharedPage>
  );
}
