import { money } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { sharedAccounts, you, partner as demoPartner, type SharedAccount, type Owner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";

const privacyChip = { shared: "Shared", balance: "Balance only", private: "Private" } as const;

function Row({ a }: { a: SharedAccount }) {
  const priv = a.privacy === "private";
  return (
    <div className="row">
      <div className="tile sm" style={{ background: cssVar(a.k) }}>{a.n.charAt(0)}</div>
      <div><div className="nm">{a.n}</div><div className="mt">{a.inst}</div></div>
      <div className="amt">
        {priv ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
        <span className={`chip ${a.privacy}`}>{privacyChip[a.privacy]}</span>
      </div>
    </div>
  );
}

export function SharedAccounts() {
  const { partner } = useWorkspace();
  const name = partner.name || demoPartner.name;
  const group = (owner: Owner) => sharedAccounts.filter((a) => a.owner === owner);
  const sections: { label: string; dot: string; arr: SharedAccount[] }[] = [
    { label: "Shared & joint", dot: "var(--jnpr-good)", arr: group("shared") },
    { label: `${you.name}'s accounts`, dot: cssVar(you.k), arr: group("you") },
    { label: `${name}'s accounts`, dot: cssVar(demoPartner.k), arr: group("partner") },
  ];
  return (
    <SharedPage title="Accounts" sub="Every linked account across both of you — each shown only as far as its owner allows.">
      <div className="card">
        {sections.map((s, i) => (
          <div key={i}>
            <div className="subhead"><span className="dot" style={{ background: s.dot }} /> {s.label}</div>
            <div className="rows">{s.arr.map((a, j) => <Row a={a} key={j} />)}</div>
          </div>
        ))}
      </div>
      <p className="disc">“Balance only” shows the total but not the transactions. “Private” accounts are hidden entirely — the owner controls this on the Sharing tab.</p>
    </SharedPage>
  );
}
