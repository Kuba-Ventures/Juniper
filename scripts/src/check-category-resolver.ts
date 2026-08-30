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
const { taxonomyFor } = await import("../../api/_categorize.ts");

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "category-golden.json"), "utf8")) as {
  labelAnswers: Record<string, { g: string; k: string; isGroup: boolean; id: string | null }>;
  categorizeAnswers: Record<string, string>;
  nullish: Record<string, unknown>;
};

// Any user id: today every member resolves to the same taxonomy. When stage 3
// makes that untrue, this check keeps asserting the zero-rows case, which is
// exactly the case that must never change.
const tax = await taxonomyFor("00000000-0000-0000-0000-000000000000");

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

// The derived lists the endpoints read off the taxonomy, rather than rebuilding
// from CATEGORY_GROUPS at six call sites the way they used to.
const spend = tax.groups.filter((g) => g.kind === "spend").map((g) => g.label);
eq("spendGroups", tax.spendGroups.join("|"), spend.join("|"));
const everyLabel = tax.groups.flatMap((g) => [g.label, ...g.categories]);
eq("writableLabels size", tax.writableLabels.size, new Set(everyLabel).size);
for (const l of everyLabel) if (!tax.writableLabels.has(l)) problems.push(`writableLabels is missing ${JSON.stringify(l)}`);

const cases = Object.keys(golden.labelAnswers).length * 4 + Object.keys(golden.categorizeAnswers).length + 7;
console.log(`${cases} classification cases replayed against the pre-refactor fixture`);
if (problems.length) {
  for (const p of problems.slice(0, 25)) console.error(`  ${p}`);
  if (problems.length > 25) console.error(`  ...and ${problems.length - 25} more`);
  console.error(`FAIL: ${problems.length} answer${problems.length === 1 ? "" : "s"} changed`);
  process.exit(1);
}
console.log("PASS: the resolver answers exactly as the pre-refactor module did");
