// What a credit-account balance means, checked without a database or a Plaid
// account.
//
// Run: node_modules/.bin/tsx scripts/src/check-credit-balance.ts
//
// WHY THIS IS WORTH ITS OWN CHECK. The rule it guards is one line of arithmetic
// and it was wrong in production, in five places at once, for as long as the
// Credit page has existed. A Capital One card sitting at -328.21 with a $4,400
// limit was drawn as "$328 of $4,400 limit, Used 7%", and the same figure fed the
// Juniper Score's debt-load factor, the Score's credit factor and net worth. So a
// refund the issuer owed the member made their score worse and their net worth
// smaller.
//
// Nothing about that failed loudly. Every number looked plausible.
import { strictEqual, deepStrictEqual, ok as assert } from "node:assert";
const C = await import("../../api/_credit-balance.ts");

let n = 0;
const ok = (what: string, fn: () => void) => { fn(); n++; void what; };

// ── The case that was wrong in production ──────────────────────────────────
ok("THE PRODUCTION CASE: a card in credit owes nothing and uses none of its limit", () => {
  const p = C.creditPosition(-328.21);
  deepStrictEqual(p, { owed: 0, inCredit: 328.21 });
  strictEqual(C.utilizationPct(p.owed, 4400), 0);
  // The two answers this rules out: the old abs said 7%, and a raw divide would
  // have said -7%.
  assert(C.utilizationPct(p.owed, 4400) !== 7, "must not read an overpayment as usage");
  assert((C.utilizationPct(p.owed, 4400) ?? 0) >= 0, "must never be negative");
});
ok("the small one too, which is easy to dismiss and is the same bug", () => {
  // Discover at -0.41. Rounded away on screen either way, but it still reached
  // cardDebt and net worth as 41 cents of debt.
  deepStrictEqual(C.creditPosition(-0.41), { owed: 0, inCredit: 0.41 });
});

// ── Owing money, which is the ordinary case ────────────────────────────────
ok("a positive balance is owed, unchanged", () => {
  deepStrictEqual(C.creditPosition(533.34), { owed: 533.34, inCredit: 0 });
  strictEqual(C.utilizationPct(533.34, 9000), 6);
});
ok("zero is neither owed nor in credit", () => {
  deepStrictEqual(C.creditPosition(0), { owed: 0, inCredit: 0 });
  strictEqual(C.utilizationPct(0, 9000), 0);
});
ok("exactly one side is ever non-zero, which is what makes callers simple", () => {
  for (const bal of [-1000, -0.01, 0, 0.01, 1000, 12345.67]) {
    const p = C.creditPosition(bal);
    assert(p.owed === 0 || p.inCredit === 0, `both sides set for ${bal}`);
    assert(p.owed >= 0 && p.inCredit >= 0, `negative half for ${bal}`);
  }
});

// ── Rubbish in ─────────────────────────────────────────────────────────────
ok("a missing or nonsense balance is zero, not NaN", () => {
  // A stored snapshot written before `limit` was sanitized through can carry
  // nulls, and NaN in a denominator produces a bar of width NaN%.
  deepStrictEqual(C.creditPosition(null), { owed: 0, inCredit: 0 });
  deepStrictEqual(C.creditPosition(undefined), { owed: 0, inCredit: 0 });
  deepStrictEqual(C.creditPosition(Number.NaN), { owed: 0, inCredit: 0 });
  deepStrictEqual(C.creditPosition(Number.POSITIVE_INFINITY), { owed: 0, inCredit: 0 });
});

// ── Utilization, and the difference between unknown and zero ───────────────
ok("no limit is null, NOT zero, because they are different facts", () => {
  // The Credit page prints "Unknown" for one and "0%" for the other, and a card
  // with no reported limit is excluded from the overall figure entirely.
  strictEqual(C.utilizationPct(328, null), null);
  strictEqual(C.utilizationPct(328, undefined), null);
  strictEqual(C.utilizationPct(328, 0), null);
  strictEqual(C.utilizationPct(328, -100), null);
  strictEqual(C.utilizationPct(0, 4400), 0);
});
ok("over the limit is real, and is capped so the bar cannot escape its track", () => {
  strictEqual(C.utilizationPct(5000, 4400), 100);
  strictEqual(C.utilizationPct(4400, 4400), 100);
  strictEqual(C.utilizationPct(2200, 4400), 50);
});
ok("rounding is to a whole percent, matching what the page prints", () => {
  strictEqual(C.utilizationPct(1, 4400), 0);
  strictEqual(C.utilizationPct(22, 4400), 1);
  strictEqual(C.utilizationPct(4356, 4400), 99);
});

// ── The member's real portfolio, end to end ────────────────────────────────
ok("the real three cards: overall utilization is 3%, not the 5% that shipped", () => {
  // Chase 533.34 of 9,000, Capital One -328.21 of 4,400 (member-set limit),
  // Discover -0.41 of 4,500 (member-set limit).
  const cards: [number, number][] = [[533.34, 9000], [-328.21, 4400], [-0.41, 4500]];
  let owed = 0, limit = 0, inCredit = 0;
  for (const [bal, lim] of cards) {
    const p = C.creditPosition(bal);
    owed += p.owed;
    inCredit += p.inCredit;
    limit += lim;
  }
  strictEqual(Math.round(owed * 100) / 100, 533.34);
  strictEqual(Math.round(inCredit * 100) / 100, 328.62);
  strictEqual(limit, 17900);
  strictEqual(C.utilizationPct(owed, limit), 3);
  // What shipped: abs() summed to 862 and read 5%.
  const withAbs = Math.abs(533.34) + Math.abs(-328.21) + Math.abs(-0.41);
  strictEqual(Math.round(withAbs * 100) / 100, 861.96);
  strictEqual(C.utilizationPct(withAbs, limit), 5);
});

console.log(`${n} credit-balance cases passed`);
console.log("PASS: a card in credit owes nothing, uses none of its limit, and is not debt");
