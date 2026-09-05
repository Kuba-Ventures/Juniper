// The household page (issue #258): members, roles, per-account sharing, and
// the combined total. Reached from HouseholdSwitcher, not from the personal
// nav array, the same way Settings is reached from the account menu rather
// than from a tab.
//
// Deliberately its own page rather than folded into the shared partner
// workspace (components/juniper/shared-frame.tsx): a household is a distinct
// model (migration 0055), and reusing that frame would couple this to
// lib/workspace.tsx, which this feature does not touch.
//
// Four tabs (issue #321): Overview, Members, Accounts, Plans. Members and
// Accounts carried the whole page before this; Overview is new (three summary
// cards, the same "card links deeper" pattern the individual and partner
// Overviews already use) and so is Plans (sharing a plan to the household,
// migration 0056 / household_plan_shares).
import { useState } from "react";
import { useLocation } from "wouter";
import { money } from "@/lib/mock-data";
import { cssVar, PlanIcon } from "@/components/juniper/primitives";
import { PageHeader } from "@/components/juniper/app-frame";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import {
  useHousehold, isShared, leaveHousehold, removeHouseholdMember, editHouseholdMemberRole,
  setHouseholdAccountShare, setHouseholdPlanShare,
  type HouseholdAccount, type HouseholdPlan, type HouseholdRole, type AccountScope,
} from "@/lib/household";
import { InviteHouseholdModal } from "@/components/juniper/household-invite-modal";
import { planTitle, planIcon, planColor, planNumbers, domainFromName, SHAPE_ICON } from "@/lib/plans";
import { EXAMPLES, type Example } from "@/pages/app/plans";

const roleLabel: Record<HouseholdRole, string> = { owner: "Owner", member: "Member", viewer: "Viewer" };
const MEMBER_COLORS = ["--jnpr-c3", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c1", "--jnpr-c7"];

// A household-flavored slice of the personal Plans page's own example
// gallery (`EXAMPLES` in lib/plans.ts), not a second set of illustrations:
// "Buy a home" and "Emergency fund" read as household goals as easily as
// personal ones, and the two new entries (vacation, college) were added there
// rather than kept local so the same `?new=<slug>` deep link on /app/plans
// that already resolves every other example resolves these too.
const FAMILY_EXAMPLE_IDS = ["vacation", "college", "home", "emergency"];
const FAMILY_EXAMPLES: Example[] = FAMILY_EXAMPLE_IDS
  .map((id) => EXAMPLES.find((e) => e.id === id))
  .filter((e): e is Example => !!e);

type Tab = "overview" | "members" | "accounts" | "plans";

function AccountRow({ a, canToggle, onToggle, busy }: {
  a: HouseholdAccount; canToggle: boolean; onToggle: (next: AccountScope) => void; busy: boolean;
}) {
  const on = isShared(a.scope);
  const hidden = a.scope === "private" && !a.mine;
  // Real bundled brand art where the institution's name matches one (the same
  // chain Connections and Overview use), a tinted monogram otherwise. No
  // per-request Plaid logo here: that endpoint only ever returns marks for the
  // CALLER's own linked institutions, and half these rows belong to someone else.
  const mark = resolveInstitutionMark(a.inst);
  return (
    <div className="share-row">
      {mark.kind === "logo" ? (
        <img className="blogo" src={mark.src} alt="" />
      ) : (
        <div className="tile sm" style={{ background: cssVar("--jnpr-c4") }}>{a.n.charAt(0)}</div>
      )}
      <div className="share-id">
        <div className="nm">{a.n}</div>
        <div className="mt">{a.inst}</div>
      </div>
      <div className="amt">
        {hidden ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
      </div>
      {canToggle ? (
        <button
          className={on ? "share-toggle on" : "share-toggle"}
          role="switch"
          aria-checked={on}
          aria-label={`Share ${a.n} with the household`}
          disabled={busy}
          onClick={() => onToggle(on ? "private" : "shared")}
        >
          <i />
        </button>
      ) : (
        <span className={`chip ${a.scope}`}>{on ? "Shared" : "Private"}</span>
      )}
    </div>
  );
}

function PlanRow({ p, canToggle, onToggle, busy }: {
  p: HouseholdPlan; canToggle: boolean; onToggle: (next: boolean) => void; busy: boolean;
}) {
  const { current, target } = planNumbers(p);
  return (
    <div className="share-row">
      <div className="track" style={{ background: cssVar(planColor(p)) }}><PlanIcon name={planIcon(p)} /></div>
      <div className="share-id">
        <div className="nm">{planTitle(p)}</div>
        <div className="mt">{target > 0 ? `${money(current)} of ${money(target)}` : "No target set"}</div>
      </div>
      {canToggle ? (
        <button
          className={p.shared ? "share-toggle on" : "share-toggle"}
          role="switch"
          aria-checked={p.shared}
          aria-label={`Share ${planTitle(p)} with the household`}
          disabled={busy}
          onClick={() => onToggle(!p.shared)}
        >
          <i />
        </button>
      ) : (
        <span className="chip shared">Shared</span>
      )}
    </div>
  );
}

export function HouseholdView() {
  const [, navigate] = useLocation();
  const { data, loading, refresh } = useHousehold();
  const [tab, setTab] = useState<Tab>("overview");
  const [inviting, setInviting] = useState(false);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="frame">
        <PageHeader title="Household" />
        <p className="sub">Loading your household…</p>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="frame">
        <PageHeader title="Household" sub="A shared space for more than one person — parents and kids, or any group." />
        <div className="card pad-lg">
          <p>You're not in a household yet. Use the Household control in the top bar to start one.</p>
        </div>
      </div>
    );
  }

  const isOwner = data.role === "owner";
  // Issue #333: a viewer can see everything already shared (GET overview()
  // never checks role) but api/household.ts 403s set-account-share and
  // share-plan for one. The toggle is hidden here too rather than left
  // clickable and failing, since showing a control a viewer's own request
  // will always reject is worse than not showing it.
  const isViewer = data.role === "viewer";
  const accounts = data.accounts ?? [];
  const members = data.members ?? [];
  const plans = data.plans ?? [];
  const myAccounts = accounts.filter((a) => a.mine);
  const sharedAccountsByOthers = accounts.filter((a) => !a.mine);
  const myPlans = plans.filter((p) => p.mine);
  const sharedPlansByOthers = plans.filter((p) => !p.mine);
  const mySharedAccountCount = myAccounts.filter((a) => isShared(a.scope)).length;
  const mySharedPlanCount = myPlans.filter((p) => p.shared).length;

  const toggleAccount = (a: HouseholdAccount, next: AccountScope) => {
    setBusyAccount(a.account_id);
    void setHouseholdAccountShare(a.account_id, next).then(() => { refresh(); setBusyAccount(null); });
  };

  const togglePlan = (p: HouseholdPlan, next: boolean) => {
    setBusyPlan(p.domain);
    void setHouseholdPlanShare(p.domain, next).then(() => { refresh(); setBusyPlan(null); });
  };

  const changeRole = (userId: string, role: "member" | "viewer") => {
    setBusyRole(userId); setError(null);
    void editHouseholdMemberRole(userId, role).then((res) => {
      setBusyRole(null);
      if (res.ok) refresh(); else setError(res.error || "Couldn't change that role.");
    });
  };

  const remove = (userId: string) => {
    setBusyAction(true); setError(null);
    void removeHouseholdMember(userId).then((res) => {
      setBusyAction(false);
      if (res.ok) refresh(); else setError(res.error || "Couldn't remove that member.");
    });
  };

  const leave = () => {
    setBusyAction(true); setError(null);
    void leaveHousehold().then((res) => {
      setBusyAction(false);
      if (res.ok) navigate("/app");
      else setError(res.error || "Couldn't leave the household.");
    });
  };

  return (
    <div className="frame">
      <PageHeader
        title={data.household?.name || "Household"}
        sub="Nothing here is visible to anyone until you choose it, account by account. Transactions are never shared."
        actions={isOwner ? <button className="btn" onClick={() => setInviting(true)}>Invite a member</button> : undefined}
      />

      <div className="pills" style={{ marginBottom: 16 }}>
        <button className={tab === "overview" ? "on" : undefined} onClick={() => setTab("overview")}>Overview</button>
        <button className={tab === "members" ? "on" : undefined} onClick={() => setTab("members")}>Members</button>
        <button className={tab === "accounts" ? "on" : undefined} onClick={() => setTab("accounts")}>Accounts</button>
        <button className={tab === "plans" ? "on" : undefined} onClick={() => setTab("plans")}>Plans</button>
      </div>

      {tab === "overview" && (
        <>
          <div className="card pad-lg together" style={{ marginBottom: 16 }}>
            <div className="eyebrow">Together</div>
            <div className="big-num tnum" style={{ margin: "6px 0 2px" }}>{money(data.combined?.netWorth ?? 0)}</div>
            <p className="sub" style={{ margin: "6px 0 0" }}>What the household has chosen to share, summed across everyone.</p>
          </div>

          <div className="sum-strip">
            <button className="card hh-ov-card" onClick={() => setTab("members")}>
              <div className="card-head"><h3>Members</h3><span className="hh-ov-link">See all ›</span></div>
              <div className="hh-ov-avatars">
                {members.map((m, i) => (
                  <div className="tile sm" key={m.userId} style={{ background: cssVar(MEMBER_COLORS[i % MEMBER_COLORS.length]) }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <p className="sub" style={{ margin: "10px 0 0" }}>
                {members.length} {members.length === 1 ? "person" : "people"} · {members.map((m) => `${m.name}${m.isMe ? " (you)" : ""} (${roleLabel[m.role]})`).join(", ")}
              </p>
            </button>

            <button className="card hh-ov-card" onClick={() => setTab("accounts")}>
              <div className="card-head"><h3>Accounts</h3><span className="hh-ov-link">See all ›</span></div>
              <p className="sub" style={{ margin: 0 }}>{mySharedAccountCount} of {myAccounts.length} of your accounts shared</p>
              <p className="sub" style={{ margin: "6px 0 0", color: "var(--jnpr-ink-3)" }}>
                {sharedAccountsByOthers.length > 0
                  ? `Plus ${sharedAccountsByOthers.length} shared by others.`
                  : "Toggle one on to start the combined total above."}
              </p>
            </button>

            <button className="card hh-ov-card" onClick={() => setTab("plans")}>
              <div className="card-head"><h3>Plans</h3><span className="hh-ov-link">See all ›</span></div>
              <p className="sub" style={{ margin: 0 }}>{mySharedPlanCount + sharedPlansByOthers.length} plan{mySharedPlanCount + sharedPlansByOthers.length === 1 ? "" : "s"} shared with {data.household?.name}</p>
              <p className="sub" style={{ margin: "6px 0 0", color: "var(--jnpr-ink-3)" }}>Share one of your own, or start one for the household.</p>
            </button>
          </div>
        </>
      )}

      {tab === "members" && (
        <div className="card">
          <div className="card-head"><h3>Members</h3></div>
          <div className="rows">
            {members.map((m, i) => (
              <div className="share-row" key={m.userId}>
                <div className="tile sm" style={{ background: cssVar(MEMBER_COLORS[i % MEMBER_COLORS.length]) }}>{m.name.charAt(0).toUpperCase()}</div>
                <div className="share-id">
                  <div className="nm">{m.name}{m.isMe ? " (you)" : ""}</div>
                  {isOwner && !m.isMe ? (
                    <select
                      className="mt"
                      value={m.role}
                      disabled={busyRole === m.userId}
                      onChange={(e) => changeRole(m.userId, e.target.value as "member" | "viewer")}
                      style={{ marginTop: 2, background: "var(--jnpr-surface-2)", border: "1px solid var(--jnpr-line)", borderRadius: 7, padding: "3px 6px", fontFamily: "inherit", fontWeight: 600 }}
                    >
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <div className="mt">{roleLabel[m.role]}</div>
                  )}
                </div>
                {isOwner && !m.isMe && (
                  <button className="btn ghost sm" disabled={busyAction} onClick={() => remove(m.userId)}>Remove</button>
                )}
              </div>
            ))}
          </div>
          {isOwner && (
            <button className="ob-add" style={{ marginTop: 14, width: "100%" }} onClick={() => setInviting(true)}>
              + Invite another member
            </button>
          )}
        </div>
      )}

      {tab === "accounts" && (
        <div className="card">
          <div className="card-head"><h3>Choose what to share</h3></div>
          {!isViewer && (
            <button className="ob-add" style={{ marginBottom: 14, width: "100%" }} onClick={() => navigate("/app/connections?add=1")}>
              + Add an account to share
            </button>
          )}
          {myAccounts.length === 0 ? (
            <p className="sub">Link an account first, and it will show up here to share.</p>
          ) : (
            <div className="share-list">
              {myAccounts.map((a) => (
                <AccountRow key={a.account_id} a={a} canToggle={!isViewer} busy={busyAccount === a.account_id} onToggle={(next) => toggleAccount(a, next)} />
              ))}
            </div>
          )}
          {sharedAccountsByOthers.length > 0 && (
            <>
              <div className="card-head" style={{ marginTop: 20 }}><h3>Shared by others</h3></div>
              <div className="share-list">
                {sharedAccountsByOthers.map((a) => (
                  <AccountRow key={`${a.owner_id}:${a.account_id}`} a={a} canToggle={false} busy={false} onToggle={() => {}} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "plans" && (
        <>
          <div className="card">
            <div className="card-head"><h3>Share a plan</h3></div>
            {myPlans.length === 0 ? (
              <p className="sub">Start a plan first, and it will show up here to share.</p>
            ) : (
              <div className="share-list">
                {myPlans.map((p) => (
                  <PlanRow key={p.domain} p={p} canToggle={!isViewer} busy={busyPlan === p.domain} onToggle={(next) => togglePlan(p, next)} />
                ))}
              </div>
            )}
            {!isViewer && (
              <button className="ob-add" style={{ marginTop: 6, width: "100%" }} onClick={() => navigate("/app/plans")}>
                + Create a plan for the household
              </button>
            )}
            {sharedPlansByOthers.length > 0 && (
              <>
                <div className="card-head" style={{ marginTop: 20 }}><h3>Shared by others</h3></div>
                <div className="share-list">
                  {sharedPlansByOthers.map((p) => (
                    <PlanRow key={`${p.owner_id}:${p.domain}`} p={p} canToggle={false} busy={false} onToggle={() => {}} />
                  ))}
                </div>
              </>
            )}
          </div>

          <section className="ex-wrap">
            <div className="ex-lede">
              <h3>Ideas for a household plan</h3>
              <p>Start one of these and it lands on your own Plans page, prefilled and ready to adjust.</p>
            </div>
            <div className="grid ex-grid">
              {FAMILY_EXAMPLES.map((e) => (
                <button
                  key={e.id}
                  className="card plan-ex hh-ov-card"
                  style={{ width: "100%" }}
                  onClick={() => navigate(`/app/plans?new=${domainFromName(e.title)}`)}
                >
                  <div className="ex-top">
                    <span className="ex-ic" style={{ background: cssVar(e.color) }}><PlanIcon name={SHAPE_ICON[e.shape]} /></span>
                    <div className="ex-head-txt">
                      <div className="ex-t">{e.title}</div>
                    </div>
                  </div>
                  <p className="ex-b">{e.blurb}</p>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      <button className="btn ghost" style={{ marginTop: 16 }} onClick={leave} disabled={busyAction}>Leave household</button>

      {inviting && <InviteHouseholdModal onClose={() => { setInviting(false); refresh(); }} />}
    </div>
  );
}
