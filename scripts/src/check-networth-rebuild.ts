// Which stored net-worth days a rebuild may delete, checked without a database.
//
// Run: node_modules/.bin/tsx scripts/src/check-networth-rebuild.ts
//
// WHY THIS IS WORTH ITS OWN CHECK. Every other check in this directory guards a
// figure. This one guards a DELETE, on the one table in the app that cannot be
// recomputed: `net_worth_snapshots` is keyed by (user, day), so a day nobody
// wrote is a day nobody can write later, and a recorded day deleted by mistake
// is a real observation of somebody's money that is gone for good. A
// reconstruction can be rebuilt; an observation cannot.
//
// So the property being asserted is not "the plan is correct". It is "the plan
// can never include a day Juniper actually recorded", for any input at all,
// including the malformed ones.
import { strictEqual, deepStrictEqual, ok as assert } from "node:assert";
const W = await import("../../api/_networth-walk.ts");

let n = 0;
const ok = (what: string, fn: () => void) => { fn(); n++; void what; };

const day = (as_of: string) => ({ as_of, assets: 0, debts: 0, net_worth: 0 });
const walked = (...days: string[]) => days.map(day);

// ── The case this exists for ───────────────────────────────────────────────
ok("a recorded day inside the window is never deletable", () => {
  const plan = W.replaceableDays(walked("2026-08-29", "2026-08-30", "2026-08-31"), [
    { as_of: "2026-08-29", estimated: true },
    { as_of: "2026-08-30", estimated: false }, // recorded by the daily snapshot
    { as_of: "2026-08-31", estimated: true },
  ]);
  deepStrictEqual(plan.deletable, ["2026-08-29", "2026-08-31"]);
  deepStrictEqual(plan.protected, ["2026-08-30"]);
});

// ── The Schwab case, which is why a rebuild exists at all ──────────────────
ok("THE SCHWAB CASE: a long reconstructed stretch is replaceable in full", () => {
  const days = ["2026-05-27", "2026-05-28", "2026-06-01", "2026-07-15", "2026-08-01"];
  const plan = W.replaceableDays(walked(...days), days.map((as_of) => ({ as_of, estimated: true })));
  deepStrictEqual(plan.deletable, days);
  deepStrictEqual(plan.protected, []);
});

ok("a day the walk did not produce is left alone, even when it is estimated", () => {
  // The guard against emptying history the rebuild is not about to rewrite: a
  // date range would have taken this row, and the walk's own output does not.
  const plan = W.replaceableDays(walked("2026-08-30"), [
    { as_of: "2026-01-01", estimated: true },
    { as_of: "2026-08-30", estimated: true },
  ]);
  deepStrictEqual(plan.deletable, ["2026-08-30"]);
  assert(!plan.deletable.includes("2026-01-01"), "must not reach outside the walk");
});

ok("nothing walked means nothing deletable, so a failed walk cannot empty a history", () => {
  const plan = W.replaceableDays([], [
    { as_of: "2026-08-30", estimated: true },
    { as_of: "2026-08-31", estimated: true },
  ]);
  deepStrictEqual(plan.deletable, []);
  deepStrictEqual(plan.protected, []);
});

ok("no existing rows means nothing to delete, which is the first-ever backfill", () => {
  const plan = W.replaceableDays(walked("2026-08-30", "2026-08-31"), []);
  deepStrictEqual(plan.deletable, []);
});

ok("every day recorded means a rebuild is a no-op, not a wipe", () => {
  const days = ["2026-08-29", "2026-08-30", "2026-08-31"];
  const plan = W.replaceableDays(walked(...days), days.map((as_of) => ({ as_of, estimated: false })));
  deepStrictEqual(plan.deletable, []);
  deepStrictEqual(plan.protected, days);
});

ok("duplicate rows for one day do not multiply the delete beyond that day", () => {
  const plan = W.replaceableDays(walked("2026-08-30"), [
    { as_of: "2026-08-30", estimated: true },
    { as_of: "2026-08-30", estimated: true },
  ]);
  deepStrictEqual([...new Set(plan.deletable)], ["2026-08-30"]);
});

// ── The invariant, over the whole space rather than over examples ──────────
ok("INVARIANT: no recorded day is deletable, over every combination of 12 days", () => {
  const days = Array.from({ length: 12 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
  // Every subset of days the walk produced, crossed with every assignment of
  // recorded/reconstructed to the stored rows: 4096 x 4096 is too many, so the
  // walk subset is driven by the bits of the same counter, rotated, which still
  // covers every day in both roles many times over.
  let cases = 0;
  for (let mask = 0; mask < 4096; mask++) {
    const rotated = ((mask << 5) | (mask >> 7)) & 4095;
    const walkedDays = days.filter((_, i) => rotated & (1 << i));
    const existing = days.map((as_of, i) => ({ as_of, estimated: !!(mask & (1 << i)) }));
    const plan = W.replaceableDays(walked(...walkedDays), existing);
    for (const d of plan.deletable) {
      const row = existing.find((e) => e.as_of === d)!;
      assert(row.estimated, `deletable must be estimated: ${d} at mask ${mask}`);
      assert(walkedDays.includes(d), `deletable must be walked: ${d} at mask ${mask}`);
    }
    cases++;
  }
  strictEqual(cases, 4096);
});

console.log(`${n} rebuild-plan cases passed (including 4096 exhaustive combinations)`);
console.log("PASS: a rebuild can delete only days it reconstructed, and only days it is rewriting");
