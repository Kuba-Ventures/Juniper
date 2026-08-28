// Every account either of you has shared, each shown only as far as its owner
// allows. Live data only: the seeded household this used to fall back to went
// with Stage 4e, along with the hardcoded "Maya" and "Devin" that named the two
// sides even on the live branch.
import { money } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { useSession } from "@/lib/use-session";
import { usePartner, setAccountShare, type AccountScope } from "@/lib/partner";
import type { SeriesKey } from "@/lib/mock-data";

type Owner = "shared" | "you" | "partner";

const chipLabel = { shared: "Shared", balance: "Balance only", private: "Private" } as const;
const NEXT: Record<AccountScope, AccountScope> = { shared: "balance", balance: "private", private: "shared" };
const OWNER_K: Record<Owner, SeriesKey> = { shared: "--jnpr-c1", you: "--jnpr-c3", partner: "--jnpr-c5" };

interface Row { account_id: string; n: string; inst: string; v: number; owner: Owner; scope: AccountScope; k: SeriesKey; mine: boolean }

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
  const session = useSession();
  const name = partner.name || data?.partner?.name || "your partner";
  const meName =
    (session?.user.user_metadata as { name?: string } | undefined)?.name?.trim().split(/\s+/)[0] || "Your";

  const rows: Row[] = (data?.accounts ?? []).map((a) => ({
    account_id: a.account_id, n: a.n, inst: a.inst, v: a.v,
    owner: a.owner, scope: a.scope, k: OWNER_K[a.owner], mine: a.mine,
  }));

  const cycle = (a: Row) => { void setAccountShare(a.account_id, NEXT[a.scope]).then(refresh); };

  const group = (owner: Owner) => rows.filter((a) => a.owner === owner);
  const sections: { label: string; dot: string; arr: Row[] }[] = [
    { label: "Shared & joint", dot: "var(--jnpr-good)", arr: group("shared") },
    { label: `${meName === "Your" ? "Your" : `${meName}'s`} accounts`, dot: cssVar(OWNER_K.you), arr: group("you") },
    { label: `${name}'s accounts`, dot: cssVar(OWNER_K.partner), arr: group("partner") },
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
        Tap a chip on your own account to change what {name} sees.
      </p>
    </SharedPage>
  );
}
