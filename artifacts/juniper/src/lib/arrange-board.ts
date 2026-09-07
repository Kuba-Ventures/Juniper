// Pure geometry behind an arrangeable widget board: packing, drop-position
// scoring, and the reorder-without-disturbing-hidden-widgets helper. No React
// here, so both boards (the personal Overview, #252, and the shared Overview,
// #290) can call the exact same math rather than each keeping its own copy of
// it, which is how a masonry bug would end up fixed in one place and not the
// other. See components/juniper/arrange-board.tsx for the stateful half.
import type { WidgetRegistry } from "@/lib/dashboard-layout";

/** Space between cards, in both axes. */
export const DASH_GAP = 16;
/** Below this the packer falls back to one column, the same width the old
 *  (pre-#252) grid switched to a single `1fr` track at. */
export const DASH_BREAKPOINT = 860;

/**
 * True masonry: each column packs its own cards tight, independent of the
 * other column's height. Walks the member's own order and drops each
 * half-width card into whichever column is CURRENTLY shorter, using real
 * measured heights (`heightOf`), so the result always matches the order the
 * member dragged into rather than a browser's own balancing guess. A
 * full-width card spans both columns at whichever is currently taller, and
 * resets both to the same height below it, the same way a full row did in
 * the old grid.
 *
 * Unmeasured heights (a card that has not painted yet) fall back to a
 * placeholder rather than 0, so the first pack is a reasonable layout instead
 * of every card collapsing to the same point; the real height replaces it,
 * and the board repacks, within the same paint in practice.
 */
export function packMasonry(
  laidOut: { id: string; full: boolean }[],
  heightOf: (id: string) => number,
  colWidth: number,
  cols: number,
): { pos: Record<string, { x: number; y: number; width: number }>; height: number } {
  const pos: Record<string, { x: number; y: number; width: number }> = {};
  if (cols <= 1) {
    let y = 0;
    for (const { id } of laidOut) {
      pos[id] = { x: 0, y, width: colWidth };
      y += heightOf(id) + DASH_GAP;
    }
    return { pos, height: Math.max(0, y - DASH_GAP) };
  }
  const colH = [0, 0];
  for (const { id, full } of laidOut) {
    const h = heightOf(id);
    if (full) {
      const y = Math.max(colH[0], colH[1]);
      pos[id] = { x: 0, y, width: colWidth * 2 + DASH_GAP };
      const bottom = y + h + DASH_GAP;
      colH[0] = bottom;
      colH[1] = bottom;
      continue;
    }
    const col = colH[0] <= colH[1] ? 0 : 1;
    pos[id] = { x: col === 0 ? 0 : colWidth + DASH_GAP, y: colH[col], width: colWidth };
    colH[col] += h + DASH_GAP;
  }
  return { pos, height: Math.max(0, Math.max(colH[0], colH[1]) - DASH_GAP) };
}

/** Attach each id's `full` flag, read from `registry` at whatever size
 *  `sizeOf` currently reports for it. */
export function withFullFlags(
  ids: string[],
  sizeOf: (id: string) => string,
  registry: WidgetRegistry,
): { id: string; full: boolean }[] {
  return ids.map((id) => ({
    id,
    full: !!registry.byId[id]?.sizes.find((s) => s.id === sizeOf(id))?.full,
  }));
}

/**
 * Where a dragged widget should land among the other SHOWN widgets, for a
 * pointer at board-relative (x, y). Tries every position it could slot into,
 * packs each candidate with the same `packMasonry` the board renders with,
 * and keeps whichever puts the widget's OWN packed position closest to the
 * pointer.
 *
 * Issue #302: this replaces a hit test that asked "which card's CENTRE is
 * nearest the pointer, swap the dragged widget in next to it." That reads a
 * card's CURRENT position and ignores what dropping there would actually do,
 * and `packMasonry` decides a card's column from the accumulated height of
 * everything before it in the order, not from array parity, so swapping next
 * to a card near the pointer could still repack the dragged widget into the
 * wrong column once that swap reflowed every card after it.
 */
export function bestDropIndex(
  others: string[],
  id: string,
  sizeOf: (widgetId: string) => string,
  heightOf: (widgetId: string) => number,
  colWidth: number,
  cols: number,
  x: number,
  y: number,
  registry: WidgetRegistry,
): number {
  let bestIndex = others.length;
  let bestDist = Infinity;
  for (let i = 0; i <= others.length; i++) {
    const candidate = [...others.slice(0, i), id, ...others.slice(i)];
    const { pos } = packMasonry(withFullFlags(candidate, sizeOf, registry), heightOf, colWidth, cols);
    const p = pos[id];
    if (!p) continue;
    const cx = p.x + p.width / 2;
    const cy = p.y + heightOf(id) / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) { bestDist = d; bestIndex = i; }
  }
  return bestIndex;
}

/** Replaces the SHOWN widgets in `fullOrder` with `newShown`, in that order,
 *  leaving every hidden widget exactly where it sat. Both lists hold the same
 *  shown ids, just reordered, so walking `fullOrder` and pulling the next
 *  shown id off `newShown` at every shown slot reproduces it with the hidden
 *  ones untouched. */
export function withShownReordered(fullOrder: string[], hidden: Set<string>, newShown: string[]): string[] {
  const queue = [...newShown];
  return fullOrder.map((wid) => (hidden.has(wid) ? wid : queue.shift()!));
}
