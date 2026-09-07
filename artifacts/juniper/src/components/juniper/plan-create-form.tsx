// The plan-creation form and its shared building blocks, extracted out of
// pages/app/plans.tsx (issue #338 follow-up) so the household page can mount
// the same form in place rather than navigating to /app/plans and back.
// Everything here is used by both pages: plans.tsx still owns EditForm, FAQS,
// and the template/example pickers, which are Plans-page-only concerns.
import { useState, type ReactNode } from "react";
import { money } from "@/lib/mock-data";
import type { FinanceData } from "@/lib/finances";
import type { PlanDraftFromChat, PlanDraftField } from "@/lib/planner";
import { setHouseholdPlanShare } from "@/lib/household";
import { cssVar, PlanIcon } from "@/components/juniper/primitives";
import { DebtBreakdown } from "@/components/juniper/debt-breakdown";
import { InvestmentBreakdown } from "@/components/juniper/investment-breakdown";
import {
  savePlan,
  suggestShape,
  uniqueDomain,
  PLAN_COLORS,
  SHAPE_ICON,
  type DebtItem,
  type Plan,
  type PlanColor,
  type PlanGoal,
  type PlanShape,
} from "@/lib/plans";

// Balances distilled from the member's linked accounts, used to auto-fill a new
// plan so goals are funded from real money instead of guessed inputs.
export interface Balances { totalDebt: number; totalCash: number; totalInvest: number; monthlySpend: number }

// The one place this is computed, so a page reading `useFinances()` for a
// create form's prefill cannot drift from another page's version of the same
// sum.
export function balancesFromFinances(data: FinanceData): Balances {
  return {
    totalDebt: data.accounts.debt.reduce((a, x) => a + Math.abs(x.v), 0),
    totalCash: data.accounts.cash.reduce((a, x) => a + x.v, 0),
    totalInvest: data.accounts.invest.reduce((a, x) => a + x.v, 0),
    monthlySpend: data.cashflow.spent,
  };
}

export interface Prefill { target: number; current: number; hint: string }

// Which real-balance figure a template can seed itself from. Only our own
// templates carry one; a custom goal starts empty because we have no idea what
// it is for.
export type PrefillKey = "debt" | "emergency" | "invest" | "cash" | null;

export function prefillFor(key: PrefillKey, b: Balances): Prefill {
  const none: Prefill = { target: 0, current: 0, hint: "" };
  switch (key) {
    case "debt":
      return b.totalDebt > 0
        ? { target: b.totalDebt, current: 0, hint: `Your linked balances show ${money(b.totalDebt)} of debt to pay off.` }
        : none;
    case "emergency": {
      const target = Math.round(b.monthlySpend * 6);
      return b.monthlySpend > 0
        ? { target, current: Math.min(b.totalCash, target), hint: `6 months at about ${money(b.monthlySpend)} a month of spending, and you have ${money(b.totalCash)} in cash so far.` }
        : none;
    }
    case "invest":
      return b.totalInvest > 0
        ? { target: 0, current: b.totalInvest, hint: `You have ${money(b.totalInvest)} invested so far, set a target to track your pace.` }
        : none;
    case "cash":
      return b.totalCash > 0
        ? { target: 0, current: 0, hint: `You have ${money(b.totalCash)} in cash that could seed a down payment.` }
        : none;
    default:
      return none;
  }
}

// Numbers an example plan hands to the create form. Only the two figures the
// illustration itself owns: its target and its monthly amount. Never its
// `current`, which is progress the member has not made, and seeding it would
// be inventing a balance they never gave us.
export type Seed = { target: number; monthly: number };

// Everything CreateForm needs to know about why it was opened: which template
// or example it started from, and (issue #324/#338) whether it was opened for
// a household, which drives the "Share with <name>" toggle and, on save,
// setHouseholdPlanShare. Both plans.tsx (template picker, `?new=` deep link,
// examples, Ask Juniper drafts) and household.tsx (the plain button and the
// gallery cards) build one of these to open the same form.
export type CreateFormState = {
  label: string;
  shape: PlanShape;
  color: PlanColor;
  icon?: string;
  seed?: Seed;
  chatDraft?: PlanDraftFromChat;
  household?: { householdName: string };
};

export const parseNum = (s: string): number => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
export const numStr = (n: number | null | undefined): string => (n ? String(Math.round(n * 100) / 100) : "");

// The fields shared by create and edit, so the two forms cannot drift into
// disagreeing about what a plan holds.
export type Draft = {
  name: string;
  shape: PlanShape;
  color: PlanColor;
  // The template this draft was opened from, if any (goal.icon). Not user
  // editable: there is no icon picker, only a shape picker, and changing shape
  // clears it (see CreateForm/EditForm's `set`), since a template's icon is a
  // promise about that specific template, not about whatever shape it happens
  // to share.
  icon: string;
  current: string;
  target: string;
  monthly: string;
  date: string;
  rate: string;
};

// Everything a shape changes about how a plan reads: its label in the picker,
// the words on its numbers, and how its finish line is phrased. One table so
// adding a fourth shape later is a single edit, not a hunt through the file.
export const SHAPE_COPY: Record<PlanShape, {
  label: string;
  hint: string;
  progressWord: string;
  currentLabel: string;
  targetLabel: string;
  // Empty on a shape with no monthly-contribution concept (income): callers
  // treat a falsy contribLabel as "do not render this field", which is what
  // keeps a card from claiming a member is contributing $0 a month toward a
  // raise nobody asked them to fund.
  contribVerb: string;
  contribLabel: string;
  readyPrefix: string;
  // The `goal.headline` written for a plan created here, so a shape's framing
  // carries into the one field the rest of the app reads as the plan's summary.
  headline: (name: string, target: number) => string;
}> = {
  save: {
    label: "Saving up",
    hint: "Saving toward a target: travel, a wedding, an emergency fund.",
    progressWord: "saved",
    currentLabel: "Saved so far ($)",
    targetLabel: "Target amount ($)",
    contribVerb: "Saving",
    contribLabel: "Saving each month ($)",
    readyPrefix: "Ready",
    headline: (name, target) => (target > 0 ? `Save ${money(target)} for ${name}` : `Save for ${name}`),
  },
  buy: {
    label: "Buying",
    hint: "A purchase with a down payment: a home, a car, a rental property.",
    progressWord: "of the down payment",
    currentLabel: "Set aside so far ($)",
    targetLabel: "Down payment needed ($)",
    contribVerb: "Putting aside",
    contribLabel: "Putting aside each month ($)",
    readyPrefix: "Ready to buy",
    headline: (name, target) => (target > 0 ? `Put ${money(target)} toward ${name}` : `Save toward ${name}`),
  },
  payoff: {
    label: "Paying off",
    hint: "Paying down a balance: student loans, a credit card.",
    progressWord: "paid off",
    currentLabel: "Paid off so far ($)",
    targetLabel: "Balance to clear ($)",
    contribVerb: "Paying",
    contribLabel: "Paying each month ($)",
    readyPrefix: "Debt-free",
    headline: (name, target) => (target > 0 ? `Clear ${money(target)} on ${name}` : `Pay off ${name}`),
  },
  income: {
    label: "Growing income",
    hint: "Growing what you earn: a raise, a promotion, a new job, a side hustle.",
    progressWord: "of the way to your target income",
    currentLabel: "Current income ($/mo)",
    targetLabel: "Target income ($/mo)",
    // No monthly-contribution concept: there is nothing to set aside toward a
    // raise, only a gap to close, so both are empty and the fields/rows that
    // key off them stand down (DraftFields, PlanCard's contribution line).
    contribVerb: "",
    contribLabel: "",
    readyPrefix: "Targeting",
    headline: (name, target) => (target > 0 ? `Grow income to ${money(target)}/mo for ${name}` : `Grow income for ${name}`),
  },
};

export const SHAPES: PlanShape[] = ["save", "buy", "payoff", "income"];

export function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function ShapePicker({ value, onChange }: { value: PlanShape; onChange: (s: PlanShape) => void }) {
  return (
    <div className="field">
      <label>Plan shape</label>
      <div className="shape-pick" role="group" aria-label="Plan shape">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            className={`shape-btn ${value === s ? "on" : ""}`}
            aria-pressed={value === s}
            onClick={() => onChange(s)}
          >
            <span className="sb-ic"><PlanIcon name={SHAPE_ICON[s]} /></span>
            {SHAPE_COPY[s].label}
          </button>
        ))}
      </div>
      <span className="field-hint">{SHAPE_COPY[value].hint}</span>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: PlanColor; onChange: (c: PlanColor) => void }) {
  return (
    <div className="field">
      <label>Color</label>
      <div className="color-pick" role="group" aria-label="Plan color">
        {PLAN_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            className={`swatch ${value === c ? "on" : ""}`}
            style={{ background: cssVar(c) }}
            aria-pressed={value === c}
            aria-label={`Color ${i + 1}`}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

export function DraftFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const copy = SHAPE_COPY[draft.shape];
  return (
    <>
      <div className="field">
        <label>Goal name</label>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. New car fund" />
      </div>
      <ShapePicker value={draft.shape} onChange={(shape) => set({ shape })} />
      <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
      <div className="field2">
        <div className="field"><label>{copy.targetLabel}</label><input value={draft.target} onChange={(e) => set({ target: e.target.value })} inputMode="numeric" placeholder="10,000" /></div>
        <div className="field"><label>{copy.currentLabel}</label><input value={draft.current} onChange={(e) => set({ current: e.target.value })} inputMode="numeric" placeholder="0" /></div>
      </div>
      {/* Income has no monthly-contribution concept (see SHAPE_COPY), so it
          gets a bare target-date field instead of the contribution+date/rate
          row every other shape shows. */}
      {!copy.contribLabel ? (
        <div className="field"><label>Target date (optional)</label><input value={draft.date} onChange={(e) => set({ date: e.target.value })} placeholder="Dec 2027" /></div>
      ) : (
        <>
          <div className="field2">
            <div className="field"><label>{copy.contribLabel}</label><input value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} inputMode="numeric" placeholder="300" /></div>
            {draft.shape === "payoff"
              ? <div className="field"><label>Rate (% a year)</label><input value={draft.rate} onChange={(e) => set({ rate: e.target.value })} inputMode="decimal" placeholder="22.9" /></div>
              : <div className="field"><label>Target date (optional)</label><input value={draft.date} onChange={(e) => set({ date: e.target.value })} placeholder="Dec 2027" /></div>}
          </div>
          {draft.shape === "payoff" && (
            <div className="field"><label>Target date (optional)</label><input value={draft.date} onChange={(e) => set({ date: e.target.value })} placeholder="Dec 2029" /></div>
          )}
        </>
      )}
    </>
  );
}

// Build the `goal` payload from a draft. Merges over whatever the row already
// holds so a plan written by the guided dialogue keeps its summary, milestones
// wording, and its own headline: this page only owns the fields it shows.
export function goalFrom(draft: Draft, existing: PlanGoal | null): PlanGoal {
  const target = parseNum(draft.target);
  const current = parseNum(draft.current);
  const monthly = parseNum(draft.monthly);
  const rate = parseNum(draft.rate);
  const name = draft.name.trim();
  const copy = SHAPE_COPY[draft.shape];

  // Only write a headline when the row has none. Overwriting one would throw
  // away the synthesis text a dialogue-built plan opens with.
  const headline = existing?.headline?.trim() ? existing.headline : copy.headline(name, target);

  const goal: PlanGoal = {
    ...(existing ?? {}),
    headline,
    name,
    shape: draft.shape,
    color: draft.color,
    target_value: target,
    current_value: current,
    monthly_contribution: monthly,
  };
  // POST replaces the whole `goal` object, so a field the member cleared has to
  // be deleted here rather than left to fall through from `existing`.
  const date = draft.date.trim();
  if (date) goal.target_date = date; else delete goal.target_date;
  if (draft.shape === "payoff" && rate > 0) goal.rate = rate; else delete goal.rate;
  if (draft.icon) goal.icon = draft.icon; else delete goal.icon;
  return goal;
}

/* ------------------------------------------------------------------ *
 * The create form itself. Mounted by pages/app/plans.tsx (the template
 * picker, the `?new=` deep link, examples, and Ask Juniper drafts) and by
 * pages/app/household.tsx (the plain "Create a plan for the household"
 * button and its gallery cards). Neither caller navigates anywhere to open
 * or close it: `onBack`/`onCreated` decide what happens next.
 * ------------------------------------------------------------------ */
export function CreateForm({
  state, prefill, existing, fromGoal = false, onBack, onCreated,
}: {
  state: CreateFormState;
  prefill: Prefill;
  existing: Plan[];
  /** Opened from a signup goal rather than from the template picker. */
  fromGoal?: boolean;
  onBack: () => void;
  onCreated: (p: Plan) => void;
}) {
  // A signup goal's label is the member's own text, so it is always the name to
  // pre-fill, even in the unlikely event they typed the words "Custom goal".
  const isCustom = !fromGoal && state.label === "Custom goal";
  const chat = state.chatDraft;
  const chatFound = (f: PlanDraftField) => !!chat?.found.includes(f);
  const [draft, setDraft] = useState<Draft>({
    name: isCustom ? "" : state.label,
    shape: state.shape,
    color: state.color,
    icon: state.icon ?? "",
    // `current` never comes from an example. The illustration's progress is
    // money the member has not put anywhere, and writing it in as theirs is
    // exactly the dishonesty the examples are labelled against. A chat draft
    // is different: its `current` is a figure the conversation established
    // (or nothing, if `found` does not list it), never an invented one, so it
    // is trusted the same way a real linked balance is.
    current: numStr(chatFound("current_value") ? chat!.current_value : prefill.current),
    // Real balances first, the example's or chat's figure only where we have
    // nothing more concrete.
    target: numStr(chatFound("target_value") ? chat!.target_value : (prefill.target || state.seed?.target)),
    monthly: numStr(chatFound("monthly_contribution") ? chat!.monthly_contribution : state.seed?.monthly),
    date: chatFound("target_date") ? (chat!.target_date ?? "") : "",
    rate: numStr(chatFound("rate") ? chat!.rate : undefined),
  });
  // Whether the member has touched the shape control. On a custom goal, until
  // they do, a typed name re-runs the keyword guess, so "nomad" lands on save
  // and "car loan" lands on payoff without them having to think about it. A
  // template already carries its own shape, which is a better signal than
  // anything a keyword scan of its label would produce.
  const [shapePinned, setShapePinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Issue #324: pre-checked, since the whole point of arriving here from the
  // household page is to share the thing being created; unchecking it keeps
  // the plan private, same as creating from the ordinary /app/plans page.
  const [shareHousehold, setShareHousehold] = useState(!!state.household);
  // Payoff-only, populated from suggested or hand-entered debts (see
  // DebtBreakdown below). Kept as its own piece of state rather than folded
  // into `draft`, because it drives `draft.target`/`draft.rate` rather than
  // being driven by them: DraftFields' Target and Rate fields still exist and
  // are still directly editable, they just get overwritten from this list
  // whenever it changes, same "the breakdown is the source of truth once it
  // exists" rule a bank-reported credit limit already follows elsewhere.
  const [debts, setDebts] = useState<DebtItem[]>([]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      // A manual shape change, from the picker or the keyword auto-guess
      // below, drops the template's icon: that icon was a promise about the
      // specific template ("Wedding"), not about whichever shape it happened
      // to share, so it should not survive onto a different shape.
      if (patch.shape) return { ...next, icon: "" };
      if (isCustom && patch.name !== undefined && !shapePinned) return { ...next, shape: suggestShape(patch.name), icon: "" };
      return next;
    });
    if (patch.shape) {
      setShapePinned(true);
      // A debt someone added while trying "Debt payoff" should not silently
      // follow them onto whatever shape they switch to next.
      if (patch.shape !== "payoff") setDebts([]);
    }
  };

  const setDebtsAndTotals = (next: DebtItem[]) => {
    setDebts(next);
    if (!next.length) return;
    const total = next.reduce((s, d) => s + (d.balance || 0), 0);
    const blended = total > 0 ? next.reduce((s, d) => s + (d.balance || 0) * (d.apr || 0), 0) / total : 0;
    set({ target: numStr(total), rate: numStr(blended) });
  };

  const create = async () => {
    const name = draft.name.trim() || state.label;
    setSaving(true);
    setError("");
    // `domain` is the plan's key and is fixed here for the row's whole life:
    // renaming later rewrites goal.name and leaves the key alone. The debts
    // list rides in `current_state` beside `goal`, and only for a plan that
    // is still shaped `payoff` when Create is pressed (belt and suspenders
    // alongside the shape-change clear above): a plan saved under any other
    // shape has no debts concept to carry.
    const saved = await savePlan({
      domain: uniqueDomain(name, existing),
      status: "in_progress",
      goal: goalFrom({ ...draft, name }, null),
      current_state: draft.shape === "payoff" && debts.length ? { debts } : null,
    });
    setSaving(false);
    if (!saved) {
      setError("That did not save. Check your connection and try again.");
      return;
    }
    // The share has to happen after the plan exists: household.ts's
    // share-plan action checks ownership by domain against `plans`, so a
    // call made before this save resolves would find nothing to share.
    if (state.household && shareHousehold) {
      await setHouseholdPlanShare(saved.domain, true);
    }
    onCreated(saved);
  };

  return (
    <Backdrop onClose={onBack}>
      <h3>{isCustom ? "Custom goal" : state.label}</h3>
      <p>
        {fromGoal
          ? "One of the goals you picked at signup. Set a target and Juniper starts tracking it from here."
          : "Name it, pick how it works, and set a target. You can change all of it later."}
      </p>
      {chat ? (
        <div className="prefill-hint">
          <PlanIcon name="target" />
          <span>
            {chat.found.length
              ? "Filled in from your conversation with Juniper. Only what was actually discussed is here, check it before saving."
              : "Nothing concrete came up in that conversation, so this starts blank. Set a target and Juniper will track it from here."}
          </span>
        </div>
      ) : prefill.hint ? (
        <div className="prefill-hint"><PlanIcon name="target" /><span>{prefill.hint}</span></div>
      ) : state.seed ? (
        <div className="prefill-hint">
          <PlanIcon name="target" />
          <span>Filled in from the example, so there is something to change rather than a blank form. Every figure is yours to overwrite.</span>
        </div>
      ) : null}
      {/* Issue #324: a separate banner from the hint chain above, since it is
          a decision to make rather than a note about where the numbers came
          from, and the two can appear together (a household gallery card
          carries both a seed and this toggle). Same `.prefill-hint` shape as
          the chatDraft/prefill/example hints above, with a switch control
          added rather than a plain checkbox, matching the toggle household.tsx
          already uses for account and plan sharing. */}
      {state.household && (
        <div className="prefill-hint household-share-hint">
          <PlanIcon name="target" />
          <span className="hsh-text">Share with {state.household.householdName} once this is saved. Uncheck to keep it private.</span>
          <button
            type="button"
            className={shareHousehold ? "share-toggle on" : "share-toggle"}
            role="switch"
            aria-checked={shareHousehold}
            aria-label={`Share with ${state.household.householdName}`}
            onClick={() => setShareHousehold((v) => !v)}
          >
            <i />
          </button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <DraftFields draft={draft} set={set} />
      {draft.shape === "payoff" && <DebtBreakdown debts={debts} onChange={setDebtsAndTotals} />}
      {draft.shape === "save" && (
        <InvestmentBreakdown onAdd={(amt) => set({ monthly: numStr(parseNum(draft.monthly) + amt) })} />
      )}
      <div className="modal-actions">
        <button className="btn" disabled={saving} onClick={create}>{saving ? "Creating…" : "Create plan"}</button>
        <button className="btn ghost" disabled={saving} onClick={onBack}>{fromGoal || state.household ? "Cancel" : "Back"}</button>
      </div>
    </Backdrop>
  );
}
