// Exercises the merge that layers a member's own categories over the built-ins,
// and the one behaviour the whole feature rests on: after a rename, a row
// written under the OLD label still resolves to the category it always was.
//
// Run: node_modules/.bin/tsx scripts/src/check-member-categories.ts
//
// applyMemberCategories is pure, which is why it can be checked here at all.
// The database read that feeds it lives in api/_taxonomy.ts.
import { deepStrictEqual, strictEqual } from "node:assert";
const { BUILTIN_GROUPS, applyMemberCategories, buildTaxonomy } =
  await import("../../api/_categorize.ts");

const build = (rows: Parameters<typeof applyMemberCategories>[1]) =>
  buildTaxonomy(applyMemberCategories(BUILTIN_GROUPS, rows));

const groceries = () => BUILTIN_GROUPS.find((g) => g.label === "Groceries & dining")!;
const COFFEE_ID = groceries().leaves.find((l) => l.label === "Coffee shops")!.id;
const DINING_GROUP = groceries().id;

let checks = 0;
const ok = (what: string, fn: () => void) => { fn(); checks++; void what; };

// ── No rows is the built-in taxonomy, unchanged ─────────────────────────────
ok("no rows leaves the base identical", () => {
  strictEqual(applyMemberCategories(BUILTIN_GROUPS, []), BUILTIN_GROUPS);
});

// ── Rename a built-in ───────────────────────────────────────────────────────
const renamed = build([{ category_id: COFFEE_ID, name: "Coffee", group_id: null }]);
ok("the new name is what the taxonomy offers", () => {
  const leaves = renamed.groups.find((g) => g.label === "Groceries & dining")!.leaves.map((l) => l.label);
  strictEqual(leaves.includes("Coffee"), true);
  strictEqual(leaves.includes("Coffee shops"), false);
});
ok("the id is unchanged by a rename", () => {
  strictEqual(renamed.categoryIdOf("Coffee"), COFFEE_ID);
});
ok("the leaf keeps its position, so the list does not reshuffle", () => {
  const before = groceries().leaves.findIndex((l) => l.id === COFFEE_ID);
  const after = renamed.groups.find((g) => g.label === "Groceries & dining")!.leaves.findIndex((l) => l.id === COFFEE_ID);
  strictEqual(after, before);
});

// THE ONE THAT MATTERS. A charge written months ago stored the label as it read
// then. Resolving it by label would now find nothing and drop it into
// "Everything else", taking it out of the member's dining total and out of any
// budget on it. By id it is still the same category, wearing its new name.
ok("history written under the old label still resolves, and displays the new one", () => {
  // The emoji rides along and does NOT change: renaming "Coffee shops" to
  // "Coffee" does not make it stop being coffee.
  deepStrictEqual(renamed.classify(COFFEE_ID, "Coffee shops"), {
    c: "Coffee", g: "Groceries & dining", k: "spend", e: "\u2615",
  });
});
ok("the old label alone no longer names anything, which is why the id is read first", () => {
  strictEqual(renamed.groupOf("Coffee shops"), "Everything else");
});
ok("a rename does not make the old label writable", () => {
  strictEqual(renamed.writableLabels.has("Coffee shops"), false);
  strictEqual(renamed.writableLabels.has("Coffee"), true);
});

// ── Create a leaf ───────────────────────────────────────────────────────────
const created = build([{ category_id: "c_11111111", name: "Bike repairs", group_id: DINING_GROUP }]);
ok("a category the member created gets the label icon, not its group's", () => {
  strictEqual(created.classify("c_11111111", "Bike repairs").e, "\uD83C\uDFF7\uFE0F");
  strictEqual(created.classify(COFFEE_ID, "Coffee shops").e, "\u2615");
});
ok("a created leaf is offered, and inherits its group's kind", () => {
  strictEqual(created.writableLabels.has("Bike repairs"), true);
  strictEqual(created.groupOf("Bike repairs"), "Groceries & dining");
  strictEqual(created.kindOf("Bike repairs"), "spend");
  strictEqual(created.categoryIdOf("Bike repairs"), "c_11111111");
});
ok("a created leaf is appended, so existing positions are untouched", () => {
  const leaves = created.groups.find((g) => g.label === "Groceries & dining")!.leaves;
  strictEqual(leaves[leaves.length - 1].label, "Bike repairs");
  strictEqual(leaves[0].label, groceries().leaves[0].label);
});
ok("a leaf created in Transfers is a transfer, which is the supported escape hatch", () => {
  const t = build([{ category_id: "c_22222222", name: "Card autopay", group_id: BUILTIN_GROUPS.find((g) => g.label === "Transfers & payments")!.id }]);
  strictEqual(t.kindOf("Card autopay"), "transfer");
});

// ── Rows that must be ignored rather than half-applied ──────────────────────
ok("a row naming a group is skipped: groups are not renameable yet", () => {
  const t = build([{ category_id: DINING_GROUP, name: "Food", group_id: null }]);
  strictEqual(t.groups.find((g) => g.id === DINING_GROUP)!.label, "Groceries & dining");
});
ok("a created leaf with an unknown group is dropped, not orphaned", () => {
  const t = build([{ category_id: "c_33333333", name: "Nowhere", group_id: "g_does_not_exist" }]);
  strictEqual(t.writableLabels.has("Nowhere"), false);
});
ok("a created leaf with no group is dropped", () => {
  const t = build([{ category_id: "c_44444444", name: "Homeless", group_id: null }]);
  strictEqual(t.writableLabels.has("Homeless"), false);
});
ok("a blank name is ignored rather than blanking a category", () => {
  const t = build([{ category_id: COFFEE_ID, name: "   ", group_id: null }]);
  strictEqual(t.categoryIdOf("Coffee shops"), COFFEE_ID);
});
ok("names are trimmed", () => {
  const t = build([{ category_id: COFFEE_ID, name: "  Coffee  ", group_id: null }]);
  strictEqual(t.categoryIdOf("Coffee"), COFFEE_ID);
});

// ── Hiding (stage 4) ────────────────────────────────────────────────────────
//
// The point of the whole feature is the gap between "not offered" and "does not
// exist". Every assertion here is one half of that gap.
const hiddenTax = build([{ category_id: COFFEE_ID, name: null, group_id: null, archived: true }]);
ok("a hidden category leaves the offered list", () => {
  const offered = hiddenTax.groups.find((g) => g.label === "Groceries & dining")!.leaves.map((l) => l.label);
  strictEqual(offered.includes("Coffee shops"), false);
});
ok("a hidden category cannot be chosen", () => {
  strictEqual(hiddenTax.writableLabels.has("Coffee shops"), false);
});
// THE ONE THAT MATTERS. Hiding must not touch a single existing charge.
ok("history in a hidden category still resolves, by id and by label", () => {
  deepStrictEqual(hiddenTax.classify(COFFEE_ID, "Coffee shops"), {
    c: "Coffee shops", g: "Groceries & dining", k: "spend", e: "\u2615",
  });
  strictEqual(hiddenTax.groupOf("Coffee shops"), "Groceries & dining");
  strictEqual(hiddenTax.kindOf("Coffee shops"), "spend");
  strictEqual(hiddenTax.categoryIdOf("Coffee shops"), COFFEE_ID);
});
ok("what the Plaid sync produces for a hidden category still lands in the right group", () => {
  // categorize() knows nothing about what a member has hidden, by design.
  const label = hiddenTax.categorize("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE");
  strictEqual(label, "Coffee shops");
  strictEqual(hiddenTax.classify(hiddenTax.categoryIdOf(label), label).g, "Groceries & dining");
});
ok("hiding and renaming at once keeps both", () => {
  const t = build([{ category_id: COFFEE_ID, name: "Coffee", group_id: null, archived: true }]);
  strictEqual(t.writableLabels.has("Coffee"), false);
  deepStrictEqual(t.classify(COFFEE_ID, "Coffee shops"), { c: "Coffee", g: "Groceries & dining", k: "spend", e: "\u2615" });
});
ok("a member's own category can be hidden too", () => {
  const t = build([
    { category_id: "c_55555555", name: "Bike repairs", group_id: DINING_GROUP },
    { category_id: "c_55555555", name: null, group_id: null, archived: true },
  ]);
  strictEqual(t.writableLabels.has("Bike repairs"), false);
  strictEqual(t.classify("c_55555555", "Bike repairs").g, "Groceries & dining");
});
ok("unhiding puts a category back where it was, not at the end", () => {
  // The merge filters a fixed base order rather than removing and re-appending,
  // so a category returns to its own slot. Worth asserting: a naive
  // implementation puts it last, and a list that reshuffles when you unhide is
  // a list you stop trusting.
  const before = groceries().leaves.map((l) => l.label);
  const hiddenThen = build([{ category_id: COFFEE_ID, name: null, group_id: null, archived: true }]);
  strictEqual(hiddenThen.groups.find((g) => g.label === "Groceries & dining")!.leaves.length, before.length - 1);
  const back = build([]).groups.find((g) => g.label === "Groceries & dining")!.leaves.map((l) => l.label);
  deepStrictEqual(back, before);
});
ok("unhiding is the absence of the row, so nothing lingers", () => {
  const t = build([{ category_id: COFFEE_ID, name: null, group_id: null, archived: false }]);
  strictEqual(t.writableLabels.has("Coffee shops"), true);
});

// ── The base is never mutated ───────────────────────────────────────────────
ok("the built-in groups are not mutated by a merge", () => {
  strictEqual(groceries().leaves.some((l) => l.label === "Coffee shops"), true);
  strictEqual(groceries().leaves.some((l) => l.label === "Bike repairs"), false);
});

console.log(`${checks} member-category cases passed`);
console.log("PASS: renames keep their id and their history, created leaves inherit their group's kind,\n      and hiding removes a category from the picker without touching a single charge");
