// Asserts every category in the taxonomy has an icon, and that every icon is
// one emoji that will actually draw on the machines members use.
//
// Run: node_modules/.bin/tsx scripts/src/check-category-emoji.ts
//
// WHY THE VERSION CEILING. Emoji render from a font the operating system ships,
// so an emoji newer than the OS draws as an empty box. Windows 10 1809 (2018)
// and macOS 10.14 carry Unicode 11, and everything here is at or below that, so
// there is no machine still in use that shows a member a blank square where
// their category's icon should be. A newer, better emoji that MIGHT not draw is
// worse than an older one that always does.
//
// The ceiling is enforced by codepoint: every emoji added to the table has to
// appear in ALLOWED below, which is the set this check was written against. A
// new icon therefore fails here until somebody has looked up its Unicode
// version, which is exactly the moment to look it up.
import { strictEqual } from "node:assert";
const { BUILTIN_GROUPS, defaultEmoji, NEW_CATEGORY_EMOJI } = await import("../../api/_categorize.ts");

// Every emoji the taxonomy uses, each verified as Unicode 11.0 or earlier.
const ALLOWED = new Set([
  "🏠", "🍽️", "🚗", "💳", "🛍️", "✈️", "💡", "🏥", "📦", "💰", "🔁",
  "🏦", "🔨", "🛒", "☕", "⛽", "🚙", "🅿️", "🚕", "🎓", "👕", "💻", "🎁",
  "🎬", "🎵", "📱", "🛡️", "🦷", "💊", "🏋️", "💇", "👶", "🏛️", "📚", "🔧",
  "💵", "📈", "🏖️", "🧾", "↗️", "↘️",
  // What a category the member created gets until they choose one.
  "🏷️",
]);

const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (s: string) => [...seg.segment(s)].length;

const labels: string[] = [];
for (const g of BUILTIN_GROUPS) {
  labels.push(g.label);
  for (const l of g.leaves) labels.push(l.label);
}

const problems: string[] = [];
for (const label of new Set(labels)) {
  const e = defaultEmoji(label);
  if (!e) { problems.push(`${JSON.stringify(label)} has no emoji`); continue; }
  if (graphemes(e) !== 1) problems.push(`${JSON.stringify(label)} has ${graphemes(e)} graphemes, not 1: ${e}`);
  if (!/\p{Extended_Pictographic}/u.test(e)) problems.push(`${JSON.stringify(label)} is not pictographic: ${JSON.stringify(e)}`);
  if (!ALLOWED.has(e)) {
    problems.push(`${JSON.stringify(label)} uses ${e}, which is not in the version-checked set. Look up its Unicode version, and add it to ALLOWED only if it is 11.0 or older.`);
  }
}

// The two fallbacks have to be safe too: one is what an unrecognized label
// gets, the other is what every category a member creates starts with.
strictEqual(graphemes(defaultEmoji("Not A Real Category")), 1);
strictEqual(graphemes(NEW_CATEGORY_EMOJI), 1);
if (!ALLOWED.has(NEW_CATEGORY_EMOJI)) problems.push("NEW_CATEGORY_EMOJI is not version-checked");

console.log(`${new Set(labels).size} labels, every one with a version-checked emoji`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`FAIL: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("PASS: every category has one emoji, and every emoji is Unicode 11.0 or older");
