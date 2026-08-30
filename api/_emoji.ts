// One emoji, decided properly.
//
// A regex over codepoints gets this wrong three ways: a ZWJ family is several
// codepoints, a flag is two regional indicators carrying no Extended_Pictographic
// property at all, and plenty of emoji carry a variation selector. Grapheme
// segmentation is the thing that knows all three are one character.
//
// Its own module rather than a helper inside api/categories.ts because
// artifacts/juniper/src/lib/emoji-support.ts has to make exactly the same
// decision on the client, and two definitions of "one emoji" would eventually
// disagree about somebody's icon.
export function isSingleEmoji(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  if ([...seg.segment(v)].length !== 1) return false;
  if (/^\p{Regional_Indicator}{2}$/u.test(v)) return true;
  return /\p{Extended_Pictographic}/u.test(v);
}
