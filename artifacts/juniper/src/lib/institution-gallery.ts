// The curated "common institutions" gallery on the connect step (issue #418).
// Plain display names only, deliberately never a hardcoded institution_id: the
// picker resolves each selected name through Plaid's own live search at
// connect time (see resolveGalleryPick in institution-picker.tsx), the same
// call a typed search already makes. That is what lets this list stay small
// and boring rather than becoming the ~60-entry catalog with its own
// maintenance debt that #144/2026-08-26 deleted, since an institution_id here
// would need to be right for both Sandbox and Production and would go stale
// as Plaid's own ids change.
//
// Each name resolves to bundled brand art through the existing
// localBrandLogo() chain in institution-brand.ts with no changes there: every
// name below already slugifies (or is aliased) to a key in mock-logos.ts.
//
// Grouped the way the old, deleted gallery was (banking / credit cards /
// investing / payment apps), on request, purely as section labels: unlike
// that gallery there is no per-category "select all" here, since with a
// couple dozen names total there is nothing a group-level select-all would
// meaningfully save over ticking a couple of tiles by hand, and it is exactly
// the kind of per-category state machine that made the old ~60-entry version
// heavy. Selection itself stays one flat set across every group.
//
// Each group also carries `manualCategory`, the `ManualCategory` (see
// lib/manual-accounts.ts) its own quick-add tile pre-selects: someone whose
// bank isn't in the Banking row can jump straight to a manual entry already
// scoped to "Banking" rather than landing on the form's generic default and
// having to change it. Payments maps to "cash" rather than "banking", since a
// Venmo or Cash App balance behaves like cash on hand, not a bank account.
import type { ManualCategory } from "@/lib/manual-accounts";

export type InstitutionGalleryGroup = {
  label: string;
  manualCategory: ManualCategory;
  institutions: readonly string[];
};

export const GALLERY_GROUPS: readonly InstitutionGalleryGroup[] = [
  {
    label: "Banking",
    manualCategory: "banking",
    institutions: ["Chase", "Bank of America", "Wells Fargo", "Citi", "U.S. Bank", "PNC", "Truist", "Ally"],
  },
  {
    label: "Credit cards",
    manualCategory: "credit",
    // Capital One, American Express, and Discover are the big issuers whose
    // whole identity is cards, distinct from the Banking row above, whose
    // members (Chase, Citi, Bank of America, Wells Fargo, U.S. Bank) also
    // issue plenty of cards but already have their own tile there. Synchrony
    // (the largest private-label/store-card issuer, e.g. most retail store
    // cards) and Barclays (issues Uber, JetBlue, and other co-brand cards) are
    // the next two big-enough-to-name issuers, added on request. Neither has
    // bundled brand art (see institution-brand.ts's LOGOS/BRAND_ALIASES), so
    // their tiles draw the generic building glyph rather than a real mark
    // until bundled art is added for them; still fully functional, since the
    // real logo Plaid holds is what shows everywhere else once connected.
    institutions: ["Capital One", "American Express", "Discover", "Synchrony Bank", "Barclays"],
  },
  {
    label: "Investing",
    manualCategory: "investing",
    // Robinhood, E*TRADE, and Merrill Edge added on request: all three
    // already have bundled brand art (see BRAND_ALIASES for the Merrill Edge
    // -> "merrill" alias, since it doesn't slugify to the bundled asset's key
    // on its own), so they draw a real mark like the rest of this row.
    institutions: ["Charles Schwab", "Fidelity", "Vanguard", "SoFi", "Robinhood", "E*TRADE", "Merrill Edge"],
  },
  {
    label: "Payments",
    manualCategory: "cash",
    institutions: ["PayPal", "Venmo", "Cash App"],
  },
];
