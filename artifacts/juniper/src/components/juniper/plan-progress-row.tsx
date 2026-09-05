// The real plan progress row, extracted out of pages/app/overview.tsx (issue
// #258 household Overview follow-up) so the household page can show each
// shared plan as the same icon-plus-progress-bar row the individual member's
// own "Your plans" card already renders, rather than a text-only summary.
// Same extraction pattern PR #339 used for CreateForm: overview.tsx still
// owns PlanCompactRow and PlanTile (its own size options), which read this
// row's data shape but are overview.tsx-only concerns, so they stayed there.
import { Link } from "wouter";
import { moneyK } from "@/lib/mock-data";
import { cssVar, PlanIcon } from "@/components/juniper/primitives";
import { planTitle, planColor, planShape, planNumbers, SHAPE_ICON, type PlanLike } from "@/lib/plans";

// One plan (or waiting goal), reduced to the fields the row draws from, so a
// caller with a real Plan/HouseholdPlan and a caller with an unplanned goal
// chip can both feed the same renderer without it knowing which it got.
export interface PlanProgressRowData {
  key: string;
  title: string;
  color: string;
  icon: string;
  current: number;
  target: number;
  prog: number;
  /** A signup goal with no plan behind it yet, not a plan the member started.
   *  Dims the progress element for one, the same "hasn't really begun" cue
   *  the original list-only `.waiting` class carried. */
  waiting: boolean;
}

// The one place a real plan (personal or household) is turned into a row, so
// the household page and the individual Overview cannot compute "percent
// funded" two different ways. `PlanLike` covers both `Plan` and
// `HouseholdPlan`, since a household plan is a personal one shared, not a
// different shape (lib/household.ts).
export function toPlanProgressRow(p: PlanLike, key: string): PlanProgressRowData {
  const { current, target } = planNumbers(p);
  return {
    key,
    title: planTitle(p),
    color: planColor(p),
    icon: SHAPE_ICON[planShape(p)],
    current,
    target,
    prog: target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0,
    waiting: false,
  };
}

// Renders as a link when `href` is given (the individual Overview's own use,
// navigating to /app/plans), or as a plain button when `onClick` is given
// instead (the household Overview's use, switching this page's own local tab
// rather than navigating anywhere). Exactly one of the two is expected.
export function PlanProgressRow({ row, href, onClick }: {
  row: PlanProgressRowData; href?: string; onClick?: () => void;
}) {
  const cls = row.waiting ? "plan-row waiting" : "plan-row";
  const body = (
    <>
      <div className="track" style={{ background: cssVar(row.color) }}><PlanIcon name={row.icon} /></div>
      <div className="pr-body">
        <div className="pr-top">
          <span className="pt">{row.title}</span>
          {row.target > 0 ? <span className="amt tnum">{moneyK(row.current)} <small>/ {moneyK(row.target)}</small></span> : null}
        </div>
        <div className="bar"><i style={{ width: `${row.prog}%`, background: cssVar(row.color) }} /></div>
        <div className="pr-bot">
          <span>{row.target > 0 ? `${row.prog}% funded` : "No target set yet"}</span>
          <span className={`status ${row.target > 0 ? "ok" : "setup"}`}>{row.target > 0 ? "On track" : "Setup"}</span>
        </div>
      </div>
    </>
  );
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{body}</button>;
  return <Link href={href ?? "/app/plans"} className={cls}>{body}</Link>;
}
