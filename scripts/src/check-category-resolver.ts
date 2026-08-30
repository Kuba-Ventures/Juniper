// Proves the per-member resolver classifies exactly as the module-level
// functions did before stage 2 of docs/CUSTOM_CATEGORIES.md.
//
// Run: node_modules/.bin/tsx scripts/src/check-category-resolver.ts
//
// WHY THIS EXISTS. api/_finance-snapshot.ts feeds the Juniper Score, and
// `score_history` is keyed by (user, day), so a day written from a wrong
// classification cannot be quietly recomputed later: the member watches the
// number move and there is no way back. Stage 2 rewrote the classification
// path, so "it looks equivalent" is not good enough.
//
// HOW. `category-golden.json` was captured by running the PRE-refactor module
// over its whole input domain: every group label, every leaf label, whitespace
// and casing variants, nullish inputs, every key of DETAILED_MAP and
// PRIMARY_MAP, a sample of primary/detailed combinations, and inputs that match
// neither map. This replays all of it through `taxonomyFor()` and demands the
// same answers.
//
// The fixture is a BASELINE, not an output. Do not regenerate it to make this
// pass. If a change is meant to alter a classification, change the fixture in
// the same commit and say in the message which answers moved and why, because
// each one is somebody's score.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// BUILTIN_TAXONOMY, not taxonomyFor: this check is about the classification
// maths, and taxonomyFor now reaches for Supabase. A member with no categories
// of their own gets exactly this object back, which is the case that must never
// change and the one asserted here.
const { BUILTIN_TAXONOMY } = await import("../../api/_categorize.ts");

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "category-golden.json"), "utf8")) as {
  labelAnswers: Record<string, { g: string; k: string; isGroup: boolean; id: string | null }>;
  categorizeAnswers: Record<string, string>;
  nullish: Record<string, unknown>;
};

const tax = BUILTIN_TAXONOMY;

const problems: string[] = [];
const eq = (what: string, got: unknown, want: unknown) => {
  if (got !== want) problems.push(`${what}: got ${JSON.stringify(got)}, fixture says ${JSON.stringify(want)}`);
};

for (const [label, want] of Object.entries(golden.labelAnswers)) {
  eq(`groupOf(${JSON.stringify(label)})`, tax.groupOf(label), want.g);
  eq(`kindOf(${JSON.stringify(label)})`, tax.kindOf(label), want.k);
  eq(`isGroupLabel(${JSON.stringify(label)})`, tax.isGroupLabel(label), want.isGroup);
  eq(`categoryIdOf(${JSON.stringify(label)})`, tax.categoryIdOf(label), want.id);
}

for (const [key, want] of Object.entries(golden.categorizeAnswers)) {
  let got: string;
  if (key.startsWith("D:")) got = tax.categorize(undefined, key.slice(2));
  else if (key.startsWith("P:") && !key.includes("|")) got = tax.categorize(key.slice(2), undefined);
  else if (key === "lowercase") got = tax.categorize("income", "income_wages");
  else if (key === "P:NOPE|D:NOPE") got = tax.categorize("NOPE", "NOPE");
  else {
    const [p, d] = key.split("|");
    got = tax.categorize(p, d);
  }
  eq(`categorize(${key})`, got, want);
}

const n = golden.nullish;
eq("groupOf(null)", tax.groupOf(null), n.groupOfNull);
eq("groupOf(undefined)", tax.groupOf(undefined), n.groupOfUndef);
eq("kindOf(null)", tax.kindOf(null), n.kindOfNull);
eq("kindOf(undefined)", tax.kindOf(undefined), n.kindOfUndef);
eq("isGroupLabel(null)", tax.isGroupLabel(null), n.isGroupNull);
eq("categoryIdOf(null)", tax.categoryIdOf(null), n.idNull);
eq("categorize(undefined, undefined)", tax.categorize(undefined, undefined), n.categorizeEmpty);

// ── classify(): id-first resolution must agree with the label path ──────────
//
// Stage 3 moved every read onto `classify(category_id, category)`. Two things
// have to hold for that to be a no-op today, and they are what this asserts:
//
//   1. with the row's own id, classify returns the same group and kind the
//      label path returns, and the label itself as the display value
//   2. with a null id, classify degrades to exactly the label path, which is
//      the case for every row written before migration 0024 backfilled
//
// Once a member renames a category these two DIVERGE on purpose, and that is
// the point: the id keeps pointing at the same category while the label a row
// was written with goes stale. Until then they must be identical.
for (const [label, want] of Object.entries(golden.labelAnswers)) {
  const id = tax.categoryIdOf(label);
  const withId = tax.classify(id, label);
  const withoutId = tax.classify(null, label);
  const displayed = label.trim() || "Everything else";
  if (id) {
    eq(`classify(id of ${JSON.stringify(label)}).g`, withId.g, want.g);
    eq(`classify(id of ${JSON.stringify(label)}).k`, withId.k, want.k);
    // `.trim()`, not the raw label: resolving through the id returns the
    // taxonomy's canonical spelling, so " Rent " comes back as "Rent". That is
    // the id path doing its job, and it cannot bite real data, because both
    // writers store exact labels (categorize() returns table strings verbatim,
    // and PATCH trims then requires an exact match against writableLabels).
    eq(`classify(id of ${JSON.stringify(label)}).c`, withId.c, label.trim());
  }
  eq(`classify(null, ${JSON.stringify(label)}).g`, withoutId.g, want.g);
  eq(`classify(null, ${JSON.stringify(label)}).k`, withoutId.k, want.k);
  eq(`classify(null, ${JSON.stringify(label)}).c`, withoutId.c, displayed);
}
// An id the taxonomy does not know must not win over the stored label.
eq("classify(bogus id, 'Rent').g", tax.classify("c_not_a_real_id", "Rent").g, "Housing");
eq("classify(null, null).c", tax.classify(null, null).c, "Everything else");
eq("classify(null, null).g", tax.classify(null, null).g, "Everything else");

// The derived lists the endpoints read off the taxonomy, rather than rebuilding
// from CATEGORY_GROUPS at six call sites the way they used to.
const spend = tax.groups.filter((g) => g.kind === "spend").map((g) => g.label);
eq("spendGroups", tax.spendGroups.join("|"), spend.join("|"));
const everyLabel = tax.groups.flatMap((g) => [g.label, ...g.leaves.map((l) => l.label)]);
eq("writableLabels size", tax.writableLabels.size, new Set(everyLabel).size);
for (const l of everyLabel) if (!tax.writableLabels.has(l)) problems.push(`writableLabels is missing ${JSON.stringify(l)}`);

const cases = Object.keys(golden.labelAnswers).length * 10 + Object.keys(golden.categorizeAnswers).length + 10;
console.log(`${cases} classification cases replayed against the pre-refactor fixture`);
if (problems.length) {
  for (const p of problems.slice(0, 25)) console.error(`  ${p}`);
  if (problems.length > 25) console.error(`  ...and ${problems.length - 25} more`);
  console.error(`FAIL: ${problems.length} answer${problems.length === 1 ? "" : "s"} changed`);
  process.exit(1);
}
console.log("PASS: the resolver answers exactly as the pre-refactor module did");
