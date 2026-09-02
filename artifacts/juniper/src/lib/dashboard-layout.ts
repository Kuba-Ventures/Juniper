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

/** A widget's shape on the board. Not every widget can honestly draw at every
 *  size (a half-width Score is a ring; there is no half-width version of a
 *  factor rail), so a widget declares which sizes it HAS rather than being
 *  scaled. See issue #259. */
export type WidgetSize = "half" | "full";

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
   *  more than one. `"full"` spans both columns. */
  sizes: WidgetSize[];
  /** How each size reads in the member's words, for the size picker. Falls
   *  back to a plain default (see `sizeLabel`) for a widget that does not name
   *  its own, which is every widget with only one size, since it never shows a
   *  picker at all. */
  sizeLabels?: Partial<Record<WidgetSize, string>>;
  /** Ships off, waiting in the shelf. See the header. */
  defaultOff?: boolean;
}

/** The registry, in the order a member who has never arranged anything sees.
 *  The first seven are the page as it stood before #251, unchanged and in the
 *  same order, which is what makes the default a no-op. */
export const WIDGETS: WidgetMeta[] = [
  {
    id: "score", title: "Juniper Score", home: "/app/score", homeLabel: "Score",
    sizes: ["half", "full"], sizeLabels: { half: "Ring", full: "Full breakdown" },
  },
  { id: "networth", title: "Net worth and cashflow", home: "/app", homeLabel: "this page", sizes: ["half"] },
  { id: "plans", title: "Your plans", home: "/app/plans", homeLabel: "Plans", sizes: ["half"] },
  { id: "spend", title: "Where it went", home: "/app/transactions", homeLabel: "Transactions", sizes: ["half"] },
  { id: "budgets", title: "Budgets", home: "/app/transactions?panel=budgets", homeLabel: "Transactions", sizes: ["half"] },
  { id: "txns", title: "Recent transactions", home: "/app/transactions", homeLabel: "Transactions", sizes: ["half"] },
  { id: "accounts", title: "Accounts", home: "/app/connections", homeLabel: "Connections", sizes: ["half"] },
  { id: "cards", title: "Cards and rewards", home: "/app/credit", homeLabel: "Credit", sizes: ["half"], defaultOff: true },
  { id: "recurring", title: "Recurring charges", home: "/app/transactions", homeLabel: "Transactions", sizes: ["half"], defaultOff: true },
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

/** The size a widget draws at: the member's own choice if they made one AND it
 *  is still one of that widget's declared sizes (a build that removed a size
 *  must not honor a stale choice for it), otherwise the widget's own default,
 *  which is its first declared size. */
export function sizeFor(layout: DashboardLayout | null, id: string): WidgetSize {
  const declared = WIDGET_BY_ID[id]?.sizes ?? (["half"] as WidgetSize[]);
  const chosen = layout?.sizes[id];
  if (chosen && (declared as string[]).includes(chosen)) return chosen as WidgetSize;
  return declared[0];
}

const DEFAULT_SIZE_LABEL: Record<WidgetSize, string> = { half: "Compact", full: "Full width" };

/** How a size reads in the picker, in the widget's own words if it named one. */
export function sizeLabel(id: string, size: WidgetSize): string {
  return WIDGET_BY_ID[id]?.sizeLabels?.[size] ?? DEFAULT_SIZE_LABEL[size];
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
  size: (id: string) => WidgetSize,
): DashboardLayout {
  const sizes: Record<string, string> = {};
  for (const id of order) {
    if (!(id in WIDGET_BY_ID)) continue;
    const chosen = size(id);
    if (chosen !== WIDGET_BY_ID[id].sizes[0]) sizes[id] = chosen;
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
