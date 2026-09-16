import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import {
  fetchSubmissions, moderateSubmission, type Submission,
  fetchCancellationRequests, moderateCancellationRequest, type CancellationRequestRow,
  fetchSignups, type SignupMember,
} from "@/lib/admin";
import { money2 } from "@/lib/txn-format";

type Queue = "submissions" | "cancellations" | "signups";
type Filter = "pending" | "all";
type CancelFilter = "requested" | "all";
type SignupFilter = "all" | SignupMember["status"];
type LoadState = "loading" | "ready" | "forbidden" | "error";

const statusChip: Record<Submission["status"], { cls: string; label: string }> = {
  pending: { cls: "fair", label: "Pending" },
  approved: { cls: "exc", label: "Approved" },
  rejected: { cls: "fair", label: "Rejected" },
};

const cancelChip: Record<CancellationRequestRow["status"], { cls: string; label: string }> = {
  requested: { cls: "fair", label: "Requested" },
  contacted: { cls: "fair", label: "Contacted" },
  confirmed: { cls: "exc", label: "Canceled" },
  failed: { cls: "fair", label: "Couldn't cancel" },
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[+m - 1]} ${+d}, ${y}`;
}

function Row({ s, onModerate, busy }: { s: Submission; onModerate: (id: string, action: "approve" | "reject") => void; busy: boolean }) {
  const chip = statusChip[s.status];
  let host = s.url;
  try { host = new URL(s.url).host; } catch { /* keep raw */ }
  return (
    <div className="sub-row" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="nm">{s.name} <span style={{ fontWeight: 550, color: "var(--jnpr-ink-3)", fontSize: 12 }}>· {s.category}</span></div>
        <div className="mt" style={{ marginTop: 2 }}>
          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="link">{host}</a>
          {" · "}{s.contact_email}{" · "}{fmtDate(s.created_at)}
        </div>
        {s.description && <div style={{ fontSize: 12.5, color: "var(--jnpr-ink-2)", marginTop: 6, lineHeight: 1.5 }}>{s.description}</div>}
      </div>
      {s.status === "pending" ? (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="btn sm" disabled={busy} onClick={() => onModerate(s.id, "approve")}>Approve</button>
          <button className="btn ghost sm" disabled={busy} onClick={() => onModerate(s.id, "reject")}>Reject</button>
        </div>
      ) : (
        <span className={`cr ${chip.cls}`} style={s.status === "rejected" ? { color: "var(--jnpr-bad)", background: "var(--jnpr-bad-soft)" } : undefined}>{chip.label}</span>
      )}
    </div>
  );
}

// A cancellation request is processed by a human, not an API: no partner
// integration exists yet (see api/admin/cancellation-requests.ts), so the
// three actions here ARE the whole mechanism, worked outside the app.
function CancelRow({ r, onModerate, busy }: { r: CancellationRequestRow; onModerate: (id: string, action: "contacted" | "confirmed" | "failed") => void; busy: boolean }) {
  const chip = cancelChip[r.status];
  const open = r.status === "requested" || r.status === "contacted";
  return (
    <div className="sub-row" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="nm">
          {r.stream_name}
          {r.monthly_at_request != null && (
            <span style={{ fontWeight: 550, color: "var(--jnpr-ink-3)", fontSize: 12 }}> · {money2(r.monthly_at_request)}/mo</span>
          )}
        </div>
        <div className="mt" style={{ marginTop: 2 }}>Requested {fmtDate(r.requested_at)}{r.resolved_at && ` · Resolved ${fmtDate(r.resolved_at)}`}</div>
        {r.member_note && <div style={{ fontSize: 12.5, color: "var(--jnpr-ink-2)", marginTop: 6, lineHeight: 1.5 }}>“{r.member_note}”</div>}
        {r.admin_notes && <div style={{ fontSize: 12.5, color: "var(--jnpr-ink-3)", marginTop: 4, lineHeight: 1.5 }}>Note: {r.admin_notes}</div>}
      </div>
      {open ? (
        // .sub-act rather than an ad hoc inline flex group: three buttons is one
        // more than Submissions' Approve/Reject ever needed, and only the real
        // class carries the mobile rule (width:100%;flex-wrap:wrap) that lets
        // them drop to their own full-width, wrapped line instead of
        // overflowing the row past a narrow viewport's edge.
        <div className="sub-act">
          {r.status === "requested" && (
            <button className="btn ghost sm" disabled={busy} onClick={() => onModerate(r.id, "contacted")}>Mark contacted</button>
          )}
          <button className="btn sm" disabled={busy} onClick={() => onModerate(r.id, "confirmed")}>Mark confirmed</button>
          <button className="btn ghost sm" disabled={busy} onClick={() => onModerate(r.id, "failed")}>Mark failed</button>
        </div>
      ) : (
        <span className={`cr ${chip.cls}`} style={r.status === "failed" ? { color: "var(--jnpr-bad)", background: "var(--jnpr-bad-soft)" } : undefined}>{chip.label}</span>
      )}
    </div>
  );
}

function Submissions() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [subs, setSubs] = useState<Submission[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setState("loading");
    const res = await fetchSubmissions(f);
    if (res.ok) { setSubs(res.submissions); setState("ready"); }
    else { setState(res.forbidden ? "forbidden" : "error"); setError(res.error); }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  const onModerate = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    const res = await moderateSubmission(id, action);
    setBusyId(null);
    if (!res.ok) { setError(res.error ?? "Action failed."); return; }
    setError(null);
    setSubs((cur) =>
      filter === "pending"
        ? cur.filter((s) => s.id !== id)
        : cur.map((s) => (s.id === id ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s)),
    );
  };

  const pendingCount = subs.filter((s) => s.status === "pending").length;

  return (
    <>
      <div className="pills" style={{ marginBottom: 14 }}>
        <button className={filter === "pending" ? "on" : undefined} onClick={() => setFilter("pending")}>Pending</button>
        <button className={filter === "all" ? "on" : undefined} onClick={() => setFilter("all")}>All</button>
      </div>

      {error && state === "ready" && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

      {state === "forbidden" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>
          You don’t have access to moderation.
        </div>
      )}
      {state === "error" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>{error || "Something went wrong."}</div>
      )}
      {state === "loading" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Loading…</div>
      )}
      {state === "ready" && (
        <div className="card">
          <div className="card-head">
            <h3>{filter === "pending" ? "Pending review" : "All submissions"}</h3>
            {filter === "pending" && <span className="plaid-pill"><span className="dot" />{pendingCount} pending</span>}
          </div>
          {subs.length ? (
            <div className="rows">
              {subs.map((s) => <Row key={s.id} s={s} onModerate={onModerate} busy={busyId === s.id} />)}
            </div>
          ) : (
            <div style={{ padding: "20px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
              {filter === "pending" ? "Nothing waiting for review. 🎉" : "No submissions yet."}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Cancellations() {
  const [filter, setFilter] = useState<CancelFilter>("requested");
  const [reqs, setReqs] = useState<CancellationRequestRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (f: CancelFilter) => {
    setState("loading");
    const res = await fetchCancellationRequests(f);
    if (res.ok) { setReqs(res.requests); setState("ready"); }
    else { setState(res.forbidden ? "forbidden" : "error"); setError(res.error); }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  const onModerate = async (id: string, action: "contacted" | "confirmed" | "failed") => {
    setBusyId(id);
    const res = await moderateCancellationRequest(id, action);
    setBusyId(null);
    if (!res.ok) { setError(res.error ?? "Action failed."); return; }
    setError(null);
    // "contacted" stays in the requested view (still open); confirmed/failed
    // leave it, matching Submissions' own reflect-without-refetch pattern.
    setReqs((cur) =>
      action === "contacted"
        ? cur.map((r) => (r.id === id ? { ...r, status: "contacted" } : r))
        : filter === "requested"
          ? cur.filter((r) => r.id !== id)
          : cur.map((r) => (r.id === id ? { ...r, status: action } : r)),
    );
  };

  const openCount = reqs.filter((r) => r.status === "requested" || r.status === "contacted").length;

  return (
    <>
      <div className="pills" style={{ marginBottom: 14 }}>
        <button className={filter === "requested" ? "on" : undefined} onClick={() => setFilter("requested")}>Open</button>
        <button className={filter === "all" ? "on" : undefined} onClick={() => setFilter("all")}>All</button>
      </div>

      {error && state === "ready" && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

      {state === "forbidden" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>
          You don’t have access to moderation.
        </div>
      )}
      {state === "error" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>{error || "Something went wrong."}</div>
      )}
      {state === "loading" && (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Loading…</div>
      )}
      {state === "ready" && (
        <div className="card">
          <div className="card-head">
            <h3>{filter === "requested" ? "Open requests" : "All requests"}</h3>
            {filter === "requested" && <span className="plaid-pill"><span className="dot" />{openCount} open</span>}
          </div>
          {reqs.length ? (
            <div className="rows">
              {reqs.map((r) => <CancelRow key={r.id} r={r} onModerate={onModerate} busy={busyId === r.id} />)}
            </div>
          ) : (
            <div style={{ padding: "20px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
              {filter === "requested" ? "Nothing waiting to be canceled." : "No requests yet."}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const signupChip: Record<SignupMember["status"], { cls: string; label: string; style?: React.CSSProperties }> = {
  active: { cls: "exc", label: "Active" },
  onboarding: { cls: "fair", label: "Onboarding" },
  // "Stalled" reuses "fair"'s shape with the same bad-color override Row/
  // CancelRow already use for rejected/failed, rather than a fourth `.cr`
  // variant this page would be the only user of.
  stalled: { cls: "fair", label: "Stalled", style: { color: "var(--jnpr-bad)", background: "var(--jnpr-bad-soft)" } },
};

// "3d ago" / "2w ago", for a timestamp read as recency rather than a date
// (fmtDate above is for a date read as a date, e.g. "Sep 15, 2026").
function relTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function SignupRow({ m }: { m: SignupMember }) {
  const chip = signupChip[m.status];
  return (
    <div className="sub-row" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="nm">{m.name || m.email}</div>
        <div className="mt" style={{ marginTop: 2 }}>
          {m.name ? `${m.email} · ` : ""}
          Signed up {fmtDate(m.signedUp)}
          {" · "}{m.accounts} account{m.accounts === 1 ? "" : "s"}
          {" · "}{m.plans} plan{m.plans === 1 ? "" : "s"}
          {" · "}Active {relTime(m.lastActive)}
        </div>
      </div>
      <span className={`cr ${chip.cls}`} style={chip.style}>{chip.label}</span>
    </div>
  );
}

// Read-only, unlike Submissions/Cancellations: there is nothing here to
// approve or reject, only real signup and usage facts (see api/admin/
// signups.ts for exactly what "activated" and "last active" mean, and why
// income/expenses/savings/debt/goals are deliberately absent — the same
// cleanup that dropped them from the admin Sheet).
function SignupsUsage() {
  const [members, setMembers] = useState<SignupMember[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SignupFilter>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState("loading");
      const res = await fetchSignups();
      if (cancelled) return;
      if (res.ok) { setMembers(res.members); setState("ready"); }
      else { setState(res.forbidden ? "forbidden" : "error"); setError(res.error); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "forbidden") {
    return <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>You don’t have access to this page.</div>;
  }
  if (state === "error") {
    return <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>{error || "Something went wrong."}</div>;
  }
  if (state === "loading") {
    return <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Loading…</div>;
  }

  const total = members.length;
  const activated = members.filter((m) => m.status === "active").length;
  const weeklyActive = members.filter((m) => (Date.now() - new Date(m.lastActive).getTime()) / 86400000 <= 7).length;
  const onboarding = members.filter((m) => m.status === "onboarding").length;
  const newThisWeek = members.filter((m) => (Date.now() - new Date(m.signedUp).getTime()) / 86400000 <= 7).length;

  const q = query.trim().toLowerCase();
  const shown = members.filter((m) => {
    const matchesQ = !q || m.email.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q);
    const matchesFilter = filter === "all" || m.status === filter;
    return matchesQ && matchesFilter;
  });

  return (
    <>
      <div className="adm-kpis" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="eyebrow">Total sign-ups</div>
          <div className="adm-kpi-num">{total}</div>
          <div className="mt" style={{ color: "var(--jnpr-good)" }}>{newThisWeek} this week</div>
        </div>
        <div className="card">
          <div className="eyebrow">Activated</div>
          <div className="adm-kpi-num">{activated}</div>
          <div className="mt">{total ? Math.round((activated / total) * 100) : 0}% of sign-ups</div>
        </div>
        <div className="card">
          <div className="eyebrow">Weekly active</div>
          <div className="adm-kpi-num">{weeklyActive}</div>
          <div className="mt">linked or opened in 7d</div>
        </div>
        <div className="card">
          <div className="eyebrow">Onboarding</div>
          <div className="adm-kpi-num">{onboarding}</div>
          <div className="mt">connect-accounts step</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="search" style={{ flex: 1, minWidth: 180 }}>
          <SearchIcon />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" />
        </span>
        <div className="pills">
          {(["all", "active", "onboarding", "stalled"] as SignupFilter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : undefined} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : signupChip[f].label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card">
        <div className="card-head">
          <h3>Members</h3>
          <span className="plaid-pill"><span className="dot" />{shown.length} shown</span>
        </div>
        {shown.length ? (
          <div className="rows">
            {shown.map((m) => <SignupRow key={m.userId} m={m} />)}
          </div>
        ) : (
          <div style={{ padding: "20px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
            No members match.
          </div>
        )}
      </div>
    </>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

export function Admin() {
  const [queue, setQueue] = useState<Queue>("submissions");

  return (
    <div className="frame">
      <PageHeader
        title="Moderation"
        sub={
          queue === "submissions"
            ? "Review merchant self-listings. Approving publishes the offer to the marketplace catalog; rejecting leaves it out."
            : queue === "cancellations"
              ? "Cancellation requests, processed by hand: no partner API exists to cancel a subscription through yet. Contact the merchant outside Juniper, then report back here."
              : "Real sign-up and usage facts, read live from Supabase: who's signed up, who's linked an account, who's stalled. No income, expenses, savings, debt, or goals here — that's not what usage means."
        }
        actions={
          <div className="pills">
            <button className={queue === "submissions" ? "on" : undefined} onClick={() => setQueue("submissions")}>Submissions</button>
            <button className={queue === "cancellations" ? "on" : undefined} onClick={() => setQueue("cancellations")}>Cancellations</button>
            <button className={queue === "signups" ? "on" : undefined} onClick={() => setQueue("signups")}>Sign-ups</button>
          </div>
        }
      />
      {queue === "submissions" ? <Submissions /> : queue === "cancellations" ? <Cancellations /> : <SignupsUsage />}
    </div>
  );
}
