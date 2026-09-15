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
// Chosen for recognizability over completeness: the large retail/national
// banks, the brokerages already bundled for the Credit/Connections surfaces,
// and the two payment apps most often linked alongside a bank. Not an attempt
// at "top N by Plaid volume", which Juniper has no data source for.
export const COMMON_INSTITUTIONS: readonly string[] = [
  "Chase",
  "Bank of America",
  "Wells Fargo",
  "Capital One",
  "Citi",
  "American Express",
  "Discover",
  "U.S. Bank",
  "PNC",
  "Truist",
  "Charles Schwab",
  "Fidelity",
  "Vanguard",
  "SoFi",
  "Ally",
  "PayPal",
];
