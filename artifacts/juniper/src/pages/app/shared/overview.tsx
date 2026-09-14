// The shared overview: what the two of you are worth together, which accounts
// each of you has chosen to share, and how the shared goals are funded.
//
// Live data only, as of Stage 4d. Every figure here comes from /api/partner,
// which rolls up both members' accounts while honouring each side's sharing
// settings, so an account somebody kept private is not counted into a total the
// other person can see. A partnership with nothing shared yet says so.
//
// ── ARRANGING (issue #290) ──────────────────────────────────────────────────
//
// One partner may now arrange this page, but only for themselves: the SAME
// board mechanics #252 built for the personal Overview (drag, keyboard nudge,
// a shelf for widgets taken off), reused via
// components/juniper/arrange-board.tsx, against a SEPARATE registry
// (SHARED_WIDGETS) and a SEPARATE stored column (migration 0060,
// `shared_dashboard_layout`) from the personal board's. Two people looking at
// this same shared content can therefore see it in two different orders; the
// CONTENT is shared, the arrangement never is.
//
// Five widgets, each a section this page already drew unconditionally before
// this change. Two of them (Your/Their shared accounts) collapse off the live
// page when that side has shared nothing, the same rule #251 gave every other
// widget on the personal board: an empty widget does not hold a slot, and is
// drawn as a dashed placeholder with its explanation ONLY while arranging.
// Together and Shared goals never collapse, because each already carries its
// own zero-state message and, for goals, its own "+ New shared goal" call to
// action; hiding either would remove the one thing a member with nothing
// shared yet yould see. Order and visibility only, matching the personal
// board's own scope: no per-widget sizes, since none of these five has more
// than one honest shape to draw at.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { money, moneyK } from "@/lib/mock-data";
import { cssVar, planMark } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { usePartner, type PartnerAccount } from "@/lib/partner";
import { SHARED_REGISTRY, type DashboardLayout } from "@/lib/dashboard-layout";
import {
  useArrangeBoard, withFullFlags, ArrangeIcon, GripIcon, EmptySlot, NUDGE_KEYS,
} from "@/components/juniper/arrange-board";
import { fetchInstitutionLogos, fetchPlaidItems, type InstitutionBrandMap } from "@/lib/plaid";
import { brandForName, resolveInstitutionMark } from "@/lib/institution-brand";

const GOAL_CYCLE = ["--jnpr-c1", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6"];
const YOU_COLOR = "--jnpr-c3";
const THEM_COLOR = "--jnpr-c5";

const scopeChip = { shared: "Shared", balance: "Balance only", private: "Private" } as const;

// Widest-first: Plaid's own logo, then our bundled art, then a monogram tinted
// with the institution's brand color, matching the chain Connections, the
// personal Overview rollup, the Credit page's cards and the shared Accounts
// page (#425) already use. Only when none of that resolves does this fall
// back to a plain letter tile, the same last resort those surfaces reach for.
function AccountMark({ a, brands }: { a: PartnerAccount; brands: InstitutionBrandMap | null }) {
  const mark = resolveInstitutionMark(a.inst, brandForName(brands, a.inst));
  if (mark.kind === "logo") return <img className="blogo sm" src={mark.src} alt="" />;
  if (mark.kind === "monogram") {
    return (
      <div className="tile sm" style={{ background: mark.background, color: mark.color }}>
        {mark.letter}
      </div>
    );
  }
  return <div className="tile sm" style={{ background: cssVar(a.mine ? YOU_COLOR : THEM_COLOR) }}>{a.n.charAt(0)}</div>;
}

function AccountRow({ a, brands }: { a: PartnerAccount; brands: InstitutionBrandMap | null }) {
  // "Private" here means the other member chose not to share the balance, so
  // there is no number to show rather than a number being withheld from the
  // person looking: /api/partner never sends it.
  const hidden = a.scope === "private";
  return (
    <div className="row">
      <AccountMark a={a} brands={brands} />
      <div><div className="nm">{a.n}</div><div className="mt">{a.inst}</div></div>
      <div className="amt">
        {hidden ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
        <span className={`chip ${a.scope}`}>{scopeChip[a.scope]}</span>
      </div>
    </div>
  );
}

export function SharedOverview({
  layout = null,
  onLayout,
}: {
  /** How THIS member arranged the shared Overview (migration 0060), or null
      for "has not arranged anything". See lib/dashboard-layout.ts. */
  layout?: DashboardLayout | null;
  onLayout?: (next: DashboardLayout) => void;
} = {}) {
  const { partner } = useWorkspace();
  const { data, loading } = usePartner();
  const name = partner.name || data?.partner?.name || "your partner";

  // /api/partner carries each account's institution NAME only, never a Plaid
  // institution id, so the brand map here is keyed from this member's own
  // linked items and matched by name via brandForName, the same bridge the
  // personal Overview rollup and the shared Accounts page (#425) both use for
  // the same gap. The partner's own institutions won't be in this member's
  // items, so their accounts fall back to the plain-letter tile, same as
  // before this change.
  const [brands, setBrands] = useState<InstitutionBrandMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPlaidItems()
      .then((list) => fetchInstitutionLogos(list.map((it) => it.institution_id)))
      .then((m) => { if (!cancelled) setBrands(m); })
      .catch(() => { /* silent — resolver falls back to bundled art / monogram */ });
    return () => { cancelled = true; };
  }, []);

  const combined = data?.combined;
  const accounts = data?.accounts ?? [];
  const goals = data?.goals ?? [];
  const mine = accounts.filter((a) => a.owner === "you");
  const theirs = accounts.filter((a) => a.owner === "partner");
  const joint = accounts.filter((a) => a.owner === "shared");

  const total = combined?.netWorth ?? 0;
  // A zero total would make both shares 0% and draw an empty bar, so the split
  // is only drawn once there is something to split.
  const yShare = total ? Math.round((combined!.youShare / total) * 100) : 0;
  const pShare = total ? 100 - yShare : 0;

  const {
    editing, setEditing, order, hidden, sizes, announce, setAnnounce,
    setShown, nudge,
    board, dragId, onCardPointerDown, onBoardPointerMove, endDrag, cardRef,
    boardWidth, pack,
  } = useArrangeBoard(SHARED_REGISTRY, layout, onLayout, "shared Overview");

  const nodes: Record<string, ReactNode> = {
    together: (
      <div className="card pad-lg together">
        <div className="eyebrow">Together</div>
        <div className="big-num tnum" style={{ margin: "6px 0 2px" }}>{money(total)}</div>
        {total > 0 ? (
          <>
            <div className="split-bar">
              <i style={{ width: `${yShare}%`, background: cssVar(YOU_COLOR) }} />
              <i style={{ width: `${pShare}%`, background: cssVar(THEM_COLOR) }} />
            </div>
            <div className="split-legend">
              <span><span className="dot" style={{ background: cssVar(YOU_COLOR) }} /> You · <b className="tnum">{money(combined!.youShare)}</b></span>
              <span><span className="dot" style={{ background: cssVar(THEM_COLOR) }} /> {name} · <b className="tnum">{money(combined!.partnerShare)}</b></span>
            </div>
          </>
        ) : (
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {loading ? "Reading your shared accounts…" : `Neither of you is sharing a balance yet. Whatever you share appears here, and only what you share.`}
          </p>
        )}
      </div>
    ),
    jointaccounts: (
      <div className="card shared-accts">
        <div className="card-head"><h3><span className="dot" style={{ background: "var(--jnpr-good)" }} /> Shared accounts</h3></div>
        <div className="rows">{joint.map((a) => <AccountRow a={a} brands={brands} key={a.account_id} />)}</div>
      </div>
    ),
    youraccounts: (
      <div className="card owner-col" style={{ borderTopColor: cssVar(YOU_COLOR) }}>
        <div className="oc-head">
          <span className="oc-ava" style={{ background: cssVar(YOU_COLOR) }}>Y</span>
          <b>You</b><span className="oc-tot tnum">{money(combined?.youShare ?? 0)}</span>
        </div>
        <div className="rows">{mine.map((a) => <AccountRow a={a} brands={brands} key={a.account_id} />)}</div>
      </div>
    ),
    theiraccounts: (
      <div className="card owner-col" style={{ borderTopColor: cssVar(THEM_COLOR) }}>
        <div className="oc-head">
          <span className="oc-ava" style={{ background: cssVar(THEM_COLOR) }}>{name.charAt(0).toUpperCase()}</span>
          <b>{name}</b><span className="oc-tot tnum">{money(combined?.partnerShare ?? 0)}</span>
        </div>
        <div className="rows">{theirs.map((a) => <AccountRow a={a} brands={brands} key={a.account_id} />)}</div>
      </div>
    ),
    goals: (
      <div className="card">
        <div className="card-head">
          <h3>Shared goals</h3>
          <Link href="/app/shared/goals" className="link">{goals.length > 0 ? "See all" : "+ New shared goal"}</Link>
        </div>
        {goals.length === 0 ? (
          <p className="sub" style={{ margin: "4px 0 2px" }}>
            Nothing yet. A shared goal records who contributed what, so the split is never a memory test.
          </p>
        ) : (
          goals.map((g, i) => {
            const funded = g.you + g.partner;
            const pct = g.target > 0 ? Math.round((funded / g.target) * 100) : 0;
            const width = (v: number) => (g.target > 0 ? `${Math.min(100, (v / g.target) * 100)}%` : "0%");
            return (
              <div className="goal" key={g.id}>
                <div className="g-top">
                  <div className="g-ic" style={{ background: cssVar(GOAL_CYCLE[i % GOAL_CYCLE.length]) }}>{planMark({ icon: g.icon, ab: g.t[0] })}</div>
                  <b style={{ flex: 1 }}>{g.t}</b>
                  <span className="tnum" style={{ fontWeight: 700 }}>
                    {moneyK(funded)} {g.target > 0 && <small style={{ color: "var(--jnpr-ink-3)" }}>/ {moneyK(g.target)}</small>}
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: width(g.you), background: cssVar(YOU_COLOR) }} />
                  <i style={{ width: width(g.partner), background: cssVar(THEM_COLOR) }} />
                </div>
                <div className="contrib">
                  <span><b style={{ color: cssVar(YOU_COLOR) }}>You</b> {moneyK(g.you)} · <b style={{ color: cssVar(THEM_COLOR) }}>{name}</b> {moneyK(g.partner)}</span>
                  <span>{g.target > 0 ? `${pct}% funded` : "No target yet"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    ),
  };

  const emptyWhy: Record<string, string | null> = {
    together: null,
    jointaccounts: joint.length > 0 ? null : "No joint accounts shared yet.",
    youraccounts: mine.length > 0 ? null : "Nothing shared from your side yet.",
    theiraccounts: theirs.length > 0 ? null : `Nothing shared from ${name}'s side yet.`,
    goals: null,
  };

  const shownIds = order.filter((id) => !hidden.has(id));
  const laidOut = withFullFlags(shownIds.filter((id) => editing || !emptyWhy[id]), (id) => sizes[id], SHARED_REGISTRY);
  const offIds = order.filter((id) => hidden.has(id));
  const { pos: dashPos, height: dashHeight } = pack(laidOut);

  const arrangeButton = (
    <button
      className={editing ? "dash-arr on" : "dash-arr"}
      onClick={() => { setEditing((v) => !v); setAnnounce(editing ? "Done arranging" : "Arranging your shared Overview"); }}
    >
      <ArrangeIcon />
      {editing ? "Done" : "Arrange"}
    </button>
  );

  return (
    <SharedPage
      title={`Shared with ${name}`}
      sub="Both your finances, only what you each choose to share."
      arrangeButton={arrangeButton}
    >
      {editing && (
        <p className="dash-hint">
          Drag a card to move it, or focus its handle and use the arrow keys. This is your own view of
          this page: {name} sees their own arrangement, not yours.
        </p>
      )}

      <div
        className={`${editing ? "dash-board editing" : "dash-board"}${dragId ? " dragging-active" : ""}`}
        ref={board}
        onPointerMove={onBoardPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        style={{ position: "relative", height: boardWidth > 0 ? dashHeight : undefined, visibility: boardWidth > 0 ? "visible" : "hidden", marginBottom: 16 }}
      >
        {laidOut.map(({ id, full }) => {
          const meta = SHARED_REGISTRY.byId[id];
          const why = emptyWhy[id];
          const p = dashPos[id];
          return (
            <div
              key={id}
              data-widget={id}
              ref={cardRef(id)}
              className={`dash-w${full ? " full" : ""}${dragId === id ? " dragging" : ""}`}
              style={p ? { transform: `translate(${p.x}px, ${p.y}px)`, width: p.width } : undefined}
              onPointerDown={(e) => onCardPointerDown(e, id)}
            >
              {editing && (
                <>
                  <button
                    className="dash-grip"
                    aria-label={`Move ${meta.title}. Use the arrow keys.`}
                    onKeyDown={(e) => {
                      const d = NUDGE_KEYS[e.key];
                      if (!d) return;
                      e.preventDefault();
                      nudge(id, d);
                    }}
                  >
                    <GripIcon />
                  </button>
                  <button
                    className="dash-x"
                    aria-label={`Take ${meta.title} off your shared Overview`}
                    onClick={() => setShown(id, false)}
                  >
                    −
                  </button>
                </>
              )}
              {why ? <EmptySlot title={meta.title} why={why} /> : nodes[id]}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="dash-shelf">
          <div className="dash-shelf-h">Not on your shared Overview</div>
          {offIds.length === 0 ? (
            <span className="dash-shelf-e">Everything is on your shared Overview.</span>
          ) : (
            <div className="dash-chips">
              {offIds.map((id) => (
                <button key={id} className="dash-chip" onClick={() => setShown(id, true)}>
                  <b>+</b>{SHARED_REGISTRY.byId[id].title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="sr-only" aria-live="polite">{announce}</div>
    </SharedPage>
  );
}
