import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Check, ArrowLeft } from "lucide-react";
import { DialogueInterface } from "@/components/dialogue/dialogue-interface";
import { PlanAffiliatePicks } from "@/components/plan/affiliate-card";
import { PlanProjection } from "@/components/plan/plan-projection";
import { NextActionLink } from "@/components/plan/next-action-link";
import { DebtListSection } from "@/components/plan/debt-list";
import { PlanChat } from "@/components/plan/plan-chat";
import { InvitePartnerCard } from "@/components/plan/invite-partner-card";
import { PlanAlignment } from "@/components/plan/plan-alignment";
import {
  fetchPlan,
  savePlan,
  type Plan,
  type PlanKpi,
  type PlanMilestone,
  type PlanNextAction,
  type DebtItem,
} from "@/lib/plans";
import { getClientScript } from "@/lib/dialogue-scripts";
import { useSession } from "@/lib/use-session";
import { UserProfile } from "@/lib/profile";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type Props = {
  domain: string;
  profile: UserProfile | null;
  onPlanChanged?: () => void;
};

export function PlanDetail({ domain, profile, onPlanChanged }: Props) {
  const session = useSession();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const script = getClientScript(domain);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlan(domain).then((p) => {
      if (!cancelled) {
        setPlan(p);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  if (loading || session === undefined) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: muted,
          fontFamily: sans,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!script) {
    return (
      <div style={{ padding: 40, fontFamily: sans, color: muted }}>
        <p>Unknown plan domain: {domain}</p>
        <Link href="/app" style={{ color: sage }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  const currentUserId = session?.user.id ?? null;
  const isPartner = !!plan && !!currentUserId && plan.partner_user_id === currentUserId;
  const isInviter = !!plan && !!currentUserId && plan.user_id === currentUserId;

  // Partner who hasn't finished their dialogue yet → show DialogueInterface in partner mode.
  if (plan && isPartner && plan.partner_dialogue_status !== "completed") {
    return (
      <DialogueInterface
        domain={domain}
        profile={profile}
        initialPlan={plan}
        role="partner"
        onPlanCompleted={(saved) => {
          setPlan(saved);
          onPlanChanged?.();
        }}
      />
    );
  }

  // Inviter with a completed plan, or partner who has finished their dialogue → PlanView.
  if (plan?.status === "completed") {
    return (
      <PlanView
        initialPlan={plan}
        onRestart={() => {
          setPlan({ ...plan, status: "in_progress", current_step_index: 0, dialogue_history: [] });
        }}
        onPlanChanged={onPlanChanged}
        viewerIsInviter={isInviter}
        connections={profile?.connections ?? []}
      />
    );
  }

  // Inviter still in dialogue → DialogueInterface in inviter mode.
  return (
    <DialogueInterface
      domain={domain}
      profile={profile}
      initialPlan={plan}
      role="inviter"
      onPlanCompleted={(saved) => {
        setPlan(saved);
        onPlanChanged?.();
      }}
    />
  );
}

function stripEmDashes(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/\s+--\s+/g, ", ");
}

// ── PlanView (editable) ────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved";

function PlanView({
  initialPlan,
  onRestart,
  onPlanChanged,
  viewerIsInviter,
  connections,
}: {
  initialPlan: Plan;
  onRestart: () => void;
  onPlanChanged?: () => void;
  viewerIsInviter: boolean;
  connections: string[];
}) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // "How?" on a next action bumps this nonce to auto-ask the plan chat.
  const [ask, setAsk] = useState<{ text: string; nonce: number }>({ text: "", nonce: 0 });
  function askJuniper(label: string) {
    setAsk((a) => ({
      text: `Walk me through this step from my plan: "${label}". Give me 2 to 4 concrete moves I can take, in plain language.`,
      nonce: a.nonce + 1,
    }));
  }
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;

  const summary = plan.goal?.summary ? stripEmDashes(plan.goal.summary).trim() : undefined;
  const isLight =
    (!plan.kpis || plan.kpis.length === 0) &&
    (!plan.milestones || plan.milestones.length === 0) &&
    (!plan.next_actions || plan.next_actions.length === 0);

  function scheduleSave(next: Plan) {
    setPlan(next);
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const saved = await savePlan({
        domain: next.domain,
        kpis: next.kpis,
        milestones: next.milestones,
        next_actions: next.next_actions,
        current_state: next.current_state,
      });
      if (saved) {
        setSaveStatus("saved");
        onPlanChanged?.();
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1800);
      } else {
        setSaveStatus("idle");
      }
    }, 800);
  }

  function updateKpiCurrent(index: number, current: number) {
    const kpis = plan.kpis.map((k, i) => (i === index ? { ...k, current } : k));
    scheduleSave({ ...plan, kpis });
  }
  function updateMilestoneCurrent(index: number, current_value: number) {
    const milestones = plan.milestones.map((m, i) => (i === index ? { ...m, current_value } : m));
    scheduleSave({ ...plan, milestones });
  }
  function toggleMilestone(index: number) {
    const milestones = plan.milestones.map((m, i) => {
      if (i !== index) return m;
      return { ...m, completed_at: m.completed_at ? null : new Date().toISOString() };
    });
    scheduleSave({ ...plan, milestones });
  }
  function toggleNextAction(index: number) {
    const next_actions = plan.next_actions.map((a, i) =>
      i === index ? { ...a, completed: !a.completed } : a,
    );
    scheduleSave({ ...plan, next_actions });
  }
  function updateNextActionNote(index: number, note: string) {
    const next_actions = plan.next_actions.map((a, i) =>
      i === index ? { ...a, note: note.trim() || undefined } : a,
    );
    scheduleSave({ ...plan, next_actions });
  }
  // User's chosen monthly amount, stored in current_state.collected so the
  // projection can recompute the timeline at that rate.
  function updateMonthlyContribution(value: number) {
    const collected = {
      ...((plan.current_state?.collected as Record<string, unknown>) ?? {}),
      monthly_contribution: value,
    };
    scheduleSave({ ...plan, current_state: { ...(plan.current_state ?? {}), collected } });
  }
  function updateDebts(debts: DebtItem[]) {
    scheduleSave({ ...plan, current_state: { ...(plan.current_state ?? {}), debts } });
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", background: cream }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 28px 80px" }}>
        <Link
          href="/app"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: sans,
            fontSize: 13,
            fontWeight: 500,
            color: muted,
            textDecoration: "none",
            marginBottom: 20,
          }}
        >
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: sage,
              margin: 0,
              fontFamily: sans,
            }}
          >
            Your Home Buying plan
          </p>
          <SaveIndicator status={saveStatus} />
        </div>
        <h1
          style={{
            fontFamily: serif,
            fontSize: "clamp(26px, 4vw, 34px)",
            fontWeight: 400,
            color: ink,
            margin: "0 0 22px",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
          }}
        >
          {plan.goal?.headline ?? "Your plan is set."}
        </h1>

        {summary && (
          <section style={{ marginBottom: 32 }}>
            {summary.split(/\n\n+/).map((para, i) => (
              <p key={i} style={{ fontSize: 16, color: ink, lineHeight: 1.65, margin: "0 0 14px" }}>
                {para.trim()}
              </p>
            ))}
          </section>
        )}

        {isLight && (
          <div
            style={{
              background: "rgba(185,64,64,0.06)",
              border: "1px solid rgba(185,64,64,0.2)",
              borderRadius: 10,
              padding: "14px 18px",
              fontSize: 13.5,
              color: "#b94040",
              margin: "0 0 22px",
              lineHeight: 1.55,
            }}
          >
            This plan saved without KPIs, milestones, or next actions. Likely a generation error.
            Tap "Redo this plan" to try again.
          </div>
        )}

        {plan.kpis?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>KPIs</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {plan.kpis.map((k, i) => (
                <EditableKpiCard
                  key={i}
                  kpi={k}
                  onChangeCurrent={(v) => updateKpiCurrent(i, v)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Interest-aware savings projection. Same gate as the rest of the
            completed-plan view; renders only for savings-projection domains
            with the needed inputs (see planProjectionInput). */}
        {plan.status === "completed" && plan.domain === "debt-paydown" && (
          <DebtListSection
            debts={(plan.current_state?.debts as DebtItem[] | undefined) ?? []}
            onChange={updateDebts}
          />
        )}

        {plan.status === "completed" && (
          <PlanProjection plan={plan} onContributionChange={updateMonthlyContribution} />
        )}

        {plan.milestones?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>Milestones</h2>
            <ul style={listStyle}>
              {plan.milestones.map((m, i) => (
                <EditableMilestoneRow
                  key={i}
                  milestone={m}
                  onToggle={() => toggleMilestone(i)}
                  onChangeCurrent={(v) => updateMilestoneCurrent(i, v)}
                />
              ))}
            </ul>
          </section>
        )}

        {plan.next_actions?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>Next actions</h2>
            <ul style={listStyle}>
              {plan.next_actions.map((a, i) => (
                <EditableNextActionRow
                  key={i}
                  action={a}
                  domain={plan.domain}
                  onToggle={() => toggleNextAction(i)}
                  onNoteChange={(note) => updateNextActionNote(i, note)}
                  onAskJuniper={askJuniper}
                />
              ))}
            </ul>
          </section>
        )}

        {/* Affiliate click-out, gated to a fully generated plan: PlanView only
            mounts when plan.status === "completed", and requiring a NEXT action
            confirms synthesis produced content (excludes the isLight error
            case). Never reachable from the dialogue or an in-progress plan.
            Shown to both inviter and partner. */}
        {plan.status === "completed" && (plan.next_actions?.length ?? 0) > 0 && (
          <PlanAffiliatePicks domain={plan.domain} connections={connections} />
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          <Link
            href="/app"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "transparent",
              color: sage,
              border: `1.5px solid ${sage}`,
              borderRadius: 8,
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Back to dashboard
          </Link>
          <button
            onClick={onRestart}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: muted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Redo this plan
          </button>
        </div>

        {viewerIsInviter && plan.partner_dialogue_status !== "completed" && (
          <div style={{ marginTop: 32 }}>
            <InvitePartnerCard plan={plan} onInviteCreated={() => onPlanChanged?.()} />
          </div>
        )}

        {plan.partner_dialogue_status === "completed" && (
          <PlanAlignment plan={plan} youAreInviter={viewerIsInviter} />
        )}

        <PlanChat plan={plan} autoAsk={ask.text} autoAskNonce={ask.nonce} />
      </div>
    </div>
  );
}

// ── Save indicator ─────────────────────────────────────────────────────
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: muted,
          fontFamily: sans,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: sage,
            display: "inline-block",
          }}
        />
        Saved · find it on your dashboard
      </span>
    );
  }
  const label = status === "saving" ? "Saving…" : "Saved";
  const dotColor = status === "saving" ? muted : sage;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: muted,
        fontFamily: sans,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

// ── Editable KPI card ──────────────────────────────────────────────────
function EditableKpiCard({
  kpi,
  onChangeCurrent,
}: {
  kpi: PlanKpi;
  onChangeCurrent: (v: number) => void;
}) {
  const pct = kpi.target !== 0 ? Math.min(100, Math.max(0, (kpi.current / kpi.target) * 100)) : 0;
  return (
    <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
      <p style={{ fontSize: 12, color: muted, margin: "0 0 4px", fontFamily: sans }}>{kpi.label}</p>
      <p style={{ fontFamily: serif, fontSize: 20, color: ink, margin: "0 0 10px" }}>
        <EditableNumber
          value={kpi.current}
          onChange={onChangeCurrent}
          format={(v) => formatKpi(v, kpi.unit)}
        />{" "}
        <span style={{ color: muted, fontSize: 14 }}>/ {formatKpi(kpi.target, kpi.unit)}</span>
      </p>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "rgba(92,122,101,0.12)",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: sage, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ── Editable milestone row ─────────────────────────────────────────────
function EditableMilestoneRow({
  milestone,
  onToggle,
  onChangeCurrent,
}: {
  milestone: PlanMilestone;
  onToggle: () => void;
  onChangeCurrent: (v: number) => void;
}) {
  const completed = !!milestone.completed_at;
  return (
    <li
      style={{
        background: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <button
        onClick={onToggle}
        aria-label={completed ? "Mark milestone incomplete" : "Mark milestone complete"}
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          border: `1.5px solid ${completed ? sage : border}`,
          background: completed ? sage : "#fff",
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {completed && <Check size={13} color="#fff" strokeWidth={3} />}
      </button>
      <span
        style={{
          color: completed ? muted : ink,
          fontSize: 15,
          flex: 1,
          textDecoration: completed ? "line-through" : "none",
        }}
      >
        {milestone.label}
      </span>
      {typeof milestone.target_value === "number" && (
        <span style={{ color: muted, fontSize: 13, fontFamily: sans }}>
          (<EditableNumber
            value={milestone.current_value}
            onChange={onChangeCurrent}
            format={(v) => v.toLocaleString()}
          />{" "}
          / {milestone.target_value.toLocaleString()})
        </span>
      )}
    </li>
  );
}

// ── Editable next-action row ───────────────────────────────────────────
function EditableNextActionRow({
  action,
  domain,
  onToggle,
  onNoteChange,
  onAskJuniper,
}: {
  action: PlanNextAction;
  domain: string;
  onToggle: () => void;
  onNoteChange: (note: string) => void;
  onAskJuniper: (label: string) => void;
}) {
  return (
    <li
      style={{
        background: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <span
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            border: `1.5px solid ${action.completed ? sage : border}`,
            background: action.completed ? sage : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {action.completed && <Check size={13} color="#fff" strokeWidth={3} />}
        </span>
        <span
          style={{
            color: action.completed ? muted : ink,
            fontSize: 15,
            flex: 1,
            textDecoration: action.completed ? "line-through" : "none",
          }}
        >
          {action.label}
        </span>
        <NextActionLink domain={domain} label={action.label} onAskJuniper={onAskJuniper} />
      </div>
      <NoteField note={action.note ?? ""} onCommit={onNoteChange} />
    </li>
  );
}

// Optional per-action note (confirmation #, account name, a reminder). Starts
// as a subtle "Add a note" affordance; persists on blur.
function NoteField({ note, onCommit }: { note: string; onCommit: (note: string) => void }) {
  const [open, setOpen] = useState(note.length > 0);
  const [text, setText] = useState(note);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          alignSelf: "flex-start",
          marginLeft: 32,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: sans,
          fontSize: 12.5,
          color: sage,
          fontWeight: 500,
          padding: 0,
        }}
      >
        + Add a note
      </button>
    );
  }

  return (
    <input
      type="text"
      value={text}
      autoFocus={note.length === 0}
      placeholder="Add a note, e.g. account name or confirmation #"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== note) onCommit(text);
        if (text.trim().length === 0) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{
        marginLeft: 32,
        width: "calc(100% - 32px)",
        boxSizing: "border-box",
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontFamily: sans,
        fontSize: 13.5,
        color: ink,
        outline: "none",
        background: "rgba(92,122,101,0.04)",
      }}
    />
  );
}

// ── Editable inline number (click to edit) ─────────────────────────────
function EditableNumber({
  value,
  onChange,
  format,
}: {
  value: number;
  onChange: (n: number) => void;
  format: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const cleaned = draft.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed !== value) onChange(parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          color: ink,
          background: "rgba(92,122,101,0.06)",
          border: `1px solid ${sage}`,
          borderRadius: 4,
          padding: "1px 6px",
          width: Math.max(60, draft.length * 9 + 16),
          outline: "none",
        }}
      />
    );
  }
  return (
    <span
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      style={{
        cursor: "text",
        borderBottom: `1px dashed ${border}`,
        padding: "0 2px",
      }}
      title="Click to edit"
    >
      {format(value)}
    </span>
  );
}

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 14px",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

function formatKpi(v: number, unit: string): string {
  if (unit === "$") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return `${v} ${unit}`;
}
