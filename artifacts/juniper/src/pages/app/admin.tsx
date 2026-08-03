import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { fetchSubmissions, moderateSubmission, type Submission } from "@/lib/admin";

type Filter = "pending" | "all";

const statusChip: Record<Submission["status"], { cls: string; label: string }> = {
  pending: { cls: "fair", label: "Pending" },
  approved: { cls: "exc", label: "Approved" },
  rejected: { cls: "fair", label: "Rejected" },
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

export function Admin() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [subs, setSubs] = useState<Submission[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
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
    // Reflect the change: drop from the pending view, or update status in "all".
    setSubs((cur) =>
      filter === "pending"
        ? cur.filter((s) => s.id !== id)
        : cur.map((s) => (s.id === id ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s)),
    );
  };

  const pendingCount = subs.filter((s) => s.status === "pending").length;

  return (
    <div className="frame">
      <PageHeader
        title="Moderation"
        sub="Review merchant self-listings. Approving publishes the offer to the marketplace catalog; rejecting leaves it out."
        actions={
          <div className="pills">
            <button className={filter === "pending" ? "on" : undefined} onClick={() => setFilter("pending")}>Pending</button>
            <button className={filter === "all" ? "on" : undefined} onClick={() => setFilter("all")}>All</button>
          </div>
        }
      />

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
    </div>
  );
}
