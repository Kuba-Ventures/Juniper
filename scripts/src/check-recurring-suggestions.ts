// api/_recurring-suggestions.ts checked without a database, a Plaid account or
// a signed-in session. Run: node_modules/.bin/tsx scripts/src/check-recurring-suggestions.ts
//
// The real case this module exists for: a member's Ancestry ($39.99/mo) and
// Apple ($9.99/mo) both cleared through PayPal, both landed in `transactions`
// with a clean merchant name, and Plaid's own recurring detection never
// clustered either into a stream. This is the fallback, and it is worth its
// own check because a false positive here is a confident, specific, wrong
// claim about a member's money ("this repeats") landing right next to a
// number they might act on, the same failure shape check-rewards.ts guards.
const M = await import("../../api/_recurring-suggestions.ts");
const { findRecurringSuggestions } = M;
type SuggestionTxn = { id: string; merchantName: string; amount: number; date: string };

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

function txn(id: string, merchantName: string, amount: number, date: string): SuggestionTxn {
  return { id, merchantName, amount, date };
}

// 1. The real case: 4 months of Ancestry + Apple, one Apple month also
// carrying an unrelated one-off App Store purchase that must not merge in.
{
  const txns: SuggestionTxn[] = [
    txn("a1", "Ancestry", 39.99, "2026-06-14"),
    txn("a2", "Ancestry", 39.99, "2026-07-14"),
    txn("a3", "Ancestry", 39.99, "2026-08-14"),
    txn("a4", "Ancestry", 39.99, "2026-09-14"),
    txn("p1", "Apple", 9.99, "2026-06-04"),
    txn("p2", "Apple", 98.99, "2026-06-10"), // one-off, different rounded bucket
    txn("p3", "Apple", 9.99, "2026-07-04"),
    txn("p4", "Apple", 9.99, "2026-08-04"),
    txn("p5", "Apple", 9.99, "2026-09-04"),
  ];
  const found = findRecurringSuggestions(txns, new Set());
  check("finds both Ancestry and Apple", found.length === 2);
  const ancestry = found.find((f) => f.merchantKey === "ancestry");
  const apple = found.find((f) => f.merchantKey === "apple");
  check("Ancestry: 4 occurrences", ancestry?.occurrences === 4);
  check("Ancestry: average is 39.99", ancestry?.averageAmount === 39.99);
  check("Apple: 4 occurrences, the $98.99 outlier excluded", apple?.occurrences === 4);
  check("Apple: average is 9.99, not pulled up by the outlier", apple?.averageAmount === 9.99);
}

// 2. Two occurrences is not enough, even with a perfect monthly gap.
{
  const txns: SuggestionTxn[] = [txn("a", "Ancestry", 39.99, "2026-06-14"), txn("b", "Ancestry", 39.99, "2026-07-14")];
  check("2 occurrences: not suggested", findRecurringSuggestions(txns, new Set()).length === 0);
}

// 3. A weekly habit (a coffee shop, same rounded amount) must not read as
// "recurring" the way a subscription does: the gap is nowhere near monthly.
{
  const txns: SuggestionTxn[] = [
    txn("c1", "Blue Bottle", 6.5, "2026-06-01"),
    txn("c2", "Blue Bottle", 6.75, "2026-06-08"),
    txn("c3", "Blue Bottle", 6.6, "2026-06-15"),
    txn("c4", "Blue Bottle", 6.4, "2026-06-22"),
  ];
  check("weekly habit: not suggested", findRecurringSuggestions(txns, new Set()).length === 0);
}

// 4. A grocery run at the same store for a similar rounded total, but on no
// consistent cadence at all, must not read as recurring either.
{
  const txns: SuggestionTxn[] = [
    txn("g1", "Trader Joes", 84.0, "2026-06-02"),
    txn("g2", "Trader Joes", 83.5, "2026-06-11"),
    txn("g3", "Trader Joes", 84.2, "2026-06-25"),
    txn("g4", "Trader Joes", 83.8, "2026-07-30"),
  ];
  check("irregular grocery pattern: not suggested", findRecurringSuggestions(txns, new Set()).length === 0);
}

// 5. A merchant Plaid already tracks as a real stream must never be
// re-proposed as a Juniper suggestion alongside it.
{
  const txns: SuggestionTxn[] = [
    txn("n1", "Netflix", 15.49, "2026-06-05"),
    txn("n2", "Netflix", 15.49, "2026-07-05"),
    txn("n3", "Netflix", 15.49, "2026-08-05"),
  ];
  check("already-Plaid-tracked merchant: excluded", findRecurringSuggestions(txns, new Set(["netflix"])).length === 0);
}

// 6. A blank merchant name (a fee, a transfer) is out of scope for this
// module the same way it is for Plaid's own detector.
{
  const txns: SuggestionTxn[] = [
    txn("f1", "", 25, "2026-06-01"),
    txn("f2", "", 25, "2026-07-01"),
    txn("f3", "", 25, "2026-08-01"),
  ];
  check("blank merchant name: excluded", findRecurringSuggestions(txns, new Set()).length === 0);
}

// 7. Capped at MAX_SUGGESTIONS even with many real-looking candidates, so the
// suggestion box can never itself become the noise it exists to cut through.
{
  const txns: SuggestionTxn[] = [];
  for (let m = 0; m < 4; m++) {
    for (let n = 0; n < 8; n++) {
      txns.push(txn(`m${n}-${m}`, `Merchant ${n}`, 10 + n, `2026-0${6 + m}-1${n % 9}`));
    }
  }
  check("capped at MAX_SUGGESTIONS", findRecurringSuggestions(txns, new Set()).length === 6);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("check-recurring-suggestions: all checks passed.");
}
