// The emoji grid: every emoji this machine can draw, searchable.
//
// LOADED ON DEMAND. emoji-data.ts is 73KB of generated Unicode data, and it is
// imported dynamically here and nowhere else, so it is code-split out of a main
// bundle that already ships about 1MB. A member who never changes an icon never
// downloads it.
//
// FILTERED BY WHAT THIS MACHINE RENDERS, not by a version table. See
// lib/emoji-support.ts: an emoji newer than the operating system draws as an
// empty box, and a grid with holes in it reads as a broken screen rather than
// as an old computer.
import { useEffect, useMemo, useRef, useState } from "react";
import { renderableEmoji, isSingleEmoji } from "@/lib/emoji-support";

type Section = { g: string; e: [string, string][] };

export function EmojiPicker({ current, onPick, onReset, onCancel }: {
  current: string;
  onPick: (emoji: string) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    import("@/lib/emoji-data")
      .then(({ EMOJI_GROUPS }) => {
        if (dead) return;
        const ok = renderableEmoji(EMOJI_GROUPS.flatMap((g) => g.e.map(([e]) => e)));
        setSections(EMOJI_GROUPS
          .map((g) => ({ g: g.g, e: g.e.filter(([e]) => ok.has(e)) }))
          .filter((g) => g.e.length));
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, []);

  const needle = q.trim().toLowerCase();
  // Matches the START of a word, not anywhere in the string. A plain substring
  // search on "rent" returns an old man and a window, because CLDR lists them
  // under "parent" and "transparent". Prefix matching keeps "coff" finding
  // coffee while dropping the accidents, and it costs two indexOf calls per
  // entry rather than a split.
  const hit = (text: string) => text.startsWith(needle) || text.includes(` ${needle}`);
  const shown = useMemo(() => {
    if (!sections) return [];
    if (!needle) return sections;
    return sections
      .map((g) => ({ g: g.g, e: g.e.filter(([, text]) => hit(text)) }))
      .filter((g) => g.e.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, needle]);

  // A typed or pasted emoji is honoured even when the search finds nothing,
  // which is how a member uses the operating system's own emoji keyboard:
  // Windows key + full stop, or Control + Command + Space on a Mac.
  const typed = isSingleEmoji(q) ? q.trim() : null;

  return (
    <div className="ep" ref={box}>
      <div className="ep-head">
        <input
          className="cp-q" autoFocus value={q} placeholder="Search icons, or paste one"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
        />
      </div>
      {typed && (
        <button type="button" className="ep-typed" onClick={() => onPick(typed)}>
          <span className="ep-typed-e">{typed}</span> Use this one
        </button>
      )}
      <div className="ep-body">
        {failed && <div className="cp-none">Could not load the icons. Paste one instead.</div>}
        {!failed && !sections && <div className="cp-none">Loading icons…</div>}
        {sections && !shown.length && !typed && <div className="cp-none">Nothing matches that.</div>}
        {shown.map((g) => (
          <div key={g.g}>
            <div className="ep-sec">{g.g}</div>
            <div className="ep-grid">
              {g.e.map(([e]) => (
                <button key={e} type="button" title={e}
                  className={`ep-opt${e === current ? " on" : ""}`} onClick={() => onPick(e)}>{e}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ep-foot">
        <button type="button" className="btn ghost sm" onClick={onReset}>Use the default</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
