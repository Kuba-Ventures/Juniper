// Regenerates artifacts/juniper/src/lib/emoji-data.ts from Unicode's own data.
//
// Run: node_modules/.bin/tsx scripts/src/gen-emoji-data.ts
//
// Committed rather than run at build time, on the same reasoning as the
// migration mapping in 0024: the app must not depend on unicode.org being up,
// and a change to the emoji list should be a diff somebody reviewed rather than
// something that shifts underneath a deploy.
//
// Rerun it when there is a reason to (a new Unicode release worth picking up),
// look at the diff, and commit both files together.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SOURCE = "https://unicode.org/Public/emoji/15.1/emoji-test.txt";
// Unicode's own NAME is a poor search index: a member looking for a coffee icon
// types "coffee", and the name of that emoji is "hot beverage". CLDR's
// annotations are what every emoji keyboard actually searches, and they list
// coffee, cafe, caffeine, chai and tea for that one. Merged in below.
const CLDR = "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/en/annotations.json";

// CLDR order, which is the order a keyboard palette should use, with the short
// section names the picker shows.
const SECTIONS: [string, string][] = [
  ["Smileys & Emotion", "Smileys"],
  ["People & Body", "People"],
  ["Animals & Nature", "Nature"],
  ["Food & Drink", "Food"],
  ["Activities", "Activities"],
  ["Travel & Places", "Travel"],
  ["Objects", "Objects"],
  ["Symbols", "Symbols"],
  ["Flags", "Flags"],
];

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Could not read ${SOURCE}: ${res.status}`);
const text = await res.text();

const cldrRes = await fetch(CLDR);
if (!cldrRes.ok) throw new Error(`Could not read ${CLDR}: ${cldrRes.status}`);
const cldr = (await cldrRes.json()) as {
  annotations: { annotations: Record<string, { default?: string[]; tts?: string[] }> };
};
const keywords = cldr.annotations.annotations;

type Row = { e: string; text: string; group: string };
const rows: Row[] = [];
let group = "";
let sub = "";
// U+1F3FB to U+1F3FF. Dropped: five shades of every gesture is noise in a list
// whose job is naming a spending category, and the base emoji is already there.
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;

for (const line of text.split("\n")) {
  if (line.startsWith("# group:")) { group = line.slice(8).trim(); continue; }
  if (line.startsWith("# subgroup:")) { sub = line.slice(11).trim(); continue; }
  if (!line || line.startsWith("#")) continue;
  // Only fully-qualified: the minimally-qualified and unqualified forms are the
  // same emoji missing a variation selector, and offering both would put
  // visually identical twins in the grid.
  const m = /^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E(\d+\.\d+)\s+(.+)$/.exec(line);
  if (!m) continue;
  if (m[1].trim().split(/\s+/).map((c) => parseInt(c, 16)).some(isSkinTone)) continue;
  // Three sources, deduplicated and lowercased: Unicode's name, its subgroup
  // (so "smile" finds the whole face-smiling run), and CLDR's keywords (so
  // "coffee" finds the emoji Unicode calls "hot beverage").
  const ann = keywords[m[2]];
  const words = new Set(
    [m[4], sub.replace(/-/g, " "), ...(ann?.default ?? []), ...(ann?.tts ?? [])]
      .join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  );
  rows.push({ e: m[2], text: [...words].join(" "), group });
}

const out = SECTIONS.map(([long, short]) => ({
  g: short,
  e: rows.filter((r) => r.group === long).map((r) => [r.e, r.text]),
}));

const header = `// GENERATED, do not edit by hand. Regenerate with:
//   node_modules/.bin/tsx scripts/src/gen-emoji-data.ts
//
// Source: Unicode emoji-test.txt (15.1), fully-qualified sequences only, skin
// tone variants dropped. Each entry is [emoji, searchable text], where the text
// is Unicode's name, its subgroup, and CLDR's search keywords, deduplicated and
// lowercased. CLDR is what makes "coffee" find the emoji Unicode calls "hot
// beverage", which Unicode's own name never would.
//
// This file is imported DYNAMICALLY by the emoji picker and by nothing else, so
// it is code-split out of the main bundle: the app already ships about 1MB and
// the build warns about it, and nobody who never opens the picker should pay
// for this.
//
// Everything here is offered, including emoji newer than any given operating
// system. lib/emoji-support.ts filters the list to what the CURRENT machine can
// actually draw, so a member on an older Windows sees a shorter list rather
// than a grid of empty boxes.

`;

const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../artifacts/juniper/src/lib/emoji-data.ts");
writeFileSync(target, `${header}export const EMOJI_GROUPS: { g: string; e: [string, string][] }[] = ${JSON.stringify(out)};\n`);
console.log(`${rows.length} emoji across ${out.length} sections -> ${target}`);
