// How the member arranged their Overview: which widgets are on it, and in what
// order. Migration 0049 stores it on `user_profiles.dashboard_layout`.
//
// ── WHY THE HIDDEN SET AND NOT THE VISIBLE LIST ────────────────────────────
//
// A stored "list of widgets to draw" fails silently the first time a widget is
// added to the app: it is absent from every layout saved before it existed, so
// every existing member would have it switched off, with nothing on screen to
// say a new card exists. The people it would hide it from are exactly the ones
// who have used Juniper long enough to have arranged it.
//
// So what is stored is an ORDER and a HIDDEN SET, and a widget in neither is
// resolved against the registry below rather than against the stored value.
//
// ── WHY "ABSENT" MEANS "WHATEVER THE REGISTRY SAYS" ────────────────────────
//
// Not simply "visible". Two of the widgets here ship OFF: Cards and rewards, and
// Recurring charges. Both are summaries of surfaces that already have their own
// page, and #251's own rule is that a member who never touches this sees exactly
// what they see today, so they wait in the "Not on your Overview" shelf instead
// of being added to everybody's dashboard by a deploy. Reading absence as "the
// registry decides" is what lets a future widget ship either way and still
// reach every existing member's shelf.

/** One size a widget can honestly draw at: a stable id (what gets stored and
 *  compared, never shown), a label for the picker (in the member's words),
 *  and whether it spans both columns. `full` is a property of the SIZE and
 *  not of the widget, because two sizes can share a column width and still be
 *  genuinely different cards: the Score's strip and its ring are both
 *  half-width, and neither is the other one scaled. See issue #259. */
export interface WidgetSizeOption {
  id: string;
  label: string;
  /** Spans both columns. Absent or false means a half-width column. */
  full?: boolean;
}

/** A widget's identity, its title, and where the unabridged version lives.
 *  Pure data: the components are wired up in pages/app/overview.tsx, which is
 *  the only thing that renders them. */
export interface WidgetMeta {
  id: string;
  title: string;
  /** The page that owns the full version. Every widget has one, including net
   *  worth, whose home is the Overview itself. */
  home: string;
  /** How that page is named on screen, in the member's words. */
  homeLabel: string;
  /** The sizes this widget can honestly draw at, first entry is the default a
   *  member who has never touched sizing sees. A single entry means there is
   *  no choice to offer: the size picker only ever appears for a widget with
   *  more than one. */
  sizes: WidgetSizeOption[];
  /** Ships off, waiting in the shelf. See the header. */
  defaultOff?: boolean;
}

/** The one size every widget without a real choice yet declares: a single
 *  entry, so `sizeFor` and the picker both treat "not built yet" the same as
 *  "genuinely one shape", which is the honest state of most widgets today. */
const DEFAULT_SIZES: WidgetSizeOption[] = [{ id: "default", label: "Compact" }];

/** The registry, in the order a member who has never arranged anything sees.
 *  The first seven are the page as it stood before #251, unchanged and in the
 *  same order, which is what makes the default a no-op. */
export const WIDGETS: WidgetMeta[] = [
  {
    id: "score", title: "Juniper Score", home: "/app/score", homeLabel: "Score",
    sizes: [
      { id: "strip", label: "Strip" },
      { id: "ring", label: "Ring" },
      { id: "full", label: "Full breakdown", full: true },
    ],
  },
  {
    id: "networth", title: "Net worth and cashflow", home: "/app", homeLabel: "this page",
    sizes: [
      { id: "chart", label: "Chart" },
      { id: "compact", label: "Compact" },
      { id: "full", label: "Full width", full: true },
    ],
  },
  {
    id: "plans", title: "Your plans", home: "/app/plans", homeLabel: "Plans",
    sizes: [
      { id: "list", label: "List" },
      { id: "compact", label: "Compact" },
      { id: "gallery", label: "Gallery" },
      { id: "grid", label: "Grid", full: true },
    ],
  },
  {
    id: "spend", title: "Where it went", home: "/app/transactions", homeLabel: "Transactions",
    sizes: [
      { id: "donut", label: "Donut" },
      { id: "list", label: "List" },
      { id: "compact", label: "Compact" },
    ],
  },
  {
    id: "budgets", title: "Budgets", home: "/app/transactions?panel=budgets", homeLabel: "Transactions",
    sizes: [
      { id: "bars", label: "Bars" },
      { id: "rings", label: "Rings" },
      { id: "attention", label: "Attention list" },
      { id: "heatmap", label: "Heatmap tiles" },
      { id: "gauge", label: "Total gauge" },
      { id: "spotlight", label: "Spotlight" },
    ],
  },
  {
    id: "txns", title: "Recent transactions", home: "/app/transactions", homeLabel: "Transactions",
    sizes: [
      { id: "list", label: "List" },
      { id: "compact", label: "Compact" },
      { id: "grouped", label: "Grouped by category" },
      { id: "timeline", label: "Timeline" },
      { id: "summary", label: "Summary" },
      { id: "table", label: "Table", full: true },
    ],
  },
  {
    id: "accounts", title: "Accounts", home: "/app/connections", homeLabel: "Connections",
    sizes: [
      { id: "list", label: "List" },
      { id: "compact", label: "Compact" },
      { id: "tiles", label: "Tiles" },
      { id: "net", label: "Net by type" },
      { id: "institution", label: "By institution" },
      { id: "table", label: "Table", full: true },
    ],
  },
  {
    id: "cards", title: "Cards and rewards", home: "/app/credit", homeLabel: "Credit", defaultOff: true,
    sizes: [
      { id: "stat", label: "Stat" },
      { id: "holder", label: "Card holder" },
      { id: "figures", label: "Limits & balances" },
      { id: "bars", label: "Limits & balances (bars)" },
      { id: "guide", label: "Rewards guide" },
    ],
  },
  { id: "recurring", title: "Recurring charges", home: "/app/transactions", homeLabel: "Transactions", sizes: DEFAULT_SIZES, defaultOff: true },
];

export const WIDGET_BY_ID: Record<string, WidgetMeta> =
  Object.fromEntries(WIDGETS.map((w) => [w.id, w]));

/** The stored shape. `v` is here so a later change of meaning can be told from
 *  this one rather than guessed at from the keys present. `sizes` is optional
 *  rather than a `v: 2`, because adding it does not change what `order` or
 *  `hidden` mean: a layout saved before #259 is simply one with no entries in
 *  it, which is exactly "every widget at its default size". Migration 0050. */
export interface DashboardLayout {
  v: 1;
  order: string[];
  hidden: string[];
  /** Widget id -> the size the member chose, holding only entries that DIFFER
   *  from the widget's own default. See `sizeFor` for how absence resolves. */
  sizes: Record<string, string>;
}

export const LAYOUT_VERSION = 1 as const;

/** Narrow a stored value, or null for "has not arranged anything".
 *
 *  Migration 0049's CHECK already refuses anything that is not this shape, but a
 *  client should not trust a constraint in a database it cannot see: this column
 *  is the one on that table written by a client, and a row written by an older
 *  build, or by anything other than this app, must not reach the renderer as a
 *  layout. Unknown ids are dropped here rather than filtered at every call site.
 *
 *  `sizes` is narrowed to known widget ids with a string value ONLY here; it is
 *  deliberately NOT checked against that widget's own declared sizes, which is
 *  `sizeFor`'s job, the same split `isShown` already makes between "is this id
 *  real" (here) and "what does the registry say about it" (there). */
export function asDashboardLayout(v: unknown): DashboardLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.order) || !Array.isArray(o.hidden)) return null;
  const known = (x: unknown): x is string => typeof x === "string" && x in WIDGET_BY_ID;
  const rawSizes = o.sizes && typeof o.sizes === "object" && !Array.isArray(o.sizes)
    ? (o.sizes as Record<string, unknown>)
    : {};
  const sizes: Record<string, string> = {};
  for (const [id, size] of Object.entries(rawSizes)) {
    if (id in WIDGET_BY_ID && typeof size === "string") sizes[id] = size;
  }
  return {
    v: LAYOUT_VERSION,
    order: [...new Set(o.order.filter(known))],
    hidden: [...new Set(o.hidden.filter(known))],
    sizes,
  };
}

/** The size id a widget draws at: the member's own choice if they made one AND
 *  it is still one of that widget's declared sizes (a build that removed a
 *  size must not honor a stale choice for it), otherwise the widget's own
 *  default, which is its first declared size. */
export function sizeFor(layout: DashboardLayout | null, id: string): string {
  const declared = WIDGET_BY_ID[id]?.sizes ?? DEFAULT_SIZES;
  const chosen = layout?.sizes[id];
  if (chosen && declared.some((s) => s.id === chosen)) return chosen;
  return declared[0].id;
}

/** Whether a size spans both columns, looked up by id rather than assumed,
 *  since two of a widget's own sizes can share a column width. */
export function sizeIsFull(id: string, sizeId: string): boolean {
  return !!WIDGET_BY_ID[id]?.sizes.find((s) => s.id === sizeId)?.full;
}

/** How a size reads in the picker, in the widget's own words. */
export function sizeLabel(id: string, sizeId: string): string {
  return WIDGET_BY_ID[id]?.sizes.find((s) => s.id === sizeId)?.label ?? sizeId;
}

/**
 * The full widget order for a member, stored first and registry after.
 *
 * A widget the stored order does not mention keeps its registry position rather
 * than being appended, so a card added in the middle of the default order lands
 * in the middle for a member who arranged the ones around it, which is where
 * they would look for it.
 */
export function resolveOrder(layout: DashboardLayout | null): string[] {
  const stored = layout?.order.filter((id) => id in WIDGET_BY_ID) ?? [];
  if (!stored.length) return WIDGETS.map((w) => w.id);
  const out = [...stored];
  WIDGETS.forEach((w, i) => {
    if (!out.includes(w.id)) out.splice(Math.min(i, out.length), 0, w.id);
  });
  return out;
}

/** Whether a widget is on the member's Overview. Absent from the stored layout
 *  means the registry decides, which is how a widget ships off. */
export function isShown(layout: DashboardLayout | null, id: string): boolean {
  if (layout?.hidden.includes(id)) return false;
  if (layout?.order.includes(id)) return true;
  return !WIDGET_BY_ID[id]?.defaultOff;
}

/** The hidden set as it must be STORED, which is not the same as the set the
 *  member has switched off: a widget that ships off and has never been touched
 *  belongs in it too, or turning one of its neighbours off would resolve it back
 *  on through `isShown`'s registry branch.
 *
 *  `size` is asked for every widget and stored only where it differs from that
 *  widget's own default, the same "default is a no-op" rule `hidden` follows
 *  for a widget that ships off untouched: a member who never opens the size
 *  picker writes nothing new, so a widget that later grows a different default
 *  size carries every member who never chose one along with it. */
export function layoutFrom(
  order: string[],
  shown: (id: string) => boolean,
  size: (id: string) => string,
): DashboardLayout {
  const sizes: Record<string, string> = {};
  for (const id of order) {
    if (!(id in WIDGET_BY_ID)) continue;
    const chosen = size(id);
    if (chosen !== WIDGET_BY_ID[id].sizes[0].id) sizes[id] = chosen;
  }
  return {
    v: LAYOUT_VERSION,
    order: order.filter((id) => id in WIDGET_BY_ID),
    hidden: order.filter((id) => id in WIDGET_BY_ID && !shown(id)),
    sizes,
  };
}

/** Move `id` so it sits where `target` is, keeping every other widget's relative
 *  order. Returns the same array when the move is a no-op, so a caller can skip
 *  a render on every pointer move that lands on the widget already there. */
export function withMoved(order: string[], id: string, target: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** One step earlier or later, which is the keyboard's version of a drag. */
export function withNudged(order: string[], id: string, delta: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  return withMoved(order, id, order[to]);
}
