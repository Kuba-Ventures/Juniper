// The one map from a spending category GROUP to a palette token.
//
// This is its own module, rather than a helper inside lib/finances.ts, because a
// chart only needs to know what color a category is, and reaching that through
// finances.ts dragged in the whole live-data seam: the Supabase client, the
// access-token reader, and the context provider. A pure lookup table has no
// business requiring an authenticated session to answer "what color is Housing".
import type { SeriesKey } from "@/lib/mock-data";

const GROUP_COLOR: Record<string, SeriesKey> = {
  "Housing": "--jnpr-c1",            // green
  "Groceries & dining": "--jnpr-c2", // gold
  "Transportation": "--jnpr-c3",     // blue
  "Debt payments": "--jnpr-ink-2",   // sage
  "Shopping": "--jnpr-c4",           // terracotta
  "Fun & travel": "--jnpr-accent",   // pine
  "Utilities & bills": "--jnpr-c5",  // violet
  "Kids & health": "--jnpr-c6",      // olive
  "Everything else": "--jnpr-c7",    // grey
  "Income": "--jnpr-good",
  // Muted on purpose: a transfer or a card payment is not spending, and it
  // should not look like a category competing for the member's attention.
  "Transfers & payments": "--jnpr-ink-3",
};

// `group` is the server's answer and is preferred; `label` is the fallback for a
// spending row (whose label IS its group) or a stale payload from before the
// server sent groups.
export const categoryColor = (label: string, group?: string): SeriesKey =>
  GROUP_COLOR[group ?? ""] ?? GROUP_COLOR[label] ?? "--jnpr-c7";

// A group label is its own group, so the two arguments collapse.
export const colorOf = (group: string): SeriesKey => categoryColor(group, group);
