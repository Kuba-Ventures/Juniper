import { PageHeader } from "@/components/juniper/app-frame";

/* Pine-header placeholders for surfaces still being ported from the design mock.
   The identity + nav are live; bodies land in the next Stage-2 passes. */

function Stub({ title, sub, note }: { title: string; sub: string; note: string }) {
  return (
    <div className="frame">
      <PageHeader title={title} sub={sub} />
      <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>
        {note}
      </div>
    </div>
  );
}

export function Spending() {
  return <Stub title="Spending" sub="Every transaction, categorized — budgets, and the subscriptions hiding in your recurring charges." note="Spending (Overview / Transactions / Budgets / Subscriptions) — porting next." />;
}
export function Plans() {
  return <Stub title="Plans" sub="Your money goals — funded from real balances, with the next step always in view." note="Plans grid with create / edit — porting next." />;
}
export function Credit() {
  return <Stub title="Credit" sub="Your credit score, monitored monthly — plus every card and how much of your limit you're using." note="Credit score, trend, alerts, and card utilization — porting next." />;
}
export function Recommended() {
  return <Stub title="Recommended for you" sub="Money moves picked for your situation — plus a library of vetted options to explore." note="Picked-for-you + Library — porting next." />;
}
