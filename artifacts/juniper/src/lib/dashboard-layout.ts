// How a member arranged a page built from widgets: which ones are on it, and
// in what order. Two boards read this module: the personal Overview
// (migration 0049, `user_profiles.dashboard_layout`) and the shared Overview
// (migration 0060, `user_profiles.shared_dashboard_layout`), each its own
// widget registry and its own stored column, never the same one, because the
// two registries' ids are not guaranteed to stay disjoint and a client bug
// applying one board's order to the other page must not be representable.
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
// Not simply "visible". Several widgets ship OFF: Cards and rewards, Recurring
// charges, and the four #290 added. All are summaries of a surface that
// already has its own page (or, on the shared board, of a section that would
// otherwise always be on), and #251's own rule is that a member who never
// touches this sees exactly what they saw before, so a new widget waits in
// the "Not on your Overview" shelf instead of being added to everybody's
// dashboard by a deploy. Reading absence as "the registry decides" is what
// lets a future widget ship either way and still reach every existing
// member's shelf.

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
 *  Pure data: the components are wired up in pages/app/overview.tsx and
 *  pages/app/shared/overview.tsx, the only things that render them. */
export interface WidgetMeta {
  id: string;
  title: string;
  /** The page that owns the full version. Every widget has one; several name
   *  the board's own page, the same convention net worth already set on the
   *  personal board. */
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

/** A board is a registry plus the lookup built from it. Two of these exist
 *  (`PERSONAL_REGISTRY`, `SHARED_REGISTRY`) and every function below takes
 *  one explicitly rather than reaching for a module-level default, so a
 *  caller cannot resolve a shared-board id against the personal registry (or
 *  the reverse) by forgetting an argument. */
export interface WidgetRegistry {
  widgets: WidgetMeta[];
  byId: Record<string, WidgetMeta>;
}

function createRegistry(widgets: WidgetMeta[]): WidgetRegistry {
  return { widgets, byId: Object.fromEntries(widgets.map((w) => [w.id, w])) };
}

/** The personal Overview's registry, in the order a member who has never
 *  arranged anything sees. The first seven are the page as it stood before
 *  #251, unchanged and in the same order, which is what makes the default a
 *  no-op. */
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
  {
    id: "recurring", title: "Recurring charges", home: "/app/transactions", homeLabel: "Transactions", defaultOff: true,
    sizes: [
      { id: "stat", label: "Stat" },
      { id: "list", label: "List" },
      { id: "upcoming", label: "Upcoming" },
      { id: "attention", label: "Needs a look" },
      { id: "wall", label: "Merchant wall" },
    ],
  },
  // Four more shelf widgets (issue #290): each a one-figure summary of a
  // surface that already has its own page, same rule #251 gave Cards and
  // Recurring charges. A single declared size, unlike those two: they have no
  // size picker yet, which is a later enhancement rather than something these
  // need on day one. See overview-widgets.tsx for why two of them need no
  // fetch of their own.
  {
    id: "levers", title: "Score levers", home: "/app/score", homeLabel: "Score", defaultOff: true,
    sizes: DEFAULT_SIZES,
  },
  {
    id: "benefits", title: "Benefits tracker", home: "/app/credit", homeLabel: "Credit", defaultOff: true,
    sizes: DEFAULT_SIZES,
  },
  {
    id: "connhealth", title: "Connection health", home: "/app/connections", homeLabel: "Connections", defaultOff: true,
    sizes: DEFAULT_SIZES,
  },
  {
    id: "together", title: "Together summary", home: "/app/shared", homeLabel: "Shared", defaultOff: true,
    sizes: DEFAULT_SIZES,
  },
];

export const PERSONAL_REGISTRY: WidgetRegistry = createRegistry(WIDGETS);

/** Backward-compatible alias: most of the personal Overview's own code still
 *  reaches for this directly (a shelf chip's title, a picker label). Equal to
 *  `PERSONAL_REGISTRY.byId`, never a second source of truth. */
export const WIDGET_BY_ID: Record<string, WidgetMeta> = PERSONAL_REGISTRY.byId;

/** The shared Overview's registry (issue #290: one partner may now arrange
 *  the shared page, for themselves). Five widgets, each a section the page
 *  already draws unconditionally today; none has a page of its own beyond
 *  this one, the same self-referential `home` net worth already uses on the
 *  personal board. Order and visibility only, matching the personal board's
 *  own scope: no resizing, no member-defined widgets. */
export const SHARED_WIDGETS: WidgetMeta[] = [
  {
    id: "together", title: "Together", home: "/app/shared", homeLabel: "this page",
    sizes: [{ id: "default", label: "Compact", full: true }],
  },
  {
    id: "jointaccounts", title: "Shared accounts", home: "/app/shared", homeLabel: "this page",
    sizes: DEFAULT_SIZES,
  },
  {
    id: "youraccounts", title: "Your shared accounts", home: "/app/shared", homeLabel: "this page",
    sizes: DEFAULT_SIZES,
  },
  {
    id: "theiraccounts", title: "Their shared accounts", home: "/app/shared", homeLabel: "this page",
    sizes: DEFAULT_SIZES,
  },
  {
    id: "goals", title: "Shared goals", home: "/app/shared/goals", homeLabel: "Shared goals",
    sizes: DEFAULT_SIZES,
  },
];

export const SHARED_REGISTRY: WidgetRegistry = createRegistry(SHARED_WIDGETS);

/** The stored shape. `v` is here so a later change of meaning can be told from
 *  this one rather than guessed at from the keys present. `sizes` is optional
 *  rather than a `v: 2`, because adding it does not change what `order` or
 *  `hidden` mean: a layout saved before #259 is simply one with no entries in
 *  it, which is exactly "every widget at its default size". Migration 0050.
 *  The shared board (migration 0060) reuses this exact shape and every
 *  function below, against its own registry and its own stored column. */
export interface DashboardLayout {
  v: 1;
  order: string[];
  hidden: string[];
  /** Widget id -> the size the member chose, holding only entries that DIFFER
   *  from the widget's own default. See `sizeFor` for how absence resolves. */
  sizes: Record<string, string>;
}

export const LAYOUT_VERSION = 1 as const;

/** Narrow a stored value against `registry`, or null for "has not arranged
 *  anything".
 *
 *  The owning migration's CHECK already refuses anything that is not this
 *  shape, but a client should not trust a constraint in a database it cannot
 *  see: this column is the one on that table written by a client, and a row
 *  written by an older build, or by anything other than this app, must not
 *  reach the renderer as a layout. Unknown ids are dropped here rather than
 *  filtered at every call site.
 *
 *  `sizes` is narrowed to known widget ids with a string value ONLY here; it
 *  is deliberately NOT checked against that widget's own declared sizes,
 *  which is `sizeFor`'s job, the same split `isShown` already makes between
 *  "is this id real" (here) and "what does the registry say about it"
 *  (there). */
export function asDashboardLayout(v: unknown, registry: WidgetRegistry): DashboardLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.order) || !Array.isArray(o.hidden)) return null;
  const known = (x: unknown): x is string => typeof x === "string" && x in registry.byId;
  const rawSizes = o.sizes && typeof o.sizes === "object" && !Array.isArray(o.sizes)
    ? (o.sizes as Record<string, unknown>)
    : {};
  const sizes: Record<string, string> = {};
  for (const [id, size] of Object.entries(rawSizes)) {
    if (id in registry.byId && typeof size === "string") sizes[id] = size;
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
export function sizeFor(layout: DashboardLayout | null, id: string, registry: WidgetRegistry): string {
  const declared = registry.byId[id]?.sizes ?? DEFAULT_SIZES;
  const chosen = layout?.sizes[id];
  if (chosen && declared.some((s) => s.id === chosen)) return chosen;
  return declared[0].id;
}

/** Whether a size spans both columns, looked up by id rather than assumed,
 *  since two of a widget's own sizes can share a column width. */
export function sizeIsFull(id: string, sizeId: string, registry: WidgetRegistry): boolean {
  return !!registry.byId[id]?.sizes.find((s) => s.id === sizeId)?.full;
}

/** How a size reads in the picker, in the widget's own words. */
export function sizeLabel(id: string, sizeId: string, registry: WidgetRegistry): string {
  return registry.byId[id]?.sizes.find((s) => s.id === sizeId)?.label ?? sizeId;
}

/**
 * The full widget order for a member, stored first and registry after.
 *
 * A widget the stored order does not mention keeps its registry position rather
 * than being appended, so a card added in the middle of the default order lands
 * in the middle for a member who arranged the ones around it, which is where
 * they would look for it.
 */
export function resolveOrder(layout: DashboardLayout | null, registry: WidgetRegistry): string[] {
  const stored = layout?.order.filter((id) => id in registry.byId) ?? [];
  if (!stored.length) return registry.widgets.map((w) => w.id);
  const out = [...stored];
  registry.widgets.forEach((w, i) => {
    if (!out.includes(w.id)) out.splice(Math.min(i, out.length), 0, w.id);
  });
  return out;
}

/** Whether a widget is on the member's page. Absent from the stored layout
 *  means the registry decides, which is how a widget ships off. */
export function isShown(layout: DashboardLayout | null, id: string, registry: WidgetRegistry): boolean {
  if (layout?.hidden.includes(id)) return false;
  if (layout?.order.includes(id)) return true;
  return !registry.byId[id]?.defaultOff;
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
  registry: WidgetRegistry,
): DashboardLayout {
  const sizes: Record<string, string> = {};
  for (const id of order) {
    if (!(id in registry.byId)) continue;
    const chosen = size(id);
    if (chosen !== registry.byId[id].sizes[0].id) sizes[id] = chosen;
  }
  return {
    v: LAYOUT_VERSION,
    order: order.filter((id) => id in registry.byId),
    hidden: order.filter((id) => id in registry.byId && !shown(id)),
    sizes,
  };
}

/** Move `id` so it sits where `target` is, keeping every other widget's relative
 *  order. Returns the same array when the move is a no-op, so a caller can skip
 *  a render on every pointer move that lands on the widget already there.
 *  Registry-free: it only ever rearranges strings it is handed. */
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
