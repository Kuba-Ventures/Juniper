// The category picker: a searchable, grouped list of every label a transaction
// can be moved to.
//
// Its options come from the server (`taxonomy` on the transactions first page),
// not from a copy of the taxonomy here, because a second stored vocabulary in
// the client is exactly what api/_categorize.ts exists to prevent. With no
// taxonomy in hand the picker does not open at all, rather than opening onto a
// guessed list.
//
// Income and Transfers are offered alongside spending on purpose. "This was a
// credit card payment, not shopping" is one of the corrections most worth
// making: a card payment counted as spending bills the member twice for
// purchases that were already counted when they happened.
//
// WHY THIS PORTALS TO <body> AND POSITIONS ITSELF FIXED. The transactions table
// sits in `.tx-tablewrap`, which is `overflow-x: auto`. Per the overflow spec a
// `visible` value on the other axis computes to `auto` when one axis is not
// visible, so that wrapper clips vertically too: an absolutely positioned panel
// inside the cell was cut off at the table's bottom edge and turned the wrapper
// into a scroller. Measured, not assumed. A portal escapes the clip, and fixed
// coordinates taken from the anchor keep the panel on the row it belongs to.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cssVar } from "@/components/juniper/primitives";
import { colorOf } from "@/lib/category-color";
import type { CategoryGroupOption } from "@/lib/transactions";

const GAP = 6;      // between the anchor and the panel
const MARGIN = 8;   // smallest gap the panel keeps from a viewport edge

export function CategoryPicker({ anchor, taxonomy, value, busy, onPick, onClose }: {
  /** The control the panel hangs off, used for its position. */
  anchor: HTMLElement;
  taxonomy: CategoryGroupOption[];
  value?: string;
  busy?: boolean;
  onPick: (category: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? 300;
    const w = box.current?.offsetWidth ?? 264;
    const below = window.innerHeight - a.bottom - GAP - MARGIN;
    const above = a.top - GAP - MARGIN;
    // Flip up only when below genuinely cannot hold the panel AND above is
    // roomier, so the common case stays predictable: the panel drops down.
    const flip = below < h && above > below;
    setPos({
      top: flip ? Math.max(MARGIN, a.top - GAP - Math.min(h, above)) : a.bottom + GAP,
      left: Math.min(Math.max(MARGIN, a.left), window.innerWidth - w - MARGIN),
      maxHeight: Math.max(160, flip ? above : below),
    });
  }, [anchor]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    // `true` on scroll: the row sits inside a scrollable wrapper, and a scroll
    // event on an inner element does not bubble, so a capture listener is the
    // only one that hears it.
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [place]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // The anchor is excluded deliberately. Without this, pressing the tag
      // again would close the panel here and then the button's own click would
      // toggle it straight back open, so the control would look dead.
      if (box.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const needle = q.trim().toLowerCase();
  // A group name matching keeps all of its categories, so typing "fun" finds
  // the whole of Fun & travel rather than nothing.
  const groups = useMemo(
    () =>
      taxonomy
        .map((g) => ({
          ...g,
          cats: needle && !g.g.toLowerCase().includes(needle)
            ? g.cats.filter((c) => c.toLowerCase().includes(needle))
            : g.cats,
        }))
        .filter((g) => g.cats.length),
    [taxonomy, needle],
  );

  // `display: contents` so the wrapper carries the `.jnpr` token scope without
  // adding a box of its own, same trick as modal-portal.tsx.
  return createPortal(
    <div className="jnpr" style={{ display: "contents" }}>
      <div
        className="cp" ref={box} role="dialog" aria-label="Choose a category"
        style={pos ? { top: pos.top, left: pos.left, visibility: "visible" } : { visibility: "hidden" }}
      >
        <input
          className="cp-q" autoFocus placeholder="Search categories"
          value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
        />
        <div className="cp-list" style={pos ? { maxHeight: pos.maxHeight - 62 } : undefined}>
          {groups.map((g) => (
            <div key={g.g}>
              <div className="cp-g">
                <span className="sw" style={{ background: cssVar(colorOf(g.g)) }} />
                {g.g}
              </div>
              {g.cats.map((c) => (
                <button
                  key={c} type="button" disabled={busy}
                  className={`cp-i${c === value ? " on" : ""}`}
                  onClick={() => onPick(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <div className="cp-none">Nothing matches that.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
