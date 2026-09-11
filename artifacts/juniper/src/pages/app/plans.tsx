import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader } from "@/components/juniper/app-frame";
import { money } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { useThreads, previewOf, relativeTime, takePendingChatDraft, type PlanDraftFromChat } from "@/lib/planner";
import { useSession } from "@/lib/use-session";
import { cssVar, PlanIcon } from "@/components/juniper/primitives";
import {
  useMemberPlans,
  savePlan,
  deletePlan,
  planShape,
  planColor,
  planTitle,
  planNumbers,
  planIcon,
  suggestShape,
  domainFromName,
  uniqueDomain,
  monthsToClose,
  monthLabelFromNow,
  formatTargetDate,
  PLAN_COLORS,
  SHAPE_ICON,
  type Plan,
  type PlanColor,
  type PlanGoal,
  type PlanShape,
  type DebtItem,
  GOAL_ROUTES,
  unplannedGoals,
  type UnplannedGoal,
} from "@/lib/plans";
import { DebtBreakdown } from "@/components/juniper/debt-breakdown";
import { InvestmentBreakdown } from "@/components/juniper/investment-breakdown";
import type { UserProfile } from "@/lib/profile";
// The plan-create form and its shared building blocks live here now, so
// pages/app/household.tsx can mount the exact same form in place (issue #338
// follow-up) rather than navigating to this page and back. EditForm below is
// this page's own and stays here, but it shares Draft/DraftFields/goalFrom
// with CreateForm, which is why those are imported rather than redefined.
import {
  CreateForm,
  Backdrop,
  DraftFields,
  goalFrom,
  balancesFromFinances,
  prefillFor,
  parseNum,
  numStr,
  SHAPE_COPY,
  type PrefillKey,
  type Seed,
  type Draft,
} from "@/components/juniper/plan-create-form";

type Filter = "active" | "completed" | "all";

type ModalState =
  | null
  | { k: "new" }
  | {
      k: "form"; label: string; shape: PlanShape; color: PlanColor; prefill: PrefillKey; icon?: string;
      fromGoal?: boolean; seed?: Seed; chatDraft?: PlanDraftFromChat;
    }
  | { k: "edit"; domain: string };

// `icon` overrides the shape's default mark (SHAPE_ICON) for this template
// and rides along onto the plan it creates (goal.icon in lib/plans.ts), so a
// wedding keeps its own icon forever rather than reverting to `save`'s
// generic target the moment it becomes a real row. Omitted where the shape's
// own default already fits (a home, a payoff).
// Exported so household.tsx can resolve the same "Custom goal" template for
// its own plain "Create a plan for the household" button, rather than
// inventing a second definition of it.
export const TEMPLATES: { label: string; shape: PlanShape; color: PlanColor; prefill: PrefillKey; icon?: string }[] = [
  { label: "Buy a home", shape: "buy", color: "--jnpr-c1", prefill: "cash" },
  { label: "Pay off debt", shape: "payoff", color: "--jnpr-c4", prefill: "debt" },
  { label: "Emergency fund", shape: "save", color: "--jnpr-c3", prefill: "emergency", icon: "shield" },
  { label: "Baby and family", shape: "save", color: "--jnpr-c5", prefill: null, icon: "baby" },
  { label: "Invest for retirement", shape: "save", color: "--jnpr-c2", prefill: "invest" },
  { label: "Custom goal", shape: "save", color: "--jnpr-c6", prefill: null },
  // Issue #262: the shapes/templates that were missing. Income is a real new
  // PlanShape (see lib/plans.ts) because it needs its own math; the rest are
  // save/buy goals wearing their own name and icon, deliberately not new
  // shapes, since none of them needs math save/buy cannot already express.
  { label: "Grow your income", shape: "income", color: "--jnpr-c7", prefill: null, icon: "income" },
  { label: "Wedding", shape: "save", color: "--jnpr-c5", prefill: null, icon: "wedding" },
  { label: "New car", shape: "buy", color: "--jnpr-c1", prefill: "cash", icon: "car" },
  { label: "Education", shape: "save", color: "--jnpr-c2", prefill: null, icon: "education" },
  { label: "Moving", shape: "save", color: "--jnpr-c6", prefill: null, icon: "moving" },
  { label: "Sabbatical", shape: "save", color: "--jnpr-c3", prefill: null, icon: "sun" },
];

// How the "Start a new plan" picker groups the templates above: by what the
// plan actually tracks, not by when it was added, so a member sees at a
// glance that a wedding and an emergency fund work the same way and a raise
// does not. Purely a picker-layout concern; a template's own `shape` is what
// decides the plan's math either way.
const TEMPLATE_GROUPS: { label: string; templates: string[] }[] = [
  { label: "Saving up", templates: ["Emergency fund", "Baby and family", "Wedding", "Education", "Moving", "Sabbatical"] },
  { label: "Buying", templates: ["Buy a home", "New car"] },
  { label: "Paying off", templates: ["Pay off debt"] },
  { label: "Growing income", templates: ["Grow your income"] },
  { label: "Other", templates: ["Invest for retirement", "Custom goal"] },
];

// One group's header plus its templates, inside the shared `.tmpl-grid`
// (the label spans the full grid row via `.tmpl-group-lbl`, same trick a
// table-of-contents divider uses). A separate component only so the "new"
// modal's JSX below reads as one line per group rather than a nested map.
function SectionOfTemplates({ group, onPick }: {
  group: { label: string; templates: string[] };
  onPick: (t: (typeof TEMPLATES)[number]) => void;
}) {
  const items = group.templates
    .map((label) => TEMPLATES.find((t) => t.label === label))
    .filter((t): t is (typeof TEMPLATES)[number] => !!t);
  if (!items.length) return null;
  return (
    <>
      <div className="tmpl-group-lbl">{group.label}</div>
      {items.map((t) => (
        <button key={t.label} className="tmpl" onClick={() => onPick(t)}>
          <span className="tmpl-ic" style={{ background: cssVar(t.color) }}><PlanIcon name={t.icon ?? SHAPE_ICON[t.shape]} /></span>{t.label}
        </button>
      ))}
    </>
  );
}

// A stable color for a plan draft that has no list position to spread by
// (offerFor's callers all have one; a chat draft does not). Cheap and
// deterministic is all this needs: the member can change it in the picker,
// and `planColor` will derive its own hash from the domain later regardless.
function colorForName(name: string): PlanColor {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PLAN_COLORS[Math.abs(h) % PLAN_COLORS.length];
}

// Per-shape FAQs, the questions people actually ask about a goal framed this
// way. They open the AI planner (Ask Juniper) pre-seeded and scoped to the plan.
const FAQS: Record<PlanShape, string[]> = {
  save: ["How much should I set aside each month?", "Where should I keep this money?", "Am I saving fast enough?"],
  buy: ["How much can I afford?", "How big a down payment do I need?", "Should I clear debt before I buy?"],
  payoff: ["What is the fastest way to pay this off?", "Avalanche or snowball for me?", "Should I consolidate or refinance?"],
  income: ["What's the fastest way to raise my income?", "Should I ask for a raise or switch jobs?", "How do I build a side income stream?"],
};

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.7A8 8 0 1121 12z" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
);

// Local rather than added to the shared ICONS map in primitives.tsx: this is
// the only surface with an inline edit, and a plan shape icon and an edit
// affordance are different kinds of thing.
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15.5 4.5l4 4L8 20H4v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* ------------------------------------------------------------------ *
 * Inline edit: one field, opened in place.
 *
 * Same keys the retired plan detail used, so the habit carries over: Enter
 * commits, Escape reverts, clicking away commits. `doneRef` rather than state
 * because Enter fires the commit and then blur fires straight after it, and a
 * state flag read on that second call is still the value from before the
 * render.
 * ------------------------------------------------------------------ */
function InlineField({ kind, initial, label, onCommit, onCancel }: {
  kind: "title" | "target";
  initial: string;
  label: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save) onCommit(value); else onCancel();
  };
  return (
    <input
      className={`inline-in ${kind === "title" ? "t" : "n"}`}
      autoFocus
      aria-label={label}
      value={value}
      inputMode={kind === "target" ? "numeric" : undefined}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Real plans: one row -> everything the card needs.
 * ------------------------------------------------------------------ */

type PlanView = {
  domain: string;
  title: string;
  shape: PlanShape;
  icon: string;
  color: PlanColor;
  current: number;
  target: number;
  pct: number;
  monthly: number | null;
  rate: number | null;
  dateLabel: string | null;
  done: boolean;
  statusClass: "ok" | "new" | "setup" | "done";
  statusLabel: string;
  note: string;
  next: string;
};

function viewOf(plan: Plan): PlanView {
  const shape = planShape(plan);
  const copy = SHAPE_COPY[shape];
  const { current, target, monthly, targetDate, rate } = planNumbers(plan);
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
  const done = plan.status === "completed";

  // Income has no monthly figure and no rate, so there is no pace to project
  // from: `months` stays null and a date only ever shows when the member set
  // one explicitly. Inventing a raise-and-therefore-date the same way `save`
  // projects a savings pace would be a number nobody gave us.
  const months = shape === "income"
    ? null
    // A payoff balance keeps accruing, so its finish line has to account for
    // the rate. Saving gets rate 0 on purpose: we do not know what yield the
    // member's cash earns, and inventing one would overstate their pace.
    : monthsToClose(remaining, monthly, shape === "payoff" ? (rate ?? 0) : 0);
  const dateLabel = targetDate
    ? `${copy.readyPrefix} ${formatTargetDate(targetDate)}`
    : months != null && months > 0
      ? `${copy.readyPrefix} ${monthLabelFromNow(months)}`
      : null;

  let statusClass: PlanView["statusClass"] = "ok";
  let statusLabel = "On track";
  let next = "";
  if (done) {
    statusClass = "done";
    statusLabel = "Completed";
    next = "Goal reached.";
  } else if (target <= 0) {
    statusClass = "setup";
    statusLabel = "Setup";
    next = `Add a ${shape === "payoff" ? "balance" : shape === "income" ? "target income" : "target amount"} so Juniper can track this.`;
  } else if (shape === "income") {
    // No monthly-contribution concept to be "New" about: the plan is either
    // set up (a target exists) and in progress, or it has reached the target.
    statusClass = current >= target ? "done" : "ok";
    statusLabel = current >= target ? "Reached" : "In progress";
    next = current >= target ? "You've hit your target income." : "Ask Juniper for steps to close the gap.";
  } else if (monthly == null || monthly <= 0) {
    statusClass = "new";
    statusLabel = "New";
    next = "Set a monthly amount to get a finish date.";
  } else {
    next = `Keep ${copy.contribVerb.toLowerCase()} ${money(monthly)} a month to stay on pace.`;
  }

  const note = done
    ? "Completed"
    : target > 0
      ? shape === "payoff"
        ? `${money(remaining)} left${rate != null ? ` at ${rate.toFixed(1)}%` : ""}`
        : shape === "income"
          ? remaining > 0 ? `${money(remaining)} more to reach your target` : "Target income reached"
          : `${money(remaining)} to go`
      : "No target set yet";

  return {
    domain: plan.domain, title: planTitle(plan), shape, icon: planIcon(plan), color: planColor(plan),
    current, target, pct, monthly, rate, dateLabel,
    done, statusClass, statusLabel, note, next,
  };
}

function PlanCard({ v, onOpen, onAsk, chatCount, onPatch }: {
  v: PlanView;
  onOpen: () => void;
  onAsk: () => void;
  chatCount: number;
  /** Write one changed field back to the row. Resolves false if it did not save. */
  onPatch: (patch: { name?: string; target?: number }) => Promise<boolean>;
}) {
  const copy = SHAPE_COPY[v.shape];
  // Which field is open, if any. One at a time: two live inputs on one card
  // means two pending writes racing over the same row.
  const [editing, setEditing] = useState<null | "title" | "target">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const commit = async (field: "title" | "target", raw: string) => {
    setEditing(null);
    setError("");
    const patch: { name?: string; target?: number } = {};
    if (field === "title") {
      const name = raw.trim();
      // An empty title is not a save. A plan with no name reads as a bug on
      // every other surface, so a cleared field reverts instead of writing.
      if (!name || name === v.title) return;
      patch.name = name;
    } else {
      const target = parseNum(raw);
      // Nothing is written until a target is set, which cuts both ways: a zero
      // typed here is a cleared field, not a request for a plan Juniper cannot
      // track. Clearing a target back to nothing stays in the modal, where the
      // consequence is spelled out.
      if (target <= 0 || target === v.target) return;
      patch.target = target;
    }
    setBusy(true);
    const ok = await onPatch(patch);
    setBusy(false);
    if (!ok) setError("That did not save. Check your connection and try again.");
  };

  const pencil = (field: "title" | "target", label: string) => (
    <button
      className="pen"
      disabled={busy}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); setError(""); setEditing(field); }}
    >
      <PencilIcon />
    </button>
  );

  return (
    // Deliberately NOT role="button". A plan card contains a button already
    // (Ask Juniper), and interactive content nested inside a button is invalid
    // and announces badly. The click here is a mouse shortcut layered over the
    // real control in the footer, which is a button, focusable, and labelled.
    //
    // The shortcut stands down while a field is open. Clicking away from an
    // inline edit is how you commit it, and having that same click also throw
    // the full modal over the card makes the quick route slower than the one
    // it was meant to replace.
    <div className={`card plan-lg ${v.done ? "done" : ""}`} onClick={() => { if (!editing) onOpen(); }}>
      <div className="ph">
        <div className="track" style={{ background: cssVar(v.color) }}><PlanIcon name={v.icon} /></div>
        <div className="ph-title">
          {editing === "title" ? (
            <InlineField
              kind="title"
              initial={v.title}
              label={`Rename ${v.title}`}
              onCommit={(raw) => void commit("title", raw)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="pt">
              {v.title}
              {pencil("title", `Rename ${v.title}`)}
            </div>
          )}
          <div className="pn">{v.note}</div>
        </div>
        <span className={`status ${v.statusClass}`}>{v.statusLabel}</span>
      </div>
      <div className="body">
        <div className="nums">
          <div className="big tnum">
            {editing === "target" ? (
              <InlineField
                kind="target"
                initial={numStr(v.target)}
                label={`${copy.targetLabel} for ${v.title}`}
                onCommit={(raw) => void commit("target", raw)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                {v.target > 0 ? money(v.current) : "Not set"}
                {v.target > 0 ? <small> / {money(v.target)}</small> : null}
                {pencil("target", `${copy.targetLabel} for ${v.title}`)}
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>{v.pct}% {copy.progressWord}</div>
        </div>
        <div className="bar"><i style={{ width: `${v.pct}%`, background: cssVar(v.color) }} /></div>
        <div className="plan-meta">
          {copy.contribVerb && <span>{copy.contribVerb} <b>{v.monthly ? `${money(v.monthly)}/mo` : "not set"}</b></span>}
          {v.dateLabel && <span className="pm-date">{v.dateLabel}</span>}
        </div>
        <div className="next"><b>{v.done ? "Outcome:" : "Next:"}</b> {v.next}</div>
        {error && <div className="plan-err">{error}</div>}
        <div className="plan-foot">
          <button
            className="edit-hint"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            // Named for the plan, because a list of these all reading "View and
            // edit" tells a screen reader user nothing about which one.
            aria-label={`View and edit ${v.title}`}
          >
            View and edit
          </button>
          <button className="plan-ask" onClick={(e) => { e.stopPropagation(); onAsk(); }}>
            <ChatIcon />Ask Juniper{chatCount > 0 && <span className="pa-badge">{chatCount}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Goals from signup: the member's own words, not plans yet.
 *
 * Onboarding's goals step asks "What are you working toward?" and promises
 * "We'll shape your plans and recommendations around these", then stores the
 * answers as a string array on the profile. Nothing ever turned them into plan
 * rows, so a member who typed "Nomad" at signup came here and read "No plans
 * yet". This section is the bridge: it shows the goals that have no plan and
 * hands each one to the same create flow the New plan button uses.
 *
 * It is not a plan list. These rows carry no target, no monthly amount and no
 * date, because the member never gave us any, so they render as chips, are
 * never counted in `views`, and never reach Overview.
 * ------------------------------------------------------------------ */

// What a signup goal maps onto. Keyed by the goal's slug from `domainFromName`,
// which is what makes every lookup here case- and punctuation-insensitive
// without a second normalizer: "Buy a home", "buy a home" and "BUY A HOME" all
// arrive as "buy-a-home".
// An income goal is a "get more" word plus an "earnings" word, in either order.
// Two lists rather than one so "save 10% of my income" (earnings word, no
// increase word) stays a plannable savings goal. Word boundaries, not
// substrings, so "increase my down payment" is not read as income just because
// "payment" contains "pay".
const MORE_RE = /\b(increase|increasing|grow|growing|boost|raise|higher|more|double)\b/;
const EARN_RE = /\b(income|salary|salaries|pay|paycheck|earn|earnings|wage|wages|job|career)\b/;

// The one preset that no plan shape can hold honestly. "Increase my income" has
// nothing to save toward, nothing to buy and no balance to clear, so all three
// shapes are fictions and `suggestShape` would default it to "save": we would
// be inventing a savings target the member never set. It gets the planner
// instead, which can actually work on it, and the chip says why. Matched on the
// words rather than the exact preset label so a hand-typed "get a higher paying
// job" lands in the same place.
function isIncomeGoal(goal: string): boolean {
  const g = goal.toLowerCase();
  return MORE_RE.test(g) && EARN_RE.test(g);
}

type GoalOffer = {
  goal: string; // shown verbatim: these are the member's words
  shape: PlanShape;
  color: PlanColor;
  prefill: PrefillKey;
  icon?: string;
};

// "Increase my income" used to have nothing a plan shape could honestly hold
// (no target to save toward, nothing to buy, no balance to clear) and got
// handed to the planner instead. The `income` shape (issue #262) closes that:
// every signup goal now becomes a real plan.
function offerFor(goal: string, i: number): GoalOffer {
  // Spread by list position rather than by hashing: a goal has no `domain` to
  // hash yet, and whatever color is chosen here is written into the plan on
  // create, so the chip and the card that follows it match.
  const color = PLAN_COLORS[i % PLAN_COLORS.length];
  if (isIncomeGoal(goal)) {
    const t = TEMPLATES.find((x) => x.label === "Grow your income")!;
    return { goal, shape: t.shape, color: t.color, prefill: t.prefill, icon: t.icon };
  }
  const route = GOAL_ROUTES[domainFromName(goal)];
  const template = route?.template ? TEMPLATES.find((t) => t.label === route.template) : undefined;
  return {
    goal,
    shape: template?.shape ?? route?.shape ?? suggestShape(goal),
    color: template?.color ?? color,
    prefill: template?.prefill ?? null,
    icon: template?.icon,
  };
}

// A signup goal that is not a plan yet, rendered at the same size and in the
// same grid as a real plan. It writes nothing: no row exists until the member
// sets a target, which is the 2026-08-26 rule. What changed is only where it
// sits, because a chip strip under the grid read as "you have no plans" to a
// member who had just named three at signup.
//
// Every figure is "Not set" rather than a zero. A zero would be a number the
// member never gave, which is the dishonesty that rule exists to prevent.
function UnstartedCard({ goal, color, onStart, onQuickStart }: {
  goal: string;
  color: PlanColor;
  onStart: () => void;
  /** Create the row with this target and nothing else invented. False if it did not save. */
  onQuickStart: (target: number) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    const target = parseNum(amount);
    // The whole of the 2026-08-26 rule, in one branch. An empty field or a zero
    // leaves the goal exactly as it was: an offer, not a row.
    if (target <= 0) {
      setError("Set an amount first and Juniper will start tracking it.");
      return;
    }
    setBusy(true);
    setError("");
    const ok = await onQuickStart(target);
    setBusy(false);
    if (!ok) setError("That did not save. Check your connection and try again.");
  };

  return (
    // Same shape as PlanCard: the card is a mouse shortcut, the footer button
    // is the control. It used to be role="button" with a button inside it.
    <div className="card plan-lg unstarted" onClick={onStart}>
      <div className="ph">
        <div className="track" style={{ background: cssVar(color) }}><PlanIcon name="target" /></div>
        <div className="ph-title">
          <div className="pt">{goal}</div>
          <div className="pn">From your signup goals</div>
        </div>
        <span className="status setup">Not started</span>
      </div>
      <div className="body">
        <div className="nums">
          <div className="big tnum">Not set</div>
          <div style={{ fontSize: 12, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>no target yet</div>
        </div>
        <div className="bar"><i style={{ width: "0%", background: cssVar(color) }} /></div>
        <div className="next"><b>Next:</b> set a target and Juniper starts tracking it</div>
        {error && <div className="plan-err">{error}</div>}
        {/* The quick route. Typing a number here is the whole of creating
            the plan, so the full form stops being the only way in. The stop
            on the wrapper is because the card itself is a click shortcut to
            that form, and a click meant for this input must not open it. */}
        <div className="quick-target" onClick={(e) => e.stopPropagation()}>
          <span className="qt-pre">$</span>
          <input
            className="qt-in tnum"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void start(); } }}
            inputMode="numeric"
            placeholder="10,000"
            aria-label={`Target amount for ${goal}`}
          />
          <button className="btn sm" disabled={busy} onClick={() => void start()}>
            {busy ? "Starting…" : "Start it"}
          </button>
        </div>
        <div className="plan-foot">
          <button
            className="edit-hint"
            onClick={(e) => { e.stopPropagation(); onStart(); }}
            aria-label={`More options for ${goal}`}
          >
            More options
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Example plans: illustration, never data.
 *
 * Hard-coded here rather than read from a shared seed, because that is the
 * point: these numbers belong to nobody. They render only in the section at
 * the bottom of this page, are never counted, never filtered, and never reach
 * Overview.
 * ------------------------------------------------------------------ */

export type Example = {
  id: string;
  title: string;
  shape: PlanShape;
  color: PlanColor;
  current: number;
  target: number;
  monthly: number;
  blurb: string;
  // Which real balance a plan taken from this example should seed itself from.
  // The member's own money beats the illustration's numbers wherever we have
  // it, which is the same rule the template list already follows.
  prefill: PrefillKey;
};

export const EXAMPLES: Example[] = [
  {
    id: "home", title: "Buy a home", shape: "buy", color: "--jnpr-c1", prefill: "cash",
    current: 28000, target: 60000, monthly: 850,
    blurb: "A down payment built month by month, with the ready date moving as the balance grows.",
  },
  {
    id: "loans", title: "Pay off student loans", shape: "payoff", color: "--jnpr-c2", prefill: "debt",
    current: 7600, target: 22400, monthly: 520,
    blurb: "A balance and a rate, turned into a date the debt is actually gone.",
  },
  {
    id: "emergency", title: "Emergency fund", shape: "save", color: "--jnpr-c3", prefill: "emergency",
    current: 7400, target: 21000, monthly: 400,
    blurb: "Six months of spending set aside, sized from what you actually spend.",
  },
  {
    id: "trip", title: "Six months abroad", shape: "save", color: "--jnpr-c5", prefill: null,
    current: 3100, target: 14000, monthly: 450,
    blurb: "Any goal you can name, not just the ones on the template list.",
  },
  {
    id: "vacation", title: "Save for a family vacation", shape: "save", color: "--jnpr-c5", prefill: null,
    current: 1200, target: 6000, monthly: 300,
    blurb: "A trip the whole family can look forward to, funded before you book it.",
  },
  {
    id: "college", title: "Save for college", shape: "save", color: "--jnpr-c2", prefill: null,
    current: 4000, target: 80000, monthly: 350,
    blurb: "A head start on tuition, years before the bill arrives.",
  },
];

// Dismissals are per member, not per browser: two people on one laptop must not
// inherit each other's choices. Keyed on the Supabase user id, so signing into a
// different account gets its own examples back.
const dismissKey = (userId: string) => `jnpr.plans.examples.dismissed.v1:${userId}`;

function loadDismissed(userId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveDismissed(userId: string, ids: string[]) {
  try {
    localStorage.setItem(dismissKey(userId), JSON.stringify(ids));
  } catch {
    /* quota or private mode: the dismissal holds for this session only */
  }
}

function ExampleCard({ e, onDismiss, onUse }: { e: Example; onDismiss: () => void; onUse: () => void }) {
  const copy = SHAPE_COPY[e.shape];
  const pct = Math.min(100, Math.round((e.current / e.target) * 100));
  return (
    <div className="card plan-ex">
      <button className="ex-x" onClick={onDismiss} aria-label={`Dismiss the ${e.title} example`}>
        <CloseIcon />
      </button>
      <div className="ex-top">
        <span className="ex-ic" style={{ background: cssVar(e.color) }}><PlanIcon name={SHAPE_ICON[e.shape]} /></span>
        <div className="ex-head-txt">
          <div className="ex-t">{e.title}</div>
          <div className="ex-s tnum">{money(e.current)} of {money(e.target)} {copy.progressWord} · {money(e.monthly)}/mo</div>
        </div>
      </div>
      <div className="bar"><i style={{ width: `${pct}%`, background: cssVar(e.color) }} /></div>
      <p className="ex-b">{e.blurb}</p>
      {/* An illustration that fits is worth taking. This opens the same create
          form the New plan button does, already carrying the example's shape,
          colour, target and monthly amount, so the member changes a number
          rather than retyping what the card already said. */}
      <div className="ex-foot">
        <button className="ex-use" onClick={onUse} aria-label={`Start a plan from the ${e.title} example`}>
          Use this plan
        </button>
      </div>
    </div>
  );
}

function ExampleSection({ userId, onUse }: { userId: string; onUse: (e: Example) => void }) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed(userId));

  // Re-read when the signed-in member changes, so switching accounts in one
  // browser does not carry the previous member's dismissals over.
  useEffect(() => { setDismissed(loadDismissed(userId)); }, [userId]);

  const shown = EXAMPLES.filter((e) => !dismissed.includes(e.id));
  if (!shown.length) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    saveDismissed(userId, next);
  };

  return (
    <section className="ex-wrap">
      <div className="ex-lede">
        <h3>Example plans</h3>
        <p>Not your data. A few common goals, here to show how a plan tracks. Dismiss any you do not want to see again.</p>
      </div>
      <div className="grid ex-grid">
        {shown.map((e) => <ExampleCard key={e.id} e={e} onDismiss={() => dismiss(e.id)} onUse={() => onUse(e)} />)}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Page.
 * ------------------------------------------------------------------ */

// `profile` and `profileReady` come from the single `useProfile()` in
// juniper-app.tsx, passed down rather than re-read here: a second call would
// mean a second /api/profile round-trip and a second hydration timeline to keep
// in step with this one. Both are optional so the page still renders standalone.
export default function Plans({ profile = null, profileReady = false }: {
  profile?: UserProfile | null;
  profileReady?: boolean;
}) {
  // `plans` is the member's own; `allPlans` additionally carries plans they
  // created for a household, which belong on the household page and not here
  // (issue #362). Everything on screen reads `plans`; the two things that
  // reason about what already EXISTS on the account read `allPlans`, because a
  // domain collision against a hidden plan would have POST /api/plans PATCH
  // over it, and a household plan should not have its signup goal offered
  // again. See useMemberPlans in lib/plans.ts.
  const { plans, allPlans, loading, upsertLocal, removeLocal } = useMemberPlans();
  const [filter, setFilter] = useState<Filter>("active");
  const [modal, setModal] = useState<ModalState>(null);
  const close = () => setModal(null);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { threads } = useThreads();
  // Signup goals with no plan yet. Shared with the Overview card through
  // lib/plans so the two surfaces cannot disagree about whether the member has
  // anything, which is what happened when Plans showed a chip and Overview said
  // "No plans yet".
  const waitingGoals = useMemo(() => unplannedGoals(profile?.goals, allPlans), [profile?.goals, allPlans]);

  // Opening one is the same create path the chip strip used, so a goal turned
  // into a plan keeps the colour, shape, and icon it was shown with. Every
  // signup goal becomes a real plan now, income included (issue #262):
  // offerFor is where that judgement lives.
  // Whether unstarted goal cards are on screen. Named once because two places
  // ask: the empty state has to stand down for them, and the grid has to render
  // them. When #184 first shipped only the grid knew, so a member with goals and
  // no plans hit the `views.length === 0` branch above and never reached it.
  const showsGoalCards = filter === "active" && profileReady === true && waitingGoals.length > 0;

  const startGoal = (g: UnplannedGoal, i: number) => {
    const o = offerFor(g.goal, i);
    setModal({ k: "form", label: o.goal, shape: o.shape, color: o.color, prefill: o.prefill, icon: o.icon, fromGoal: true });
  };

  // Quick add from a signup goal: the target the member just typed, and nothing
  // else invented. Shape, colour, and icon come from `offerFor`, the same
  // judgement the full form would have applied, so the card that appears
  // matches the one they were looking at. No monthly amount and no date,
  // because they gave us neither: the card lands on "New" and asks for the
  // monthly next (or, for income, just sits ready to track).
  const quickStartGoal = async (g: UnplannedGoal, i: number, target: number) => {
    const o = offerFor(g.goal, i);
    const goal: PlanGoal = {
      headline: SHAPE_COPY[o.shape].headline(g.goal, target),
      name: g.goal,
      shape: o.shape,
      color: o.color,
      target_value: target,
      current_value: 0,
      monthly_contribution: 0,
    };
    if (o.icon) goal.icon = o.icon;
    const saved = await savePlan({ domain: uniqueDomain(g.goal, allPlans), status: "in_progress", goal });
    if (!saved) return false;
    upsertLocal(saved);
    setFilter("active");
    return true;
  };

  // One inline edit from a plan card. Merges the single changed field into
  // whatever the row already holds rather than rebuilding the goal, so a target
  // date, a payoff rate, and a headline written by the guided dialogue all
  // survive a rename. `goalFrom` deliberately deletes fields it does not show;
  // this path shows two, so it must not use it.
  const patchPlan = async (plan: Plan, patch: { name?: string; target?: number }) => {
    const goal: PlanGoal = { ...(plan.goal ?? { headline: "" }) };
    if (patch.name !== undefined) goal.name = patch.name;
    if (patch.target !== undefined) goal.target_value = patch.target;
    // Only when the row has none, on the same grounds as `goalFrom`: an
    // existing headline is synthesis text we did not write.
    if (!String(goal.headline ?? "").trim()) {
      goal.headline = SHAPE_COPY[planShape(plan)].headline(
        String(goal.name ?? planTitle(plan)),
        Number(goal.target_value ?? 0),
      );
    }
    const saved = await savePlan({ domain: plan.domain, goal });
    if (!saved) return false;
    upsertLocal(saved);
    return true;
  };

  const session = useSession();
  const chatCountFor = (t: string) => threads.filter((x) => x.planTitle === t).length;

  // Deep link from the Score page: `?new=<template slug>` opens this page's own
  // create modal on that template. The "ways to improve" column offers to start
  // the plan a lever needs, and this is the whole of how it does it: one create
  // flow entered from two places, rather than a second form living over there
  // and drifting from this one. Slugged with `domainFromName` so both ends share
  // the single normalizer, and an unrecognized slug falls back to the template
  // picker instead of dropping the member on a page that ignored them. The param
  // is replaced out of the URL so a reload or a back-navigation does not reopen
  // the modal on them.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const want = params.get("new");
    if (!want) return;
    const t = TEMPLATES.find((x) => domainFromName(x.label) === want);
    // An example is a second thing the slug can name, and it seeds the form the
    // same way its own "Use this plan" button does. Same normalizer for both,
    // so a link to an example survives the example being reworded only as far
    // as its slug survives, which is the deal the templates already take.
    const ex = !t ? EXAMPLES.find((x) => domainFromName(x.title) === want) : undefined;
    setModal(
      t
        ? { k: "form", label: t.label, shape: t.shape, color: t.color, prefill: t.prefill, icon: t.icon }
        : ex
          ? { k: "form", label: ex.title, shape: ex.shape, color: ex.color, prefill: ex.prefill, seed: { target: ex.target, monthly: ex.monthly } }
          : { k: "new" },
    );
    navigate("/app/plans", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // "Adjust first" from an Ask Juniper thread (issue #262): `?fromChat=1`
  // means a draft is waiting in the in-memory handoff (lib/planner.ts),
  // opened here rather than passed as its own URL param because it is a full
  // object with several optional numeric fields, not a slug. Read once and
  // consumed: a stale `?fromChat=1` left in the URL (a reload, a bookmark)
  // finds nothing waiting and falls through to the plain list.
  useEffect(() => {
    if (new URLSearchParams(search).get("fromChat") !== "1") return;
    navigate("/app/plans", { replace: true });
    const draft = takePendingChatDraft();
    if (!draft) return;
    setModal({ k: "form", label: draft.name, shape: draft.shape, color: colorForName(draft.name), prefill: null, chatDraft: draft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Where an accepted partner invite lands: `?open=<domain>` opens that plan
  // once the list has loaded. Accepting an invite attaches the caller as
  // `partner_user_id` on the inviter's existing row rather than creating a
  // second plan, and GET /api/plans returns partner rows alongside owned ones,
  // so the plan the member was invited to is already in `plans` here. This
  // replaces a redirect to /app/plans/:domain, a route only the retired
  // app-shell.tsx ever defined, which dropped every accepter on the not-found
  // card. Gated on `loading`, or the lookup misses on the first render and the
  // member arrives at a page that ignored them. An unknown domain falls through
  // to the list rather than to an error: a stale invite link should still leave
  // someone somewhere they can use. Param is replaced out of the URL so a
  // reload does not reopen the modal.
  const [openHandled, setOpenHandled] = useState(false);
  useEffect(() => {
    if (openHandled || loading) return;
    const want = new URLSearchParams(search).get("open");
    if (!want) return;
    const hit = plans.find((p) => p.domain === want);
    if (hit) setModal({ k: "edit", domain: hit.domain });
    setOpenHandled(true);
    navigate("/app/plans", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openHandled, loading, plans, search]);

  // Where Overview's "Your plans" widget lands on an unstarted signup goal
  // (issue #403): `?openGoal=<slug>` opens the same full create form the
  // card's own body already opens on a click, directly, rather than sending
  // the member to the plain list to find that goal and notice "More options"
  // instead of the quick single-field "Start it" input. Waits on profileReady
  // rather than `loading`, since `waitingGoals` is derived from
  // `profile?.goals`, not from `plans`. An unrecognized slug (the goal was
  // turned into a plan since the link was made, or a stale link) falls
  // through to the plain list rather than an error.
  const [openGoalHandled, setOpenGoalHandled] = useState(false);
  useEffect(() => {
    if (openGoalHandled || profileReady !== true) return;
    const want = new URLSearchParams(search).get("openGoal");
    if (!want) return;
    const i = waitingGoals.findIndex((g) => domainFromName(g.goal) === want);
    if (i >= 0) startGoal(waitingGoals[i], i);
    setOpenGoalHandled(true);
    navigate("/app/plans", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGoalHandled, profileReady, waitingGoals, search]);

  const { data, source } = useFinances();
  const balances = balancesFromFinances(data);
  const linked = source === "live";

  const views = useMemo(() => plans.map(viewOf), [plans]);
  // Domain is the row's key, so this is how a card gets back to the plan it was
  // built from without threading the row through PlanView.
  const byDomain = useMemo(() => new Map(plans.map((p) => [p.domain, p])), [plans]);
  const shown = views.filter((v) => (filter === "all" ? true : filter === "completed" ? v.done : !v.done));
  const editing = modal?.k === "edit" ? plans.find((p) => p.domain === modal.domain) ?? null : null;

  return (
    <div className="frame">
      <PageHeader
        title="Plans"
        sub={linked ? "Your money goals, funded from your linked balances, with the next step always in view." : "Your money goals, with the next step always in view."}
        actions={
          <>
            <div className="pills">
              {(["active", "completed", "all"] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? "on" : undefined} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setModal({ k: "new" })}><PlusIcon />New plan</button>
          </>
        }
      />

      {/* The "Planning with a partner? Invite partner" panel stood here
          (components/juniper/partner-panel.tsx). Removed in Stage 4c because
          accepting one of its invites produced nothing a member could see. Half
          of that is now fixed: an accepter used to be sent to /app/plans/:domain
          and land on the not-found card, and instead arrives on this page with
          the shared plan open (the `?open=` effect above). The panel itself
          stays out for the other half, which has not changed: this page rendered
          <PartnerPanel /> with no partnerName, so it could never leave its
          "Planning with a partner?" state even after acceptance, and there is
          still no surface that shows the partner's answers or where the two of
          them align. Bring it back with that view, not before. */}

      {/* The skeleton also covers "plans have landed and they are empty, but the
          profile has not". Without that, a member whose goals are still in
          flight is told "No plans yet" for a beat and then shown a goal card,
          which is the flash the goal section was always gated against. */}
      {loading || (views.length === 0 && profileReady !== true) ? (
        <div className="grid plan-grid">
          <div className="card plan-skel" aria-busy="true">Loading your plans…</div>
          <div className="card plan-skel" aria-hidden="true" />
        </div>
      ) : views.length === 0 && !showsGoalCards ? (
        // A genuine empty state. Nothing stands in for the member's plans, and
        // the examples further down the page are labelled as not theirs.
        <div className="card plan-empty">
          <span className="pe-ic"><PlanIcon name="target" /></span>
          <h3>No plans yet</h3>
          <p>A plan turns one goal into a target, a monthly amount, and a date. Start with something you are already saving for or paying down.</p>
          <button className="btn" onClick={() => setModal({ k: "new" })}><PlusIcon />New plan</button>
        </div>
      ) : (
        <div className="grid plan-grid">
          {shown.length ? (
            shown.map((v) => (
              <PlanCard
                key={v.domain}
                v={v}
                chatCount={chatCountFor(v.title)}
                onOpen={() => setModal({ k: "edit", domain: v.domain })}
                onAsk={() => navigate(`/app/ask?plan=${encodeURIComponent(v.title)}`)}
                onPatch={async (patch) => {
                  const p = byDomain.get(v.domain);
                  return p ? patchPlan(p, patch) : false;
                }}
              />
            ))
          ) : null}
          {/* Unstarted goals sit after real plans and only on the Active view:
              on Completed they would be nonsense, and on All they would repeat.
              Gated on both loads, because what shows depends on the two
              agreeing. Rendering while plans are in flight would offer a card
              for a goal that already has a plan and then yank it, and rendering
              before the profile resolves would miss goals that live only on the
              server (see use-profile.ts on local-then-remote hydration). */}
          {showsGoalCards && waitingGoals.map((g, i) => (
            <UnstartedCard
              key={g.goal}
              goal={g.goal}
              color={g.color}
              onStart={() => startGoal(g, i)}
              onQuickStart={(target) => quickStartGoal(g, i, target)}
            />
          ))}
          {!shown.length && !showsGoalCards ? (
            <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>
              No {filter} plans.
            </div>
          ) : null}
        </div>
      )}

      {/* Examples sit last, below the member's own plans, and only once we know
          who is signed in (the dismissal list is per account). */}
      {session?.user.id && (
        <ExampleSection
          userId={session.user.id}
          onUse={(e) => setModal({
            k: "form",
            label: e.title,
            shape: e.shape,
            color: e.color,
            prefill: e.prefill,
            seed: { target: e.target, monthly: e.monthly },
          })}
        />
      )}

      {modal?.k === "new" && (
        <Backdrop onClose={close}>
          <h3>Start a new plan</h3>
          <p>Pick a starting point. Juniper seeds the numbers from your linked accounts where it can, and you can change anything.</p>
          <div className="tmpl-grid">
            {TEMPLATE_GROUPS.map((g) => (
              <SectionOfTemplates key={g.label} group={g} onPick={(t) => setModal({ k: "form", label: t.label, shape: t.shape, color: t.color, prefill: t.prefill, icon: t.icon })} />
            ))}
          </div>
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={close}>Cancel</button>
          </div>
        </Backdrop>
      )}

      {modal?.k === "form" && (
        <CreateForm
          state={modal}
          prefill={prefillFor(modal.prefill, balances)}
          existing={allPlans}
          fromGoal={!!modal.fromGoal}
          onBack={() => setModal(modal.fromGoal ? null : { k: "new" })}
          onCreated={(plan) => {
            upsertLocal(plan);
            setFilter("active");
            close();
          }}
        />
      )}

      {editing && (
        <EditForm
          plan={editing}
          owned={editing.user_id === session?.user.id}
          onSaved={(plan) => { upsertLocal(plan); close(); }}
          onDeleted={(domain) => { removeLocal(domain); close(); }}
          onClose={close}
        />
      )}
    </div>
  );
}

// Exported for pages/app/household.tsx (issue #362), which mounts this same
// form on a plan created for the household. That plan is deliberately absent
// from the individual Plans page now, so without this it would be the one plan
// in the app with nowhere to be edited, marked complete, or deleted; the
// household page is where it lives, so the editor has to reach it there.
export function EditForm({
  plan, owned, onSaved, onDeleted, onClose,
}: {
  plan: Plan;
  /** False on a plan the member only partners on. Hides Delete, which the
      server will not perform for them: DELETE /api/plans filters on
      `user_id=eq.<caller>` and the `plans_delete_own` policy scopes to the
      owner, so a partner's delete matches no rows and returns a cheerful
      `{ ok: true }`. The row stays, and the list drops it locally, so the plan
      reappears on the next load. Editing is deliberately still open to them,
      which POST and `plans_update_own` both allow. */
  owned: boolean;
  onSaved: (p: Plan) => void;
  onDeleted: (domain: string) => void;
  onClose: () => void;
}) {
  const title = planTitle(plan);
  const nums = planNumbers(plan);
  const [draft, setDraft] = useState<Draft>({
    name: title,
    shape: planShape(plan),
    color: planColor(plan),
    icon: plan.goal?.icon ?? "",
    current: numStr(nums.current),
    target: numStr(nums.target),
    monthly: numStr(nums.monthly),
    date: nums.targetDate ?? "",
    rate: numStr(nums.rate),
  });
  // Whatever debts this plan already carries (empty for anything that isn't a
  // payoff plan, or a payoff plan created before this existed). Same
  // "breakdown drives the flat fields" relationship as CreateForm.
  const [debts, setDebts] = useState<DebtItem[]>(
    Array.isArray(plan.current_state?.debts) ? (plan.current_state!.debts as DebtItem[]) : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, navigate] = useLocation();
  const { threads } = useThreads();

  const chats = threads.filter((t) => t.planTitle === title);
  const ask = (q: string) => navigate(`/app/ask?q=${encodeURIComponent(q)}&plan=${encodeURIComponent(title)}`);
  const newChat = () => navigate(`/app/ask?plan=${encodeURIComponent(title)}`);
  const openChat = (id: string) => navigate(`/app/ask?thread=${encodeURIComponent(id)}`);
  // A manual shape change drops whatever icon the plan had: that icon was a
  // promise about the plan's original template, not about the new shape.
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => (patch.shape ? { ...d, ...patch, icon: "" } : { ...d, ...patch }));
    // A debt someone was tracking under "Debt payoff" should not silently
    // follow the plan onto whatever shape it becomes.
    if (patch.shape && patch.shape !== "payoff") setDebts([]);
  };
  const setDebtsAndTotals = (next: DebtItem[]) => {
    setDebts(next);
    if (!next.length) return;
    const total = next.reduce((s, d) => s + (d.balance || 0), 0);
    const blended = total > 0 ? next.reduce((s, d) => s + (d.balance || 0) * (d.apr || 0), 0) / total : 0;
    set({ target: numStr(total), rate: numStr(blended) });
  };

  const write = async (extra: { status?: Plan["status"] } = {}) => {
    setBusy(true);
    setError("");
    // Merge rather than replace: current_state can carry other things (a
    // legacy dialogue-built plan's `collected` figures), and this form only
    // ever owns the `debts` key within it.
    const { debts: _oldDebts, ...restState } = (plan.current_state ?? {}) as Record<string, unknown>;
    const nextState =
      draft.shape === "payoff" && debts.length
        ? { ...restState, debts }
        : (Object.keys(restState).length ? restState : null);
    const saved = await savePlan({
      domain: plan.domain,
      ...extra,
      goal: goalFrom({ ...draft, name: draft.name.trim() || title }, plan.goal),
      current_state: nextState,
    });
    setBusy(false);
    if (!saved) {
      setError("That did not save. Check your connection and try again.");
      return;
    }
    onSaved(saved);
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const ok = await deletePlan(plan.domain);
    setBusy(false);
    if (!ok) {
      setError("That did not delete. Check your connection and try again.");
      return;
    }
    onDeleted(plan.domain);
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="ask-plan-cta">
        <div className="ask-plan-head">
          <div><b>Ask Juniper about this plan</b><small>Grounded in your real numbers</small></div>
          <button className="btn sm" onClick={newChat}>New chat</button>
        </div>
        <div className="ask-faqs">
          {FAQS[planShape(plan)].map((q) => <button key={q} className="ask-faq" onClick={() => ask(q)}>{q}</button>)}
        </div>
      </div>

      {chats.length > 0 && (
        <div className="plan-chats">
          <div className="pc-lbl">Conversations about this plan</div>
          {chats.map((t) => (
            <button className="pc-item" key={t.id} onClick={() => openChat(t.id)}>
              <span className="pc-berry"><PlanIcon name="target" /></span>
              <span className="pc-main">
                <span className="pc-t">{t.title}</span>
                {previewOf(t) && <span className="pc-p">{previewOf(t)}</span>}
              </span>
              <span className="pc-w">{relativeTime(t.updatedAt)}</span>
              <span className="pc-arr">›</span>
            </button>
          ))}
        </div>
      )}

      <h3>Edit plan</h3>
      <p>Update the goal, mark it done, or remove it. Changes save to your account.</p>
      {error && <div className="form-error">{error}</div>}
      <DraftFields draft={draft} set={set} />
      {draft.shape === "payoff" && <DebtBreakdown debts={debts} onChange={setDebtsAndTotals} />}
      {draft.shape === "save" && (
        <InvestmentBreakdown onAdd={(amt) => set({ monthly: numStr(parseNum(draft.monthly) + amt) })} />
      )}
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => write()}>{busy ? "Saving…" : "Save changes"}</button>
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => write({ status: plan.status === "completed" ? "in_progress" : "completed" })}
        >
          {plan.status === "completed" ? "Reopen" : "Mark complete"}
        </button>
      </div>
      {owned && (
        <div className="modal-danger">
          {confirmDelete ? (
            <>
              <span>Delete this plan for good?</span>
              <button className="btn ghost sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn ghost sm danger" disabled={busy} onClick={remove}>Delete</button>
            </>
          ) : (
            <button className="btn ghost sm danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete plan</button>
          )}
        </div>
      )}
    </Backdrop>
  );
}
