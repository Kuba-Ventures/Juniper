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
// that gallery there is no per-category "select all" here, since with 16
// names total there is nothing a group-level select-all would meaningfully
// save over ticking a couple of tiles by hand, and it is exactly the kind of
// per-category state machine that made the old ~60-entry version heavy.
// Selection itself stays one flat set across every group.
export type InstitutionGalleryGroup = {
  label: string;
  institutions: readonly string[];
};

export const GALLERY_GROUPS: readonly InstitutionGalleryGroup[] = [
  {
    label: "Banking",
    institutions: ["Chase", "Bank of America", "Wells Fargo", "Citi", "U.S. Bank", "PNC", "Truist", "Ally"],
  },
  {
    label: "Credit cards",
    institutions: ["Capital One", "American Express", "Discover"],
  },
  {
    label: "Investing",
    institutions: ["Charles Schwab", "Fidelity", "Vanguard", "SoFi"],
  },
  {
    label: "Payments",
    institutions: ["PayPal"],
  },
];
