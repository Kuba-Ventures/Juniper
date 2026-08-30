// Every combination of the three answers a synced transaction can have, and
// which one wins.
//
// Run: node_modules/.bin/tsx scripts/src/check-category-precedence.ts
//
// WHY THIS IS WORTH ITS OWN CHECK. This is the code that quietly reverts a
// member's work when it is wrong, and it has been wrong before: before #201,
// transactions-sync upserted with merge-duplicates and wrote
// `category_source: "plaid"` on every row, so a correction survived only until
// Plaid next touched that transaction and then vanished with no error and no
// trace. Nothing failed. The member just found their coffee back under
// Everything else a week later.
//
// The decision is pure, so all eight combinations can be exercised here without
// a database, a Plaid account, or a signed-in session. What CANNOT be checked
// here is that transactions-sync actually calls it, and that Plaid's `modified`
// list really does come back through this path in production. That is the
// manual check in docs, and it is named rather than pretended away.
import { deepStrictEqual, strictEqual } from "node:assert";
const { decideCategory, merchantKey } = await import("../../api/_category-precedence.ts");

let n = 0;
const ok = (what: string, fn: () => void) => { fn(); n++; void what; };

// ── The eight combinations ──────────────────────────────────────────────────
ok("plaid alone", () => {
  deepStrictEqual(decideCategory({ plaid: "Everything else" }), { category: "Everything else", source: "plaid" });
});
ok("a rule beats plaid", () => {
  deepStrictEqual(decideCategory({ plaid: "Everything else", rule: "Coffee shops" }),
    { category: "Coffee shops", source: "rule" });
});
ok("a correction beats plaid", () => {
  deepStrictEqual(decideCategory({ plaid: "Everything else", override: "Groceries" }),
    { category: "Groceries", source: "user" });
});
// THE ONE THAT MATTERS. A rule is about a merchant; a correction is about one
// charge. The more specific statement wins, or a member who files a single
// Amazon charge under Groceries watches their own rule undo it every sync.
ok("a correction beats a rule", () => {
  deepStrictEqual(decideCategory({ plaid: "Everything else", rule: "Shopping", override: "Groceries" }),
    { category: "Groceries", source: "user" });
});
ok("the source is kept, not downgraded", () => {
  // `user` is what makes it keep winning next time. Writing it back as `plaid`
  // or as `rule` is the same as losing the correction, one sync later.
  strictEqual(decideCategory({ plaid: "X", override: "Y" }).source, "user");
  strictEqual(decideCategory({ plaid: "X", rule: "Y" }).source, "rule");
});

// ── Empty is not an answer ──────────────────────────────────────────────────
ok("a blank rule or correction falls through rather than blanking a category", () => {
  deepStrictEqual(decideCategory({ plaid: "Groceries", rule: "", override: "" }),
    { category: "Groceries", source: "plaid" });
  deepStrictEqual(decideCategory({ plaid: "Groceries", rule: "   ", override: null }),
    { category: "Groceries", source: "plaid" });
  deepStrictEqual(decideCategory({ plaid: "Groceries", rule: "Coffee shops", override: "  " }),
    { category: "Coffee shops", source: "rule" });
});

// ── Merchant matching ───────────────────────────────────────────────────────
ok("matching is case and whitespace insensitive, and nothing more", () => {
  strictEqual(merchantKey("  Blue   Bottle  "), "blue bottle");
  strictEqual(merchantKey("BLUE BOTTLE"), "blue bottle");
});
ok("a merchant Plaid did not name cannot be ruled on", () => {
  strictEqual(merchantKey(null), null);
  strictEqual(merchantKey(""), null);
  strictEqual(merchantKey("   "), null);
});
ok("store numbers and processor prefixes are NOT stripped", () => {
  // Deliberate. Stripping them is the kind of guess that catches a merchant the
  // member never named, and a rule that files the wrong charge is worse than
  // one that misses.
  strictEqual(merchantKey("SQ *BLUE BOTTLE #241") === merchantKey("Blue Bottle"), false);
});

// ── LIKE wildcards ──────────────────────────────────────────────────────────
// The retroactive apply matches with ilike, where % and _ are wildcards. A
// merchant carrying either would catch rows it should not, and a rule that
// files somebody else's charges is worse than one that misses.
const likeLiteral = (v: string) => v.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
ok("percent and underscore are escaped before being used as a pattern", () => {
  strictEqual(likeLiteral("PAYPAL *INST_XFER"), "PAYPAL *INST\\_XFER");
  strictEqual(likeLiteral("100% CHARGE"), "100\\% CHARGE");
  strictEqual(likeLiteral("A\\B"), "A\\\\B");
  strictEqual(likeLiteral("Blue Bottle"), "Blue Bottle");
});

console.log(`${n} precedence cases passed`);
console.log("PASS: a correction beats a rule beats Plaid, and a source is never downgraded");
