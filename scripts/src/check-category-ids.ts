// Proves that the category ids in api/_categorize.ts and the backfill mapping
// in supabase/migrations/0024_category_ids.sql say the same thing.
//
// Run: pnpm --filter @workspace/scripts run check-category-ids
//
// This exists because the migration's mapping is DERIVED from CATEGORY_GROUPS
// but cannot import it: a migration is SQL, applied by hand, long after the
// deploy that wrote it. So the two are the same fact written twice, which is
// the shape that drifts. It already caught one bug on the first run: the
// generated file had lost its last entry to a missing newline, so
// "Transfer in" would have kept a null id forever, silently, on every table.
//
// Three things are checked, and the second matters most:
//   1. every label in the taxonomy has the same id in both places
//   2. no two labels share an id  (five labels name BOTH a group and a leaf, so
//      an unprefixed slug would collide on exactly those)
//   3. the migration names no label the taxonomy does not have
//
// Re-run this whenever a category is added, renamed, or moved between groups,
// and add the new rows to the migration in the same change.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Dynamic import: this workspace is `"type": "module"` and api/ is authored for
// the edge runtime without extensions, so a static specifier resolves but its
// named exports do not survive the interop. Awaiting the import does.
const { CATEGORY_GROUPS, categoryIdOf } = await import("../../api/_categorize.ts");

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(resolve(repo, "supabase/migrations/0024_category_ids.sql"), "utf8");

// Every `    ('Label', 'id'),` row of the VALUES mapping. The file repeats the
// same list once per table, so a Map collapses them and a disagreement between
// the copies shows up as a mismatch below.
const fromSql = new Map<string, string>();
for (const m of sql.matchAll(/^ {4}\('((?:[^']|'')+)', '([a-z0-9_]+)'\),?$/gm)) {
  fromSql.set(m[1].replace(/''/g, "'"), m[2]);
}

const labels = new Set<string>();
for (const g of CATEGORY_GROUPS) {
  labels.add(g.label);
  for (const c of g.categories) labels.add(c);
}

const problems: string[] = [];

for (const label of labels) {
  const ours = categoryIdOf(label);
  const theirs = fromSql.get(label) ?? null;
  if (ours !== theirs) problems.push(`${JSON.stringify(label)}: _categorize=${ours} migration=${theirs}`);
}
for (const label of fromSql.keys()) {
  if (!labels.has(label)) problems.push(`migration names ${JSON.stringify(label)}, which is not in the taxonomy`);
}

const ids = [...labels].map((l) => categoryIdOf(l)!);
const collisions = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
for (const id of collisions) {
  problems.push(`id ${id} is shared by: ${[...labels].filter((l) => categoryIdOf(l) === id).join(", ")}`);
}

// A label outside the taxonomy must have no id at all. Inventing one would
// assert a classification groupOf() never made.
if (categoryIdOf("Not A Real Category") !== null) problems.push("an unknown label was given an id");

console.log(`${labels.size} labels, ${fromSql.size} mapped in the migration, ${new Set(ids).size} distinct ids`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`FAIL: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("PASS: _categorize.ts and 0024_category_ids.sql agree, and every id is unique");
