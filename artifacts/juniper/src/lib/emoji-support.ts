// Which emoji THIS machine can actually draw.
//
// An emoji comes from a font the operating system ships, so one newer than the
// OS renders as an empty box. The built-in category icons dodge that by never
// going past Unicode 11 (see api/_categorize.ts), but a picker offering the
// full list cannot: a member on Windows 10 would get a grid with holes in it,
// and a hole looks like a bug rather than like "your computer is a bit old".
//
// So the list is filtered to what the browser in front of us renders. That is
// measured, not guessed from a version table, because the answer depends on the
// OS, its update level, and any emoji font the member has installed.
//
// HOW. A glyph the font does not have is drawn as the "missing glyph" box, and
// every missing glyph is the same width. So an emoji whose advance width equals
// the width of a codepoint guaranteed never to exist is not being drawn. A
// multi-codepoint sequence gets a second test: an unsupported ZWJ sequence
// falls apart into its components side by side, which is measurably wider than
// one emoji, so anything wider than a known-good single emoji is rejected too.
//
// This is a heuristic, and it fails in one direction on purpose: a real emoji
// that happens to match the box width is dropped from the picker. Losing one
// emoji from a list of 1,898 costs a member nothing. Showing them a box costs
// them confidence in the whole screen.

// U+FFFF is a permanent noncharacter: no font will ever have a glyph for it, so
// its rendered width IS the missing-glyph width.
const NEVER_EXISTS = "￿";
// Unicode 6.0, on every emoji font since 2010. The yardstick for "one emoji wide".
const KNOWN_GOOD = "\u{1F600}";

const FONT = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

let cache: Set<string> | null = null;

/**
 * The subset of `candidates` this machine draws. Computed once and memoized:
 * the answer cannot change while the page is open.
 *
 * Returns every candidate unchanged when there is no canvas to measure with
 * (a test environment, a browser refusing the context). Offering an emoji that
 * might not draw is a far smaller failure than offering none at all.
 */
export function renderableEmoji(candidates: string[]): Set<string> {
  if (cache) return cache;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (cache = new Set(candidates));
  ctx.font = FONT;

  const missing = ctx.measureText(NEVER_EXISTS).width;
  const single = ctx.measureText(KNOWN_GOOD).width;
  // If the two are indistinguishable the measurement tells us nothing, which
  // happens under headless renderers with no emoji font at all. Filtering on a
  // meaningless signal would empty the picker, so nothing is filtered.
  if (!single || Math.abs(single - missing) < 0.5) return (cache = new Set(candidates));

  const out = new Set<string>();
  for (const e of candidates) {
    const w = ctx.measureText(e).width;
    if (Math.abs(w - missing) < 0.5) continue;  // drawn as the missing-glyph box
    if (w > single * 1.5) continue;             // a sequence that fell apart
    out.add(e);
  }
  cache = out;
  return out;
}

// One emoji, not a sentence, and actually pictographic. Counts graphemes so a
// ZWJ sequence or a flag counts as one, and rejects letters and punctuation so
// the field cannot quietly become a second name.
export function isSingleEmoji(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  if ([...seg.segment(v)].length !== 1) return false;
  // Regional indicators carry no Extended_Pictographic property, so a flag has
  // to be recognized on its own terms.
  if (/^\p{Regional_Indicator}{2}$/u.test(v)) return true;
  return /\p{Extended_Pictographic}/u.test(v);
}
