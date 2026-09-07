// The stateful half of an arrangeable widget board (#252's personal Overview,
// #290's shared Overview): everything about DRAGGING, ordering, hiding and
// persisting a member's arrangement, with no opinion about what a widget
// actually renders as. A page using this owns its own widgets, its own
// `emptyWhy` (which widgets have nothing to say right now) and its own JSX,
// and calls `pack()` on whatever it decides to lay out.
//
// See lib/arrange-board.ts for the pure packing/geometry this builds on.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isShown, layoutFrom, resolveOrder, sizeFor, sizeLabel, withNudged,
  type DashboardLayout, type WidgetRegistry,
} from "@/lib/dashboard-layout";
import {
  DASH_GAP, DASH_BREAKPOINT, packMasonry, withFullFlags, bestDropIndex, withShownReordered,
} from "@/lib/arrange-board";

export { DASH_GAP, DASH_BREAKPOINT, withFullFlags };

/** Arrow keys nudge the focused grip one step earlier or later, so the whole
 *  feature is not mouse-only, which is the defect #190 fixed on plan cards. */
export const NUDGE_KEYS: Record<string, -1 | 1> = {
  ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1,
};

export const GripIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={13} height={13}><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" /></svg>
);

export const ArrangeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" width={14} height={14}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);

export const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={12} height={12}><path d="M6 9l6 6 6-6" /></svg>
);

/** Drawn in a widget's place while arranging, when the widget has nothing to
 *  show. Rule 3 (#252): it must not occupy a slot on the live page, and the
 *  member must still be able to move the slot they chose for it. */
export function EmptySlot({ title, why }: { title: string; why: string }) {
  return (
    <div className="card dash-empty">
      <div className="card-head"><h3>{title}</h3></div>
      <p>{why}</p>
    </div>
  );
}

export function LoadingSlot({ title }: { title: string }) {
  return (
    <div className="card dash-empty">
      <div className="card-head"><h3>{title}</h3></div>
      <p>Loading…</p>
    </div>
  );
}

export interface ArrangeBoard {
  editing: boolean;
  setEditing: (v: boolean | ((prev: boolean) => boolean)) => void;
  order: string[];
  hidden: Set<string>;
  sizes: Record<string, string>;
  sizeMenuOpen: string | null;
  setSizeMenuOpen: (v: string | null | ((prev: string | null) => string | null)) => void;
  announce: string;
  /** For the page's own toggle button ("Arrange"/"Done"), which announces a
   *  mode change rather than a widget's own move. */
  setAnnounce: (v: string) => void;
  setShown: (id: string, on: boolean) => void;
  nudge: (id: string, delta: -1 | 1) => void;
  setWidgetSize: (id: string, size: string) => void;
  /** Attach to the board's own container div. */
  board: React.RefObject<HTMLDivElement | null>;
  dragId: string | null;
  onCardPointerDown: (e: React.PointerEvent, id: string) => void;
  onBoardPointerMove: (e: React.PointerEvent) => void;
  endDrag: () => void;
  /** One stable callback ref per widget id, for the card's own resize
   *  observation; call once per rendered card, e.g. `ref={cardRef(id)}`. */
  cardRef: (id: string) => (el: HTMLDivElement | null) => void;
  boardWidth: number;
  cols: number;
  colWidth: number;
  /** Packs a page-supplied `{id, full}[]` (its own `laidOut`, already filtered
   *  by whatever emptiness rule the page uses) against this board's measured
   *  heights and current column geometry. */
  pack: (laidOut: { id: string; full: boolean }[]) => { pos: Record<string, { x: number; y: number; width: number }>; height: number };
}

/**
 * One board's worth of arranging state: which widgets are on it and in what
 * order (from `registry` + `layout`), the drag-and-drop mechanics that let a
 * member change that, and the debounced write back through `onLayout`.
 *
 * `boardLabel` is used only in the announced live-region text ("added to your
 * Overview" vs "added to your shared Overview"); everything else is read from
 * `registry`, which is what makes this safe to call twice, once per board,
 * with two different registries and two different stored columns.
 */
export function useArrangeBoard(
  registry: WidgetRegistry,
  layout: DashboardLayout | null,
  onLayout: ((next: DashboardLayout) => void) | undefined,
  boardLabel = "Overview",
): ArrangeBoard {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(() => resolveOrder(layout, registry));
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(registry.widgets.filter((w) => !isShown(layout, w.id, registry)).map((w) => w.id)),
  );
  const [sizes, setSizes] = useState<Record<string, string>>(
    () => Object.fromEntries(registry.widgets.map((w) => [w.id, sizeFor(layout, w.id, registry)])),
  );
  const [sizeMenuOpen, setSizeMenuOpen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // ── the write side reads the refs, not the state ─────────────────────────
  //
  // Both mutations below can fire more than once before React re-renders: two
  // chips tapped in the same tick, or a held arrow key repeating. Reading
  // `order`/`hidden`/`sizes` out of the closure loses every write but the
  // last, which is not theoretical (#252's own history: adding two shelf
  // widgets at once put exactly one of them back). The refs are updated
  // synchronously, so the second call in a tick sees the first.
  const orderRef = useRef(order);
  const hiddenRef = useRef(hidden);
  const sizesRef = useRef(sizes);
  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);
  useEffect(() => { sizesRef.current = sizes; }, [sizes]);

  // The profile resolves after first paint, so the stored layout arrives
  // late. Adopted only while NOT arranging: a remote answer landing mid-drag
  // would pull the card out from under the member's finger.
  useEffect(() => {
    if (editing) return;
    const nextOrder = resolveOrder(layout, registry);
    const nextHidden = new Set(registry.widgets.filter((w) => !isShown(layout, w.id, registry)).map((w) => w.id));
    const nextSizes = Object.fromEntries(registry.widgets.map((w) => [w.id, sizeFor(layout, w.id, registry)]));
    orderRef.current = nextOrder;
    hiddenRef.current = nextHidden;
    sizesRef.current = nextSizes;
    setOrder(nextOrder);
    setHidden(nextHidden);
    setSizes(nextSizes);
    setSizeMenuOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, editing, registry]);

  // Written through the profile, so the arrangement lands in localStorage and
  // in `user_profiles` by the same path holder_style takes. Debounced,
  // because a keyboard nudge held down would otherwise be one POST per
  // keypress.
  const saveTimer = useRef<number | null>(null);
  const persist = useCallback((nextOrder: string[], nextHidden: Set<string>, nextSizes: Record<string, string>) => {
    if (!onLayout) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      onLayout(layoutFrom(nextOrder, (id) => !nextHidden.has(id), (id) => nextSizes[id], registry));
    }, 500);
  }, [onLayout, registry]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const setShown = (id: string, on: boolean) => {
    const next = new Set(hiddenRef.current);
    if (on) next.delete(id); else next.add(id);
    hiddenRef.current = next;
    setHidden(next);
    persist(orderRef.current, next, sizesRef.current);
    setAnnounce(`${registry.byId[id]?.title} ${on ? "added to" : "taken off"} your ${boardLabel}`);
  };

  const nudge = (id: string, delta: -1 | 1) => {
    const next = withNudged(orderRef.current, id, delta);
    if (next === orderRef.current) return;
    orderRef.current = next;
    setOrder(next);
    persist(next, hiddenRef.current, sizesRef.current);
    const visible = next.filter((w) => !hiddenRef.current.has(w));
    setAnnounce(`${registry.byId[id]?.title} moved to ${visible.indexOf(id) + 1} of ${visible.length}`);
  };

  const setWidgetSize = (id: string, size: string) => {
    const next = { ...sizesRef.current, [id]: size };
    sizesRef.current = next;
    setSizes(next);
    setSizeMenuOpen(null);
    persist(orderRef.current, hiddenRef.current, next);
    setAnnounce(`${registry.byId[id]?.title} shown as ${sizeLabel(id, size, registry).toLowerCase()}`);
  };

  // Closes an open size menu on a click anywhere else, the same behavior a
  // native <select> gets for free. Only listens while a menu is actually
  // open, so this costs nothing on every render of a page most members never
  // arrange.
  useEffect(() => {
    if (!sizeMenuOpen) return;
    const close = () => setSizeMenuOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [sizeMenuOpen]);

  // Pointer events rather than the native HTML5 drag, which does not fire for
  // touch at all: this has to work on the phone the member is holding. The
  // capture is taken on the BOARD rather than on the card, because the card is
  // re-rendered mid-drag as the order changes and a capture on it would be
  // lost with the node it was taken on.
  const board = useRef<HTMLDivElement>(null);
  // Which card is being dragged, in a ref for the same reason the order is:
  // the handlers below can run before React has re-rendered with the new
  // state, and a `pointerup` that reads a stale null leaves the board stuck
  // mid-drag. The state copy exists only to put a class on the card.
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const onCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (!editing) return;
    if ((e.target as HTMLElement).closest("button")) return; // the remove badge
    e.preventDefault();
    try { board.current?.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    dragRef.current = id;
    setDragId(id);
  };

  // The board's own width, so the packer below knows how many columns fit and
  // how wide one is; tracked rather than read once, because the board can
  // resize without the window doing so (a sidebar, a font swap, a browser
  // zoom change).
  const [boardWidth, setBoardWidth] = useState(0);
  useEffect(() => {
    if (!board.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setBoardWidth(Math.round(w));
    });
    ro.observe(board.current);
    return () => ro.disconnect();
  }, []);
  const cols = boardWidth > 0 && boardWidth < DASH_BREAKPOINT ? 1 : 2;
  const colWidth = cols === 1 ? boardWidth : Math.max(0, (boardWidth - DASH_GAP) / 2);

  // Every card's real rendered height, which is what `packMasonry` packs
  // against. One shared observer rather than one per card: the number of
  // cards on screen is small and bounded, and a shared one means taking a
  // widget off the board (into the shelf) can't leak an observer nobody is
  // disconnecting. `cardRefs` caches one callback per id so React does not
  // tear down and recreate the observation on every render, only when a
  // card actually mounts or unmounts.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const observedEls = useRef(new Map<string, HTMLElement>());
  const cardRefs = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  // Built synchronously during render, not inside an effect: a ref callback
  // fires as part of the same commit that mounts the card, before any effect
  // runs, so an observer created in a `useEffect` would still be null the one
  // time a freshly-mounted card's ref callback could have started watching
  // it, and would never observe anything. Guarded so it is built exactly
  // once per instance of the hook.
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  if (!resizeObserverRef.current) {
    resizeObserverRef.current = new ResizeObserver((entries) => {
      let changed = false;
      const next = { ...heightsRef.current };
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.widget;
        if (!id) continue;
        const h = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        if (next[id] !== h) { next[id] = h; changed = true; }
      }
      if (changed) setHeights(next);
    });
  }
  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  const cardRef = (id: string): ((el: HTMLDivElement | null) => void) => {
    let fn = cardRefs.current.get(id);
    if (!fn) {
      fn = (el) => {
        const prev = observedEls.current.get(id);
        if (prev && prev !== el) resizeObserverRef.current?.unobserve(prev);
        if (el) {
          observedEls.current.set(id, el);
          resizeObserverRef.current?.observe(el);
        } else {
          observedEls.current.delete(id);
        }
      };
      cardRefs.current.set(id, fn);
    }
    return fn;
  };

  const onBoardPointerMove = (e: React.PointerEvent) => {
    const id = dragRef.current;
    if (!id || !board.current) return;
    const rect = board.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const others = orderRef.current.filter((wid) => wid !== id && !hiddenRef.current.has(wid));
    const i = bestDropIndex(others, id, (wid) => sizes[wid], (wid) => heights[wid] ?? 180, colWidth, cols, x, y, registry);
    const newShown = [...others.slice(0, i), id, ...others.slice(i)];
    const next = withShownReordered(orderRef.current, hiddenRef.current, newShown);
    if (next.length === orderRef.current.length && next.every((v, idx) => v === orderRef.current[idx])) return;
    orderRef.current = next;
    setOrder(next);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragId(null);
    persist(orderRef.current, hiddenRef.current, sizesRef.current);
  };

  const pack = (laidOut: { id: string; full: boolean }[]) =>
    packMasonry(laidOut, (id) => heights[id] ?? 180, colWidth, cols);

  return {
    editing, setEditing,
    order, hidden, sizes, sizeMenuOpen, setSizeMenuOpen, announce, setAnnounce,
    setShown, nudge, setWidgetSize,
    board, dragId, onCardPointerDown, onBoardPointerMove, endDrag, cardRef,
    boardWidth, cols, colWidth, pack,
  };
}
