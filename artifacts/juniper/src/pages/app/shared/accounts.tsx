import { money } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { sharedAccounts, you, partner as demoPartner, type Owner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";
import { usePartner, setAccountShare, type AccountScope } from "@/lib/partner";
import type { SeriesKey } from "@/lib/mock-data";

const chipLabel = { shared: "Shared", balance: "Balance only", private: "Private" } as const;
const NEXT: Record<AccountScope, AccountScope> = { shared: "balance", balance: "private", private: "shared" };
const OWNER_K: Record<Owner, SeriesKey> = { shared: "--jnpr-c1", you: you.k, partner: demoPartner.k };

interface Row { account_id?: string; n: string; inst: string; v: number; owner: Owner; scope: AccountScope; k: SeriesKey; mine: boolean }

function AcctRow({ a, onCycle }: { a: Row; onCycle?: (a: Row) => void }) {
  const priv = a.scope === "private";
  return (
    <div className="row">
      <div className="tile sm" style={{ background: cssVar(a.k) }}>{a.n.charAt(0)}</div>
      <div><div className="nm">{a.n}</div><div className="mt">{a.inst}</div></div>
      <div className="amt">
        {priv ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
        {onCycle && a.mine
          ? <button className={`chip ${a.scope}`} onClick={() => onCycle(a)} title="Change what your partner sees">{chipLabel[a.scope]} ▾</button>
          : <span className={`chip ${a.scope}`}>{chipLabel[a.scope]}</span>}
      </div>
    </div>
  );
}

export function SharedAccounts() {
  const { partner } = useWorkspace();
  const { data, refresh } = usePartner();
  const name = partner.name || demoPartner.name;
  const live = data?.connected && data.accounts ? data.accounts : null;

  const rows: Row[] = live
    ? live.map((a) => ({ account_id: a.account_id, n: a.n, inst: a.inst, v: a.v, owner: a.owner, scope: a.scope, k: OWNER_K[a.owner], mine: a.mine }))
    : sharedAccounts.map((a) => ({ n: a.n, inst: a.inst, v: a.v, owner: a.owner, scope: a.privacy, k: a.k, mine: a.owner === "you" }));

  const cycle = live
    ? (a: Row) => { if (a.account_id) void setAccountShare(a.account_id, NEXT[a.scope]).then(refresh); }
    : undefined;

  const group = (owner: Owner) => rows.filter((a) => a.owner === owner);
  const sections: { label: string; dot: string; arr: Row[] }[] = [
    { label: "Shared & joint", dot: "var(--jnpr-good)", arr: group("shared") },
    { label: `${you.name}'s accounts`, dot: cssVar(you.k), arr: group("you") },
    { label: `${name}'s accounts`, dot: cssVar(demoPartner.k), arr: group("partner") },
  ];

  return (
    <SharedPage title="Accounts" sub="Every linked account across both of you, each shown only as far as its owner allows.">
      <div className="card">
        {sections.filter((s) => s.arr.length).map((s, i) => (
          <div key={i}>
            <div className="subhead"><span className="dot" style={{ background: s.dot }} /> {s.label}</div>
            <div className="rows">{s.arr.map((a, j) => <AcctRow a={a} key={j} onCycle={cycle} />)}</div>
          </div>
        ))}
      </div>
      <p className="disc">
        “Balance only” shows the total but not the transactions; “Private” hides the account entirely.
        {cycle ? " Tap a chip on your own account to change what your partner sees." : " The owner controls this on the Sharing tab."}
      </p>
    </SharedPage>
  );
}
