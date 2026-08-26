# Credit provider options for the Credit tab

**Status:** research memo. No decision made, nothing built, no vendor contacted.
**Date:** 2026-08-26
**Question:** what would it take to put a real FICO 8, a real VantageScore 3.0, and the real bureau
factors on `/app/credit`, and is it worth doing now.
**Short answer:** about two weeks of code, about three months of contracting, and the design needs
revising first. Do it later, but spend one free afternoon on it this week.

## How to read the citations

Every factual claim has a URL. Claims are tagged so it is obvious how much weight each carries:

- **[VERIFIED]** read from a primary source: the statute, the CFR, an agency page, or the vendor's own
  technical documentation or schema.
- **[VENDOR CLAIM]** the vendor asserts it on a marketing page. Not independently confirmed, and section
  2 shows why that distinction earns its keep here.
- **[SECONDARY]** a law firm, trade press, or analyst summary. Directionally useful, not authority.
- **[INFERRED]** my reasoning from the above. Flagged because it is the part most likely to be wrong.
- **[UNVERIFIABLE]** or **[NOT COMPLETED]** I tried and could not confirm it, or did not get to it, and I
  say what to ask or check instead.

**All pricing is [UNVERIFIABLE].** Every provider researched here puts pricing behind "contact sales". I
have not estimated numbers. Section 6 lists the questions that produce them and the three published
figures that exist anywhere in this market.

## The seven things worth knowing

1. **Plaid cannot do this.** No Plaid product returns a bureau score or report. Liabilities returns card
   APRs, limits, and payment data, which is genuinely useful but is not bureau data. Plaid Check and
   LendScore are cash-flow underwriting products for lenders. A second vendor is required.
2. **The stated design is probably not permitted as drawn.** FICO's Open Access terms prohibit displaying
   other scores alongside a FICO score, and across 18 consumer products verified here, not one shows both
   a FICO score and a VantageScore. Separately, both federal and California law cap the adverse
   key-factor list at **four**, ordered by importance, not the five flat chips currently planned.
3. **Marketing pages lie about FICO, consistently.** Array's own datasheet shows VantageScore on the
   basic tier and never names a FICO version. Spinwheel markets FICO 8 and documents VantageScore only.
   Bloom's single documented FICO SKU is a **hard** pull, unusable for a self-view. Trust schemas and
   contracts, not product pages.
4. **The recommendation is VantageScore 3.0 first.** Its consumer disclosure is an enumerated permitted
   use in the base bureau agreement rather than a separately negotiated FICO permission, its trademark
   license is royalty-free, and bureau pricing fell to roughly $1 in late 2025. FICO 8 becomes a second
   phase. Equifax Consumer Engagement Suite is the recommended source because it publishes both models in
   one matrix, so the later phase does not mean changing vendors.
5. **The compliance load is real but tractable at this scale.** A soft pull shown only to the member who
   authorized it sits on the cleanest permissible purpose in the FCRA, there is an FTC staff comment
   directly foreclosing CRA status for display-back-to-subject, and Juniper is under the 5,000-consumer
   line that exempts it from four of the heaviest security artifacts. Roughly a week of writing plus a
   lawyer review.
6. **Two risks are larger than they look, and neither is on the standard checklist.** The couples sharing
   layer, because every protection in section 4 depends on the member being the only viewer and the
   plumbing to break that is already built. And a score simulator or "raise your score" feature, which in
   California can make Juniper a credit services organization requiring DOJ registration and a $100,000
   surety bond, and whose advance-payment prohibition is structurally incompatible with a subscription.
7. **Do it later, but do one free thing now.** The page is honest today, the fixed cost is wrong for a
   handful of users, and it is gated behind Stage 6 compliance work that has not happened. What is worth
   doing this week costs nothing: three self-serve sandboxes (Equifax, Spinwheel, Method) that turn the
   biggest unknowns here into facts before any money or lawyer time is spent.

One cheap unrelated win surfaced along the way: adding the Plaid `liabilities` entitlement would improve
the utilization figure the Credit page already shows, and give it real APRs and payment-due data. It is
independent of everything else in this memo.
## Contents

| Section | Question it answers | Read if |
| --- | --- | --- |
| [1. Can Plaid supply any of this?](#1-can-plaid-supply-any-of-this) | No, and precisely why | You want to be sure before paying a second vendor |
| [2. Provider options](#2-provider-options) | Who sells this, what they actually deliver, who will take the meeting | You are choosing a vendor |
| [3. FICO licensing](#3-fico-licensing-and-the-finding-that-breaks-the-spec) | Why FICO 8 is hard and why the side-by-side design may be barred | You care about having FICO specifically |
| [4. The compliance load](#4-the-compliance-load) | Permissible purpose, consent, security, disputes, state law, and the two sleeper risks | You want to know what you are signing up for |
| [5. Integration sketch](#5-integration-sketch-for-this-codebase) | Endpoints, migration, what must never be stored | You are about to build it |
| [6. Recommendation](#6-recommendation) | What to pick, what to ask, what it costs, and when | You want the answer |

If you read only two things: the seven points above, and section 6.

## 1. Can Plaid supply any of this?

No. Plaid has no consumer credit bureau score, and no bureau report, in any product.

Plaid's full product list covers Auth, Identity, Balance, Signal, Transfer, Investments Move,
Protect, Identity Verification, Cash Advance Index, Monitor, Transactions, Investments,
Liabilities, Enrich, Income, Underwriting, LendScore, Core Exchange, App Directory,
Permissions Manager, Layer, and Link ([plaid.com/products](https://plaid.com/products/)).
None of them returns a FICO or VantageScore.

Three products get mistaken for it:

**Liabilities** is the closest and is still not it. It covers credit cards, PayPal credit,
student loans, and mortgages, and for a card it returns balances, credit limit, last statement
balance and issue date, minimum payment, last and next payment dates, interest charged, balance
subject to APR, and an APR array typed as `purchase_apr`, `balance_transfer_apr`, `cash_apr`,
or `special` ([Plaid Liabilities docs](https://plaid.com/docs/liabilities/),
[API reference](https://plaid.com/docs/api/products/liabilities/)). Two caveats worth knowing
before assuming it fills gaps: it carries no transaction history for card accounts, and the
APR array is empty when the issuer does not report rates, which is common. So Liabilities would
buy Juniper real card APRs (which `credit.tsx` currently and correctly declines to display,
since `PLAID_PRODUCTS` is `transactions`), better payment-due data, and a more reliable credit
limit for the utilization figure. It buys zero bureau data.

**Plaid Check** is a genuine consumer reporting agency, a Plaid subsidiary, but it reports on
bank transaction data, not credit files. Its products are a Base Report (up to 24 months of
consumer-permissioned bank data), Income Insights, and LendScore
([Plaid Check docs](https://plaid.com/docs/check/), [product page](https://plaid.com/check/consumer-report/)).

**LendScore** is a score from 1 to 99 predicting 12-month default likelihood, built from cash
flow and Plaid network signals, delivered with adverse-action reason codes
([Plaid blog](https://plaid.com/blog/plaid-lendscore-credit-risk-scoring/)). It is a lender
underwriting product, not a consumer self-view product. Plaid positions it as something lenders
use *alongside* FICO or VantageScore, not as a substitute for them.

That distinction matters more than it first looks. Plaid Check requires the caller to declare a
`consumer_report_permissible_purpose` on each request ([Plaid Check docs](https://plaid.com/docs/check/)),
and the permissible purposes it is built around are credit decisions. Adopting LendScore to fill
the hole on the Credit page would put Juniper in the posture of a company generating credit-risk
scores, which is a heavier compliance position than showing a consumer their own bureau score
(see section 4). It is the wrong tool for this page.

**Conclusion:** Plaid is not on the path to FICO 8 or VantageScore 3.0. A second vendor is
required. Adding the `liabilities` entitlement is a separate, much smaller, and genuinely useful
piece of work that improves the utilization figure the page already shows, and it is independent
of everything else in this memo.
## 2. Provider options

### The correction that matters most

Marketing pages and API schemas disagree, repeatedly, in the same direction. **Several providers
market FICO and document only VantageScore.** Any FICO claim taken from a marketing page should be
treated as unconfirmed until it appears in a schema or a contract.

| Provider | FICO 8 | VS 3.0 | Factors | Bureaus | Shape | Self-serve sandbox |
| --- | --- | --- | --- | --- | --- | --- |
| **Equifax Consumer Engagement Suite** | **Yes, published (1B)** | **Yes (1B and 3B)** | Yes | Equifax, plus 3B reports | REST API, you build the UI | **Yes**, mock data |
| **CRS Credit API** | Claimed, inconsistent across their own pages | Yes | Yes (widget shows top 4) | All three, merged | REST API plus iframe widget | **Yes, pre-contract, free** |
| **Bloom Credit** | In the schema, but only on a **hard-pull** SKU | Yes | Yes, `score_reasons` with narrative | Equifax, Experian, TransUnion in enum; only Equifax SKUs published | REST API only | No, contact required |
| **Spinwheel** | Disputed, see below | Yes | Yes, 50+ VS 3.0 codes | Equifax, TransUnion | REST API plus drop-in modules | **Yes**, instant keys |
| **Method Financial** | **No** | Yes, plus VS 4.0 | Yes, code plus description | Equifax, TransUnion | REST API plus Opal embedded UI | **Yes**, dashboard keys |
| **Experian Partner Solutions** | Likely, never versioned publicly | Yes | Yes, in Score Tracker | Experian 1B, or 3B | API, Embedded, or Hosted | No portal, no docs |
| **Array** | Agreement exists, **version never named** | Yes | Yes | All three | Embedded components plus API | No, rep-gated |

### Equifax Consumer Engagement Suite: the best published match

The single most useful primary document found in this research is Equifax's CES product sheet, which
publishes the full score matrix
([product sheet](https://assets.equifax.com/marketing/US/assets/consumer-engagment-suite-credit-apis-product-sheet.PDF)) [VERIFIED]:
VantageScore 3.0 at 300 to 850 available **1B and 3B**, VantageScore 4.0 1B, and **FICO Score 8**
1B, alongside FICO Bankcard 8, Auto 8, the 9 family, the 5 family, the 10 family, and FICO NG 2.

That delivers the founder's exact ask: FICO Score 8 on Equifax data plus VantageScore 3.0, on the
same consumer, from a named published source rather than a sales conversation.

The products, all [VERIFIED] from Equifax's developer portal:

- **Credit Scores and Credit Score Coach** returns "Payment Activity, Credit Utilization, Debt &
  Balances and Credit Activity" plus historical VantageScore 3.0 via a Flashback feature
  ([docs](https://developer.equifax.com/products/apiproducts/credit-scores-credit-score-coach)).
  Those four categories map directly onto the factor rows the Credit page needs.
- **Credit Reports** returns open accounts, length of credit history, average account age,
  debt-to-credit ratio, total credit limit, and available credit, single-bureau or side-by-side
  tri-bureau ([docs](https://developer.equifax.com/products/apiproducts/credit-reports)). And a line
  that matters enormously for section 5: "Credit reports are delivered directly to consumers, thus
  eliminating sensitive data storage challenges for partners."
- **Credit Report Monitoring** is a real alerts product: New Inquiry, Address Change, New Collection,
  New Account, New Bankruptcy and their change variants across bureaus, plus Equifax-only Score
  Monitoring, Credit Limit Monitoring, and Balance Monitoring
  ([docs](https://developer.equifax.com/products/apiproducts/credit-report-monitoring)). This covers
  the ROADMAP Stage 10 alerting item outright.

Integration is a REST API with "UI Integration: Easily integrate information into your custom user
interface", custom-brandable, with the app registered as **Type: B2B2C** [VERIFIED]. Equifax names
"Fintech companies" as a target segment for CES [VERIFIED].

**And the sandbox is self-serve:** "Anyone with an Equifax for Developers account can access our
public products in Sandbox" with mock responses "without constraints"
([Equifax FAQ](https://developer.equifax.com/help-support/faqs)) [VERIFIED]. Production requires
contractual entitlement, and pricing "varies depending on the product classification, region, volume
and usage model", which is to say undisclosed. One caution: CES products "temporarily require a
different process" from other Equifax APIs, which reads as more sales involvement, not less [INFERRED].

### CRS Credit API: most likely to actually close a deal at this size

Promoted from footnote to shortlist. CRS is a reseller that publishes the things everyone else hides.

- **They handle bureau vetting.** "We will complete the internal vetting process directly with all the
  bureaus on your behalf. You never have to contact any of the product or service suppliers directly"
  ([CRS](https://crscreditapi.com/bureau-integration/)) [VENDOR CLAIM].
- **Free sandbox before a contract exists.** "The sandbox is available before the contract is signed.
  That is the part that matters", with synthetic data mirroring production, identical endpoints, and
  "no separate fee for testing". They claim "Most teams go live in about two weeks, including FCRA
  onboarding" ([CRS](https://crscreditapi.com/crs-sandbox-evaluation-credit-data-api/)) [VERIFIED].
- **A published vetting checklist**, which nobody else provides: Proof of Business, Proof of Business
  Checking Account, Photo ID of the Signer, Proof of Business Phone Number, Letter of Intent, and a
  Sample of Consumer Authorization to Order Credit. For a B2C use case, one extra item:
  **Cybersecurity Insurance** ([CRS](https://crscreditapi.com/vetting-documents/)) [VERIFIED]. No site
  inspection, minimum company size, or home-office restriction is listed.
- A **Consumer Credit Widget**, an embeddable iframe showing a score, "top four score factors and
  score history trend", monthly refreshes and daily monitoring
  ([CRS](https://crscreditapi.com/consumer-credit-widget/)) [VERIFIED]. Note the widget is
  VantageScore only; FICO 8 would mean building the UI on the API.

The weak spot is consistency. One page claims "FICO versions 8, 9, 10, Auto, Classic, and mortgage
versions" ([dev guide](https://crscreditapi.com/developers-guide-crs-credit-api/)) [VENDOR CLAIM],
while their score-models page lists "FICO Score 2, 5, 9, 10 and more" and **does not include 8**
([CRS](https://crscreditapi.com/score-models/)) [VERIFIED inconsistency]. Get FICO 8 in writing.

### Bloom Credit: cleanest schema, and a FICO problem

Bloom has the best-documented data model of any candidate. The `ModelName` enum is exactly four
values, `FICO8`, `FICO9`, `VANTAGE3`, `VANTAGE4`
([Bloom](https://developers.bloomcredit.io/reference/modelname.md)) [VERIFIED]. `DataSource` is
Equifax, Experian, TransUnion [VERIFIED]. Every score object carries a `score_reasons` array with a
`narrative` field [VERIFIED]. Full and raw reports are available, including soft and hard inquiries,
public records, limits, balances, and payment history [VERIFIED].

They also give the cleanest answer to the question that decides whether Juniper needs its own bureau
contract: when Bloom acts as reseller, "clients credential through Bloom Credit directly" and
**"Bloom is the CRA and data processor of record"** ([Bloom FAQ](https://bloomcredit.io/faqs/)) [VERIFIED].

**But read the published SKU strings carefully.** The documented examples are
`equifax-bronze-soft-vantage-internet`, `equifax-silver-soft-vantage-internet`, `equifax-bronze-hard`,
`equifax-bronze-account-review`, and `equifax-gold-hard-fico`
([Bloom](https://developers.bloomcredit.io/docs/ordering-credit-data.md)) [VERIFIED]. Every documented
**soft**-pull SKU is vantage. The only documented **FICO** SKU is a **hard** pull on the gold tier.
A member checking their own score needs a soft pull. So either an undocumented soft FICO SKU exists,
or FICO on Bloom is unavailable for this use case [INFERRED]. **That is the first question to ask them,
and it is the kind of detail that only shows up by reading the docs rather than the marketing.**

Also note every published SKU is Equifax despite the three-bureau enum [VERIFIED], their Alerts
resource covers fraud and security flags rather than score changes [VERIFIED], and the sandbox is not
self-serve: "If you don't have credentials yet, contact us to get onboarded" [VERIFIED].

### Spinwheel: easiest to evaluate, FICO status disputed

Genuinely self-serve. Sign up with email or Google at `developer.spinwheel.io`, get sandbox keys
immediately, no contract and no sales call [VERIFIED]. Their VantageScore 3.0 factor table is the best
public factor documentation found, and it maps precisely onto the founder's five factors: utilization
(code 32), payment history (code 9), inquiries (code 85), age of credit (code 12), derogatory marks
(code 86), 50+ codes total ([Spinwheel](https://docs.spinwheel.io/docs/credit-score-factors.md)) [VERIFIED].
Weekly or monthly refresh subscriptions with webhooks, and a documented warning that subscriptions
"initiate billable events whenever a new credit report is fetched" [VERIFIED]. Monarch Money is a
live consumer-PFM reference customer [VERIFIED].

Their consent docs hand over the required wording, built to the FCRA test in section 4: "you are
providing 'written instructions' to Spinwheel Solutions, Inc. authorizing it to obtain your credit
profile from any consumer reporting agency", with the client responsible for capturing consent
([Spinwheel](https://docs.spinwheel.io/docs/user-consent.md)) [VERIFIED]. They became a consumer
reporting agency on 2026-03-09 [VERIFIED].

**On FICO, my two research passes disagreed and I am reporting that rather than picking a side.** Their
product page says "VantageScore 3.0, FICO 4, and FICO 8" [VERIFIED that the page says it]. One pass
found FICO enum values in the OpenAPI schema with a constraint that FICO requires TransUnion as
`sourceBureau` and must be paired with a credit report. A second, more systematic pass found the
Equifax report endpoint's only score enum is `"EquifaxVantageScore3.0"` and the multi-bureau endpoint
returns `VANTAGE_SCORE_3_0`, concluding no FICO enum appears in public docs [VERIFIED absence].
**Treat Spinwheel FICO 8 as unconfirmed and ask for the literal enum value.**

Also worth flagging: pulls work "with just a phone number and date of birth" [VERIFIED], which is
notably light identity proofing for credit data. Read section 4's identity subsection before relying on it.

### Method Financial: best developer experience, no FICO

Not on the original list and it belongs here. Self-serve dashboard keys, fully public docs, three
environments (Development fully mocked, Sandbox with live data, Production), YC S19
([Method docs](https://docs.methodfi.com/reference/environments)) [VERIFIED]. Scores are `vantage_3`
and `vantage_4` from Equifax or TransUnion, with **no FICO models at all** [VERIFIED]. Factors come
back as an array of objects with `code` and `description` [VERIFIED]. Monitoring is real: scores can
be "monitored via subscriptions (get notified automatically when the score changes)" with
`credit_score.create`, `.update`, and `.available` webhooks [VERIFIED]. Opal is their embedded UI.

If the decision lands on VantageScore-first, Method is the cheapest possible way to have something
working, and the honest reason to prefer Spinwheel or Equifax over it is a future FICO path.

### Experian Partner Solutions and Array: the enterprise pair

**Experian Partner Solutions** has the most complete product catalog: Credit Report 1B, Tri-bureau 3B,
FICO Score, FICO Score Planner, VantageScore, Score Tracker with "a visual history of their monthly"
scores "along with score factors", Score Simulator, 1B and 3B monitoring, and alert products including
C.L.U.B. Alerts for Credit Limit, Utilization, and Balance
([Experian](https://www.experian.com/partner-solutions/products)) [VERIFIED]. Three named integration
options: Partner APIs (REST, OAuth2), Embedded Experiences (pre-built brand-customizable components
with "compliant, audit-ready workflows"), and Hosted Experiences [VERIFIED].

The FICO version is never stated on any Partner Solutions page [VERIFIED absence]. Experian Consumer
Services' own consumer products are FICO Score 8
([Experian](https://www.experiancreditcenter.com/fico-score-8/)) [VERIFIED], and Partner Solutions is
the B2B arm of that business, so it is probably FICO 8 [INFERRED]. No developer portal, no sandbox, no
docs without a sales conversation. Highest evaluation friction of anyone here.

Two Experian products that look relevant and are not: **Experian Connect** at $19.95 per
consumer-purchased report is built for landlord and small-business applicant screening, VantageScore
only, and prohibits reselling [VERIFIED]. **Experian Express**, launched 2026-04-07 as the first
bureau self-service credentialing platform, is lender-facing and delivers VantageScore 4.0, no FICO
([Experian](https://www.experianplc.com/newsroom/press-releases/2026/new-experian-express-streamlines-credit-reporting-to-empower-sma)) [VERIFIED].
Worth watching in case a consumer-display equivalent ships, because self-service bureau credentialing
is exactly what a company this size needs.

**Array** is channel-led and, on the evidence, VantageScore in practice. Their own "Array+ for FIs"
datasheet states the basic tier score is "Experian® VantageScore® 3.0" and the premium tier is listed
only as "VantageScore®/FICO options"
([datasheet](https://www2.array.com/hubfs/Array+%20for%20FIs.pdf)) [VERIFIED]. Their documented API
product code `tui1bReportScore` returns TransUnion VantageScore [VERIFIED], and a live credit-union
deployment states "The credit score provided is Your VantageScore Credit Score"
([AACU terms](https://www.aacu.com/content/docs/Terms-and-Conditions-for-Array.pdf)) [VERIFIED]. The
2023 FICO agreement is real but **the FICO version is never named in any public Array source**
[VERIFIED absence].

**One Array constraint that would be disqualifying if it applies.** Their docs state that TransUnion
information "may not be transmitted by Array to Array clients or third parties, nor may Array clients
access, view, share, process, or store TransUnion information" [VERIFIED]. If that holds for Juniper's
deployment, Juniper cannot build its own UI on the data at all: it renders Array's embedded component
and stores nothing. That is a design-level constraint, and it would make the entire section 5
integration sketch moot for this provider.

Array's docs are password-protected at every path [VERIFIED, I confirmed this directly], sandbox
access requires "your Array Support Representative" [VERIFIED], distribution is through Jack Henry,
Alkami, and CSI to banks and credit unions [VERIFIED], and pricing is "Pay Only For Usage" with no
figures [VERIFIED]. One real datasheet number: the premium tier runs a consumer-paid subscription with
"Revenue Share: 20% of a monthly fee, paid for by the consumer" [VERIFIED]. Poor fit for a solo founder.

### Ruled out, so no meetings are wasted

None of these sells a bureau score. All [VERIFIED].

**Plaid** (Plaid Check is bank-transaction based, see section 1; the FICO partnership is Cash Flow
UltraFICO, lender underwriting, not consumer-display FICO 8), **MX** (no credit products),
**Nova Credit** (international credit data and cash-flow scores), **MeasureOne** (no credit scoring),
**Finicity / Mastercard Open Banking** (verification products, no scores), **Prism Data** (CashScore is
deposit-based and "orthogonal to" traditional scores), **Credit Sesame B2B** (no B2B product page
exists), **iSoftpull** (reseller, but no FICO version ever named, no reason-code docs, lender-oriented),
**MicroBilt** (nothing published), **SavvyMoney** (TransUnion VantageScore 3.0 with real daily
monitoring, but no FICO and distribution is through digital banking platforms like Alkami, Fiserv, and
Q2, so a standalone app is a poor fit).

**FICO Score Open Access** is also not viable, for reasons covered in section 3.

### The site inspection, answered concretely

This is real, and it is less frightening than it sounds. Onsite physical inspection was mandated by
the bureaus in 2003 and expanded in 2005 to nearly all clients, formalizing the FCRA requirement that
a CRA "make a reasonable effort to verify the identity of a new end-user"
([Certiphi](https://www.certiphi.com/resource-center/compliance-services/onsite-physical-inspection-requirement/)) [VERIFIED].
TransUnion's own reseller requirements confirm it
([TransUnion](https://www.transunion.com/data-reporting/credit-data-resellers)) [VERIFIED].

What it actually involves: roughly **10 to 15 minutes**, by an independent third party, within days of
signing. The inspector photographs the building exterior, secure storage, workspace, and disposal
method, and asks about facility type, signage, equipment, and security. "The inspector will not review
documentation, actual files or other data" [VERIFIED].

Good news for a solo founder: **home offices are not automatically disqualified.** Experian requires
"lockable doors and separate business areas" for residential locations, permanent business signage is
a stated requirement, and **virtual inspections now exist** (remote inspector over video, geo-tagged
photos), approved by two of three bureaus with the third pending
([TrendSource](https://blog.trendsource.com/navigating-credit-bureau-onsite-inspection-requirements-a-universal-solution-for-compliance-officers/),
[virtual inspections](https://www.trendsource.com/compliance-consumer-reporting/virtual-inspections/)) [VERIFIED].

Whether going through an aggregator like CRS or Bloom shields Juniper from this entirely is not
publicly documented and should be asked directly [UNVERIFIABLE].

### Pricing: the only real numbers in the entire market

**Every provider in this memo keeps pricing behind contact sales.** [VERIFIED across all of them]
Three published figures exist anywhere, and none is a per-pull developer price for this use case:

| Source | Figure | Relevance |
| --- | --- | --- |
| [Soft Pull Solutions](https://www.softpullsolutions.com/pricing/) | "Begins at $100 per month (includes five reports)", all three CRAs, FICO and Vantage, "We do not require long-term contracts. Most customers operate on a month-to-month basis", plus "an initial inspection is required and paid upfront" and a small API fee | The only published month-to-month price point in the market, and confirmation that the inspection cost is real and borne by the client. Lender-oriented, so not a direct fit, but it is the best available anchor. [VERIFIED] |
| [Experian Connect](https://www.experian.com/connect/frequently-asked-questions) | $19.95 per consumer-purchased report | Wrong product, but a real bureau-adjacent consumer price. [VERIFIED] |
| [Array datasheet](https://www2.array.com/hubfs/Array+%20for%20FIs.pdf) | 20% revenue share on a consumer-paid monthly fee | A channel economic model, not a developer price. [VERIFIED] |

Secondhand per-report ranges circulating in third-party blogs (roughly $2.90 to $3.99 for Equifax via
resellers, $1 to $10 for Experian) are **[UNVERIFIED]** and should not be planned against.

One genuinely free option worth an application: the **Fintech Sandbox Data Access Residency** gives
early-stage startups free premium data for up to 6 months per partner, with rolling applications and
decisions in 1 to 2 weeks. **Equifax is a named data partner**, which is the bureau holding the FICO 8
in the CES matrix above. Bloom Credit is an alum
([Fintech Sandbox](https://www.fintechsandbox.org/data-access-residency/)) [VERIFIED].
## 3. FICO licensing, and the finding that breaks the spec

Two conclusions here, and the second one is the most important thing in this memo.

1. FICO 8 for a non-lender is obtainable, but only through one or two specific channels, and not via
   any program Juniper can apply to.
2. **Displaying FICO 8 and VantageScore 3.0 side by side, which is the stated design, is probably
   contractually prohibited.**

### How the chain works

FICO does not sell most scores. It licenses the algorithm to the bureaus, which compute and sell.
From FICO's FY2025 10-K [VERIFIED]:

> "Our proprietary analytic algorithms are applied to credit data collected and maintained by the
> three U.S. national consumer reporting agencies ... Users of our scores generally pay the consumer
> reporting agencies a fee for each individual score generated by our algorithms, and the consumer
> reporting agencies pay an associated fee to us. ... in most cases, we do not sell our scores
> directly to lenders or other end-users."

That dependency is mutual and large: agreements with the three bureaus were 51% of FICO's total
revenue in FY2025 [VERIFIED]. The model itself is protected as a trade secret, not a patent.

On consumer distribution specifically, the 10-K names its channels [VERIFIED]:

> "These Scores are distributed directly by us through our myFICO.com subscription offering and
> indirectly through our licensed distribution partners, including Experian and certain lenders
> through the FICO® Score Open Access Program."

Three channels: myFICO, **Experian**, and Open Access lenders. No intermediary is named.

### The layer everyone misses

Displaying a FICO score to a consumer needs three stacked permissions, and a normal bureau contract
gives you only the first two:

1. FCRA permissible purpose to pull the report, `1681b(a)(2)`, written instructions of the consumer.
2. A FICO sublicense flowed down through the bureau's End User Agreement. This is real but **narrow,
   and it is an internal-use license.**
3. **Separate written FICO permission to show the score to the consumer.**

The evidence for layer 3 is a bureau reseller's public flow-down exhibits, which reproduce each
bureau's FICO terms verbatim ([CoreLogic Credco linked exhibits, June 2023](https://www.credco.com/legaldocuments/LinkedExhibits.pdf)) [VERIFIED].
The Equifax terms, Exhibit 5-A section 1(B) and (C):

> "Fair Isaac grants to Client ... a personal, non-exclusive, non-transferable, limited license to
> use, **internally**, the FICO Scores solely for the particular purpose set forth in Section 1 ..."
>
> "Client shall not disclose a FICO Score to the consumer to which it pertains unless such disclosure
> is **(i) approved in writing by Fair Isaac** or (ii) required by law or is in connection with an
> adverse action ... and then only when accompanied by the corresponding reason codes."

The same restriction appears in the TransUnion and Experian flow-downs, and the TransUnion version
omits the Fair-Isaac-approval option entirely. Equifax's enumerated permissible-purpose menu in that
exhibit covers review of a report, portfolio review of the client's own accounts, investor
valuation, prescreen, and insurance underwriting. **Consumer-permissioned display is not on the
list.** [VERIFIED]

So: a bureau contract alone does not let you show a member their FICO score. You also need FICO's
written blessing, which in practice arrives as either an Open Access agreement or a channel partner
whose own FICO agreement already carries display rights.

There is one genuine direct-license route, and it excludes Juniper: FICO's Mortgage Direct License
Program, which FICO's own FAQ confirms is "currently only available for FICO® Scores for use in
mortgage" ([ficoscore.com/mortgagedirectlicense](https://www.ficoscore.com/mortgagedirectlicense)) [VERIFIED].
Useful only as a pricing reference point, since it is the rare place FICO publishes numbers:
Classic FICO at $4.95 per score plus a $33 funded-loan fee, FICO Score 10T at $0.99 per score plus
$65 [VERIFIED].

### FICO Score Open Access does not apply, twice over

Open Access is not a distribution license you can apply for. It is a **fee waiver plus display
permission** on scores the participant is *already buying for its own risk decisions*. FICO's own
release describes 300 million-plus accounts with free access to "the same FICO® Score used by
lenders to manage those accounts", and lists participants as banks, credit unions, card issuers,
mortgage servicers, auto lenders, and student lenders
([FICO via PR Newswire](https://www.prnewswire.com/news-releases/fico-score-open-access-program-hits-milestone-enabling-lenders-and-financial-counselors-to-offer-consumers-free-access-to-their-fico-scores-300766050.html)) [VERIFIED].
Every category is a lender. Juniper has no score it already pulled, because it makes no credit
decisions.

The counseling track is the only one with published criteria, and it requires the provider to be
"a 501(c)(3) non-profit organization or a government agency"
([ficoscore.com/cfc](https://www.ficoscore.com/cfc)) [VERIFIED]. Juniper is a for-profit company.
Fails outright.

The CFPB's involvement, for completeness: Director Cordray wrote to the largest card issuers in
February 2014 urging them to make scores freely available, calling it a best practice while
acknowledging it was not legally required
([CFPB](https://files.consumerfinance.gov/f/201402_cfpb_letters_credit-scores.pdf)) [VERIFIED].
That pressure was aimed at lenders and created no channel for non-lenders.

### The Open Access terms that break the design

FICO publishes a FAQ on the actual Program License Agreement
([FICO](https://www.ficoscore.com/credit-and-financial-counseling-program-license-agreement-faq)) [VERIFIED].
Section 2.2(d), verbatim:

> "we do not permit you to disclose any other scores to consumers as a part of this Program **or in
> connection with any other free credit program or similar program**."

**That is the founder's design, prohibited.** FICO 8 next to VantageScore 3.0 on one page is exactly
what 2.2(d) forbids. Other terms in the same agreement are also incompatible with a commercial
product: 2.2(b) forbids charging any fee attributable to score access, 2.2(c) forbids displaying
scores "in connection with any third party products, services, or content", and 8.1 requires FICO to
pre-approve customer-facing materials.

The market corroborates this strongly. Across 18 consumer products verified in this research, **not
one displays both a FICO score and a VantageScore.** [VERIFIED]

Scope caveat, stated honestly: that FAQ governs the counseling-track agreement specifically. The
lender-track PLA text is not public, so I cannot confirm 2.2(d) is worded identically there
[UNVERIFIABLE]. But 2.2(d) is written as a statement about the program generally, and the observed
market pattern matches. **Treat "can I show both at once" as a question to settle in writing before
any UI is designed.**

### Who actually shows what: the pattern is the finding

| Product | Score | Bureau | Lender? |
| --- | --- | --- | --- |
| myFICO | FICO 8 plus many others | varies by tier | No (FICO itself) |
| Experian app, freecreditscore.com | FICO Score 8 | Experian | No (bureau) |
| Bank of America | FICO Score 8 | TransUnion | Yes |
| Amex MyCredit Guide | FICO Score 8 | Experian | Yes |
| Capital One CreditWise | FICO Score 8 (migrated off VantageScore in 2025) | TransUnion | Yes |
| Citi | FICO Bankcard Score 8 | Equifax | Yes |
| Wells Fargo Credit Close-Up | FICO Score 9 | Experian | Yes |
| Chase Credit Journey | **VantageScore 3.0** | **Experian** | Yes |
| Credit Karma | VantageScore 3.0 | Equifax + TransUnion | No |
| Credit Sesame, WalletHub, NerdWallet | VantageScore 3.0 | TransUnion | No |
| Monarch Money (via Spinwheel) | VantageScore 3.0 | Equifax | No |
| Rocket Money | FICO Score 2 | Experian | No, but lender-affiliated |

All [VERIFIED] from each product's own disclosure pages, except Monarch [SECONDARY].

**Every FICO display in that table is a lender, a bureau, or FICO itself. Every independent
marketplace shows VantageScore 3.0.** FICO's own consumer page lists exactly two "Authorized FICO®
Score Retailers": myFICO and Experian
([ficoscore.com](https://www.ficoscore.com/where-get-fico-scores)) [VERIFIED].

Three corrections to claims that circulate widely, all verified against the products' own pages:
Chase Credit Journey is **Experian**, not TransUnion. CreditWise is now **FICO 8**, not VantageScore.
Discover Credit Scorecard **no longer exists** (creditscorecard.com now redirects to a Capital One
CreditWise page).

### VantageScore is a fundamentally easier contract

VantageScore is "an independently managed joint venture" of Equifax, Experian, and TransUnion
([vantagescore.com](https://vantagescore.com/about/about-vantagescore)) [VERIFIED]. The licensing
difference is not theoretical. Compare a public VantageScore flow-down
([Agility Credit](https://agilitycredit.com/legal/vantagescore-requirements)) [VERIFIED], which
permits disclosure:

> "... **(iii) when accompanied by the corresponding reason codes, to the consumer who is the subject
> of the VantageScore** ..."
>
> "Client obtains a limited, non-exclusive, non-transferable, **royalty free** license to use and
> display the Vantage Marks ..."

Consumer disclosure is an **enumerated permitted use in the base agreement**. No separate program, no
written pre-approval, no nonprofit test, no prohibition on adjacent products or other scores, and
the trademark license is royalty-free. VantageScore even publishes a public brand guide for consumer
display ([vantagescore.com](https://vantagescore.com/what-we-do/consumer-display)) [VERIFIED],
against FICO's confidential agreement.

Pricing moved in Juniper's favor recently: the bureaus cut VantageScore pricing to roughly $1 in
late 2025 in response to FICO's Direct License Program [SECONDARY].

On versions: VantageScore markets 4.0 as its most-used model, but **every consumer display verified
above uses 3.0**, and both use the 300 to 850 range [VERIFIED]. The founder's choice of 3.0 is the
right one for availability. Build for 3.0.

### Do the intermediaries pass FICO through?

| Provider | FICO evidence | Reading |
| --- | --- | --- |
| **Spinwheel** | Public OpenAPI schema enumerates `VANTAGE_SCORE_3_0`, `FICO_SCORE_4`, `FICO_SCORE_8`, with `sourceBureau` limited to Equifax and TransUnion. The spec states "FICO scores require TransUnion as the sourceBureau and must be requested alongside a creditReport." Live examples show `"modelName": "TransUnionFicoScore8"`. [VERIFIED] | FICO 8 is real in the API. But their factor glossary is VantageScore 3.0 only and multi-bureau examples default to VantageScore, so VantageScore is the paved path. [INFERRED] |
| **Array** | March 2023 direct FICO agreement. FICO's own VP/GM of Consumer Scores is quoted naming "fintechs and other brands" who "can offer their customers access to their FICO Score". Covers "data from any of the major credit bureaus". [VERIFIED via wire mirror] | Strongest FICO signal of any intermediary. But a live Array deployment at a credit union ships **VantageScore on Experian**, not FICO ([AACU terms](https://www.aacu.com/content/docs/Terms-and-Conditions-for-Array.pdf)) [VERIFIED], which suggests FICO is a premium SKU rather than the default. [INFERRED] |
| **Bloom Credit** | Public docs document both families, and SKU names confirm FICO is orderable: `equifax-gold-hard-fico` alongside `equifax-bronze-soft-vantage-internet`. The API returns "SKU not enabled" otherwise. [VERIFIED] | FICO is a contractual entitlement Bloom toggles per portfolio, not self-serve. [INFERRED] |
| **Equifax direct** | Equifax's own Consumer Engagement Suite score API is "Credit Scores & Credit Score Coach, **powered by VantageScore®**", aimed at "companies that provide consumers direct access to their personal credit reports and scores". **No FICO option.** [VERIFIED] | The bureau that co-owns VantageScore does not offer FICO in its consumer-display product. Telling. |
| **Experian Partner Solutions** | Names FICO explicitly: "Differentiate your program by providing FICO® Scores", and the Score Planner is documented as approximating impact on "your **FICO® Score 8**". VantageScore 3.0 offered in parallel. [VERIFIED] | The only channel FICO's 10-K and consumer site both endorse for non-lender display. Amex MyCredit Guide is the visible precedent. |

**None of the three intermediaries publishes any statement about FICO consumer-*display* rights**
[VERIFIED absence]. They all document the FCRA consumer-permissioned model, which is a different
question, the one covered in section 4.

One unresolved tension worth putting directly to Array: FICO's FY2025 10-K names its B2C channels as
Experian and Open Access lenders, and does not name Array, despite the 2023 agreement and the FICO
executive quote. Either Array's FICO product flows through the bureaus' pipe with FICO's written
display consent, or it is gated to Open-Access-eligible clients, or the 10-K language is simply not
exhaustive. Not resolvable from public sources [UNVERIFIABLE].

### Friction to expect regardless of route

- **Credentialing includes a premises inspection.** TransUnion's reseller requirements include
  "performing an on-site inspection of the applicant's business premises" where PII is sought
  ([TransUnion](https://www.transunion.com/data-reporting/credit-data-resellers)) [VERIFIED]. For a
  solo founder, this and volume minimums are the real gate, not the FICO license itself.
- **Bureau and version are dictated, not chosen.** Spinwheel's FICO 8 requires TransUnion. Experian
  Partner Solutions means Experian. "FICO 8 across three bureaus" is not a spec Juniper gets to set.
- **Trademark rules apply.** "FICO® Score" with the symbol on first reference, the registered-
  trademark notice, and no FICO logos without explicit written permission
  ([FICO trademark requirements](https://www.fico.com/en/trademark-requirements)) [VERIFIED].
- **A version-mismatch disclosure is expected.** Every verified FICO display carries one, along the
  lines of Experian's note that a lender may use a different FICO score or a different score entirely.
## 4. The compliance load

The section most likely to surprise, so it is the longest. The headline is good: a self-view credit
feature sits on the cleanest ground in the FCRA, there is an FTC staff interpretation directly on
point, and Juniper's current scale exempts it from the four heaviest security artifacts.

The three things that are genuinely worth attention are not the ones a founder expects. They are:
the consent wording (there is a specific FTC test, and most consent copy fails it), the score
labeling (this is the only live risk at today's scale, and it is a UDAAP risk, not an FCRA one), and
the couples sharing layer (specific to Juniper, covered last).

### Permissible purpose

`1681b(a)` is a closed list. The preamble reads "any consumer reporting agency may furnish a consumer
report under the following circumstances **and no other**", and `(a)(2)` is the entire basis for a
self-view product:

> "In accordance with the written instructions of the consumer to whom it relates."

([15 U.S.C. 1681b](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap41-subchapIII-sec1681b.htm)) [VERIFIED]

That is the whole subsection. No prescribed wording, no standalone-document rule, no expiry. All the
operational content comes from FTC staff interpretation, below.

The duty runs to Juniper as a *user*, not only to the bureau. `1681b(f)` bars using or obtaining a
report unless the purpose is authorized and "certified in accordance with section 1681e ... through a
general or specific certification" [VERIFIED], and `1681e(a)` obliges the bureau to make the user
certify the purposes and "certify that the information will be used for no other purpose"
([15 U.S.C. 1681e](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap41-subchapIII-sec1681e.htm)) [VERIFIED].
In practice that is a clause in the provider contract. It is also why "no other purpose" matters
later: mining the report to target offers is a second use the certification does not cover.

A secondary basis exists in `(a)(3)(F)(i)`, "legitimate business need ... in connection with a
business transaction that is initiated by the consumer", which FTC staff commentary reads as covering
"a transaction the consumer initiates from which he or she might expect to receive a benefit"
(comments 604(a)(3)(F)-1 through -3A) [VERIFIED]. Use `(a)(2)` as primary and keep `(F)(i)` as a
fallback argument.

**Soft pull is not a legal category.** The FCRA text nowhere uses "soft" or "hard". The distinction is
a bureau and scoring-model convention about whether an inquiry is visible to other lenders and
scored ([CFPB](https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-inquiry-en-1317/)) [VERIFIED].
The removed Credit page copy said "monitored monthly with a soft pull" as though that were the
permissive option. It buys nothing on permissible purpose, and it creates no extra duty either.

**One citation hygiene note.** The CFPB's 2022 advisory opinion on permissible purposes (87 FR 41243)
was **withdrawn on 2025-05-12** ([90 FR 20084](https://www.federalregister.gov/documents/full_text/text/2025/05/12/2025-08286.txt)) [VERIFIED],
and the Bureau said the withdrawn guidance "should not be enforced or otherwise relied upon by the
Bureau while this review is ongoing." The statute is unchanged and the FTC staff report was never
withdrawn. Any compliance memo or vendor checklist citing that advisory opinion is citing dead
authority. Cite `1681b(a)(2)`, `1681b(f)`, the FTC 40 Years report, and Zalenski instead.

### Consent: the specific test most consent copy fails

This is the highest-value item in the memo and it costs nothing but careful writing.

FTC staff comment 604(a)(2)-1, at page 43 of *40 Years of Experience with the Fair Credit Reporting
Act* (July 2011) ([FTC](https://www.ftc.gov/sites/default/files/documents/reports/40-years-experience-fair-credit-reporting-act-ftc-staff-report-summary-interpretations/110720fcrareport.pdf)) [VERIFIED]:

> "A consumer's written consent qualifies as an 'instruction' ... if it clearly authorizes the
> issuance of a consumer report on that consumer. For example, a consumer's clear and specific
> written statement that 'I authorize you to procure a consumer report on me' provides a permissible
> purpose under this section. However, the consumer's signature on a form that includes the statement
> 'I understand that where appropriate, credit bureau reports may be obtained' is **not** a
> sufficiently specific instruction ... This language is more in the nature of a notification that a
> consumer report might be procured, as opposed to a grant of permission to obtain the consumer report."

**The test is grant of permission versus notification.** Passive or hedged phrasing fails: "may be
obtained", "where appropriate", "from time to time we may check". Active first-person authorization
passes. Write "I authorize Juniper to obtain my consumer credit report and score from [bureau] to
display it to me in this app", not "I understand Juniper may access credit information."

Note that Spinwheel's required wording is built to this test: "you are providing 'written
instructions' to Spinwheel Solutions, Inc. authorizing it to obtain your credit profile from any
consumer reporting agency" ([Spinwheel](https://docs.spinwheel.io/docs/user-consent.md)) [VERIFIED].
It uses the statutory phrase and it grants rather than notifies. That is not an accident.

**Click-through works, and the reason is the record, not the checkbox.** FTC staff comment
604(a)(2)-2 and, better, the FTC staff opinion letter to Walter Zalenski, 2001-05-24
([FTC](https://www.ftc.gov/legal-library/browse/advisory-opinions/advisory-opinion-zalenski-05-24-01)) [VERIFIED],
which reversed an earlier contrary position:

> "a consumer's 'electronic signature' under the ESIGN Act is one acceptable method of providing
> 'written instructions' under Section 604(a)(2) of the FCRA. However, whether any other method, and
> whether ... an 'e-mail, mouse click "yes" or ... other electronic means,' clearly conveys the
> consumer's instructions, will depend on the specific facts."

And the condition: "that electronic authorization must be in a form that can be retained and
retrieved in perceivable form, as specified by Section 101(e) of the ESIGN Act." So it is an evidence
problem, not a UI problem. `consent_granted = true` is not a reproducible record.

**A technical point that saves work.** E-SIGN's elaborate consumer-consent-to-electronic-records
regime in section 101(c), with hardware disclosures and paper-copy rights, applies only where a law
requires information to be provided *to* a consumer in writing. Under `1681b(a)(2)` the writing flows
*from* the consumer *to* Juniper. So 101(c) is not triggered, and there is no need to build that
ceremony on FCRA grounds ([15 U.S.C. 7001](https://www.law.cornell.edu/uscode/text/15/7001)) [VERIFIED
on the statute, [INFERRED] on the application].

**Is a separate document required? No, but separate it anyway.** The FCRA does have a
solely-the-disclosure rule, and it is employment-specific: `1681b(b)(2)(A)(i)` requires the disclosure
be "in a document that consists solely of the disclosure" for employment purposes [VERIFIED].
Congress imposed that for employment and not for `(a)(2)`. The contrast is deliberate. But bundling
credit-pull consent into the general TOS is still wrong, for an independent reason: text buried in a
wall of terms reads as notification rather than a grant, which is exactly the failure mode comment
604(a)(2)-1 describes. Separation is what makes the authorizing language legible and the assent
provable. The SoFi FTC settlement is the cautionary tale on placement
([Davis Wright Tremaine](https://www.dwt.com/blogs/financial-services-law-advisor/2016/12/sofi-settlement-provides-lessons-for-lenders-marke)) [SECONDARY].

**What to retain per consent event:** user id, UTC timestamp, the exact verbatim text rendered, a
version and content hash of that text, the affirmative action captured, IP, user agent, and the
resulting pull. Version the text and never mutate a historical version in place.

**For how long.** No FCRA provision sets a period. Three bounds: `1681p` gives a plaintiff up to 5
years from the violation [VERIFIED]; `16 CFR 314.4(c)(6)` requires disposal of customer information
"no later than two years after the last date the information is used", with a carve-out where
retention is "necessary for business operations or for other legitimate business purposes" [VERIFIED];
and the provider contract will impose its own audit term. Defending an FCRA claim within the
limitations period is a legitimate business purpose, so the 2-year default does not force destruction
of consent evidence [INFERRED].

**This produces the single most important architecture decision in the memo: split the retention
schedules.** Consent records are the shield and should live about 6 years past the last pull under
them. The report payload is the toxic asset and should live for the display session or a short cache,
ideally not at all. Section 5 is built around that split.

### Identity verification: no statute mandates it, build it as if one did

There is no FCRA provision imposing knowledge-based authentication on a user like Juniper.
`1681h(a)(1)` imposes proper identification on the *bureau* for bureau-to-consumer disclosure, and
`1681e(a)` has the bureau verify *Juniper's* identity, not the member's [VERIFIED]. The Safeguards
Rule does bind Juniper: `314.4(c)(1)` requires access controls limiting users "in the case of
customers, to access their own information", and `314.4(c)(5)` requires MFA "for any individual
accessing any information system" ([16 CFR 314](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314)) [VERIFIED].

The reason to over-build here is the consequence structure. If identity proofing is weak, member A
can view member B's credit report, and that single event is simultaneously a pull without permissible
purpose as to B (`1681b(f)`, with `1681n` exposure to B *and* to the bureau), potentially a
false-pretenses violation under `1681q` (criminal, up to 2 years), a Safeguards access-control
failure, and a state breach notification event. **One weak flow detonates four regimes at once.** [INFERRED]

Worth knowing: the **Red Flags Rule (16 CFR 681.1) does not apply.** It defines "financial
institution" by reference to `1681a(t)`, which requires holding a transaction account, and "creditor"
by reference to `1681m(e)(4)`. Juniper is neither [VERIFIED on the definitions, [INFERRED] on
application]. The trap to avoid: Juniper *is* a "financial institution" for **Safeguards Rule**
purposes under a completely different and much broader definition at `314.2(h)`. Two rules, same
phrase, different definitions, opposite answers. Do not let anyone collapse them.

### Juniper does not become a CRA, and there is an FTC comment saying so

`1681a(f)` defines a CRA as one who assembles or evaluates consumer information "for the purpose of
furnishing consumer reports **to third parties**" [VERIFIED]. The limiter is "to third parties", and
FTC staff comment 603(f)-4F, page 30 of the 40 Years report, is directly on point [VERIFIED]:

> "**Provision of credit report to report subject.** A consumer report user does not become a CRA by
> regularly giving a copy of the report, or otherwise disclosing it, to the consumer who is the
> subject of the report (or the consumer's representative), because it is not disclosing the
> information to a 'third party.'"

Note "regularly", which forecloses the argument that doing it at scale changes the answer. Juniper is
a user of consumer reports, not a CRA, and cannot be a "reseller" under `1681a(u)` either, since that
definition is a subset of CRA status and carries the same third-party element [VERIFIED].

**But understand precisely what is load-bearing.** Comment 603(f)-3B defines the covered *activity*
broadly: "an entity that collects consumer report information from multiple sources, evaluates the
information, and displays it according to the relative reliability of parallel data, is a CRA because
it is assembling and/or evaluating the information" [VERIFIED]. Juniper's planned feature is squarely
inside that activity description. What keeps it outside the definition is **solely** the audience.
The compliance posture does not rest on "we do not really process the data". It rests entirely on
"we never furnish it to anyone but the subject". That is a narrower foundation than founders assume,
and it is why the couples layer below is the risk it is.

If Juniper did become a CRA, the duty stack (FTC comment 603(f)-1A) includes `1681e(b)` "reasonable
procedures to assure maximum possible accuracy", an open-ended and heavily litigated standard, and
the `1681i` reinvestigation machinery with a 30-day clock and 5-business-day furnisher notification
[VERIFIED]. Neither is retrofittable. Staying a user is most of why this feature is affordable.

### Adverse action does not apply

Confirmed, on unambiguous rule text, three independent ways.

**FCRA `1681m`** triggers only "[i]f any person takes any adverse action" [VERIFIED]. `1681a(k)(1)`
defines the term, and the only potentially relevant catch-all is `(k)(1)(B)(iv)`, which requires both
"an action taken or determination that is ... made in connection with an application ... or a
transaction that was initiated by[] any consumer" **and** that it be "adverse to the interests of the
consumer" [VERIFIED]. Both prongs fail. Juniper takes no action and makes no determination, it
renders. And showing a member their own score at their own request is not adverse to their interests:
a low score was already a fact of the world before it was displayed. [INFERRED]

**ECOA and Regulation B `12 CFR 1002.9`** predicate every duty on a **creditor**, an **applicant**,
and an **application** ([eCFR](https://www.ecfr.gov/current/title-12/chapter-X/part-1002/section-1002.9)) [VERIFIED].
Juniper is none and has neither. The chain never starts.

**Risk-based pricing, `12 CFR 1022` subpart H,** is expressly two-pronged and conjunctive.
`1022.70(a)(1)` applies only to a person that **both** uses a report in connection with a credit
application or grant **and** grants credit on materially less favorable terms based on it
([eCFR](https://www.ecfr.gov/current/title-12/chapter-X/part-1022/subpart-H)) [VERIFIED]. Juniper
fails both prongs. Failing either is dispositive.

Two useful asides. `1022.74(b)` confirms adverse action and risk-based pricing notices are
alternatives, not cumulative [VERIFIED]. And `1022.74(d)(1)(ii)`, the mortgage score-disclosure
exception notice, is a good free template for honest score presentation: it requires stating that a
score "is a number that takes into account information in a consumer report and that a credit score
can change over time", the score distribution among consumers under the same model, and "a statement
that the consumer is encouraged to verify the accuracy of the information contained in the consumer
report and has the right to dispute any inaccurate information" [VERIFIED]. Juniper owes none of
this. Borrowing it is the cheapest available insurance against the risk in the next subsection.

### The risk that is actually live today: misdescribing the score

This one needs no product change to bite, it is a UDAP and UDAAP theory rather than an FCRA one, and
it therefore bypasses every structural protection established above. Given that the recommendation in
section 6 is to ship VantageScore 3.0, it is the most relevant item in this section.

In January 2017 the CFPB entered consent orders against TransUnion and Equifax, finding they "falsely
represented that the credit scores they marketed and provided to consumers were the same scores
lenders typically use to make credit decisions", and specifically that "VantageScores are not
typically used by lenders to make credit decisions". TransUnion paid $13.9M in restitution plus $3M
in penalties; Equifax $3.8M plus $2.5M
([CFPB](https://www.consumerfinance.gov/archive/newsroom/cfpb-orders-transunion-and-equifax-pay-deceiving-consumers-marketing-credit-scores-and-credit-products/)) [SECONDARY].
Separately, the FTC's action against Credit Karma, finalized January 2023, targeted dark patterns and
deceptive "pre-approved" claims where nearly a third of applicants were rejected
([FTC](https://www.ftc.gov/news-events/news/press-releases/2023/01/ftc-finalizes-order-requiring-credit-karma-pay-3-million-halt-deceptive-pre-approved-claims)) [SECONDARY].

Three mitigations, all cheap:

1. **Label each score with its model, version, bureau, and date, and say plainly that lenders may use
   a different model and see a different number.** The FCRA embeds exactly this concept for
   bureau-to-consumer disclosure: `1681g(f)(1)` requires "a statement indicating that the information
   and credit scoring model may be different than the credit score that may be used by the lender"
   ([15 U.S.C. 1681g](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap41-subchapIII-sec1681g.htm)) [VERIFIED].
   That duty runs to the bureau, not to Juniper. Adopting its language is free and directly on point.
2. **Never imply the number is what a lender will see.** This is what the 2017 orders were about.
3. **If the feature ever sits behind a paid tier,** get express informed consent to recurring charges
   and make cancellation genuinely easy. That was half of the 2017 orders and all of the Credit Karma
   theory.

The CFPB's own research supports the framing: consumer-purchased scores frequently differ from what a
lender sees, sometimes because the score is an "educational score" lenders do not use, sometimes
because the lender uses a different model or bureau
([CFPB](https://files.consumerfinance.gov/f/201209_Analysis_Differences_Consumer_Credit.pdf)) [VERIFIED].
Showing FICO 8 and VantageScore 3.0 together, if that is even permitted (section 3), puts two
different numbers on one page. The copy has to explain that rather than let a member conclude one is
broken.
### Data security: the Safeguards Rule, and the one number that changes everything

Juniper is a "financial institution" under GLBA, so `16 CFR 314` applies. The definition is much broader
than the phrase suggests: `314.1(b)` keys it to activities "financial in nature or incidental to such
financial activities as described in section 4(k) of the Bank Holding Company Act", and `314.2(h)(2)(xii)`
gives the closest example, that "[a]n investment advisory company and a credit counseling service are
each financial institutions because providing financial and investment advisory services are financial
activities" ([16 CFR 314](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314)) [VERIFIED].
The FTC's own guide says "what matters are the types of activities your business undertakes, not how you
or others categorize your company"
([FTC](https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know)) [VERIFIED].
Assume in scope. The "free product so no customers" argument does not work, because `314.1(b)` applies
the part "to all customer information in your possession, regardless of whether such information pertains
to individuals with whom you have a customer relationship" [VERIFIED].

**The number that matters.** `314.6`: "Section 314.4(b)(1), (d)(2), (h), and (i) do not apply to financial
institutions that maintain customer information concerning fewer than five thousand consumers" [VERIFIED].
At current scale Juniper is far under that line, so four of the heaviest artifacts are not required today:

| Provision | Excused artifact |
| --- | --- |
| `314.4(b)(1)` | The **written** risk assessment with formal evaluation criteria |
| `314.4(d)(2)` | Annual **penetration testing** and semiannual vulnerability assessments |
| `314.4(h)` | The **written incident response plan** |
| `314.4(i)` | The **annual written report** to a board or senior officer |

Three caveats, each of which has caught people out:

- **The exemption counts consumers whose information Juniper *maintains*, not active users.** Retained
  data from deleted accounts still counts. Instrument the count and alarm below 5,000. [INFERRED]
- **`314.4(b)` itself is not excused, only `(b)(1)` is.** The program must still be based on a risk
  assessment; only the written formalities are waived.
- **`314.3(a)` still requires the *program* to be written**: "You shall develop, implement, and maintain a
  comprehensive information security program that is **written** in one or more readily accessible parts"
  [VERIFIED]. So the program is a required document even where the risk assessment is not.

What still binds at any size, from `314.4` [VERIFIED]: a designated **Qualified Individual** (a); access
controls limiting users "in the case of customers, to access their own information" (c)(1); asset
inventory (c)(2); **encryption** of customer information "both in transit over external networks and at
rest" (c)(3); secure development (c)(4); **MFA** "for any individual accessing any information system"
(c)(5); disposal (c)(6); change management (c)(7); logging of authorized-user activity (c)(8); regular
testing (d)(1); training (e); and service-provider oversight, which requires imposing safeguards **by
contract** (f). Encryption and MFA have no small-entity carve-out.

**Breach notification applies at any size.** `314.4(j)` is not in the `314.6` list. A notification event
involving "at least 500 consumers" must be reported to the FTC "as soon as possible, and no later than
30 days after discovery", on their electronic form, effective 2024-05-13 per `314.5` [VERIFIED]. Note the
presumption in `314.2(m)`: "[u]nauthorized acquisition will be presumed to include unauthorized access to
unencrypted customer information unless you have reliable evidence showing that there has not been, or
could not reasonably have been, unauthorized acquisition" [VERIFIED]. That presumption plus the
encryption mandate interact usefully, and section 5 draws the consequence.

**`314.4(c)(6)` is the retention ceiling and it is unusually concrete:** dispose of customer information
"no later than two years after the last date the information is used in connection with the provision of
a product or service", unless retention is "necessary for business operations or for other legitimate
business purposes" or required by law [VERIFIED]. That is why section 5 lands on 24 months for snapshots
rather than keeping them forever for a trend line, and why consent records can nonetheless be kept
longer.

### GLBA privacy notice

Regulation P (`12 CFR 1016`) is the operative rule, not the FTC's old one: `16 CFR 313.1(b)` now limits
the FTC privacy rule to motor vehicle dealers [VERIFIED]. Any guidance pointing at `16 CFR 313` is out of
date unless you sell cars.

**Initial notice required.** `1016.4(a)(1)`: a clear and conspicuous notice to a customer "not later than
when you establish a customer relationship", with the nine content items in `1016.6(a)`
([12 CFR 1016](https://www.ecfr.gov/current/title-12/chapter-X/part-1016)) [VERIFIED].

**Annual notice not required, conditionally.** `1016.5(e)(1)` excepts an institution that discloses
nonpublic personal information to nonaffiliated third parties only under `1016.13`, `1016.14`, or
`1016.15` and has not changed its disclosed policies [VERIFIED]. Juniper shares with nobody, which is a
subset of that, so both conditions are met. **But the exception self-revokes:** `1016.5(e)(2)(ii)`
requires annual notices to begin "within 100 days of the change" if you fall out of it. Adding an
analytics vendor or marketing partner starts that clock. See the vendor-checklist item in the state-law
section, where the same dependency appears twice more.

### The disposal rule

`16 CFR 682` applies to anyone who "for a business purpose, maintains or otherwise possesses consumer
information", and `682.1(b)` defines consumer information as a record that "is a consumer report **or is
derived from a consumer report**"
([16 CFR 682](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-682)) [VERIFIED].

"Derived from" is broad and captures the whole feature: the score, the utilization figure, the payment
history summary, the inquiry count, the derogatory-marks list, and every cached or denormalized copy in
Postgres, logs, analytics events, error traces, and backups. The displayed factors are as in-scope as the
raw report. [INFERRED, but the definitional text is unambiguous.]

`682.3(a)` requires "reasonable measures to protect against unauthorized access to or use of the
information in connection with its disposal", and `682.3(b)(5)` explicitly permits folding disposal into
the Safeguards program rather than maintaining a separate policy [VERIFIED]. Take that offer, and make
sure the written schedule names log aggregation, error tracking, analytics, and database backups, because
those are where report derivatives actually leak. `682.4` is a useful limit: the rule governs *how* to
dispose, not *when*, so the timing comes from `314.4(c)(6)` and Juniper's own schedule.

### Disputes: route, never absorb

The division of labor is favorable.

- The **bureau** carries the `1681i` reinvestigation duty: a reasonable reinvestigation within **30 days**,
  and notice to the furnisher within **5 business days**
  ([15 U.S.C. 1681i](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap41-subchapIII-sec1681i.htm)) [VERIFIED].
- The **furnisher** (the bank or issuer that reported the tradeline) carries `1681s-2(b)` duties, triggered
  "[a]fter receiving notice pursuant to section 1681i(a)(2)"
  ([15 U.S.C. 1681s-2](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap41-subchapIII-sec1681s-2.htm)) [VERIFIED].
- **Juniper** is neither a CRA nor a furnisher, so it has **no statutory dispute obligation at all**.
  Its duties are not to obstruct and not to mislead. [INFERRED from the duties being assigned elsewhere.
  A provider contract may impose its own routing obligations, so read that clause.]

Note the trigger carefully: the furnisher's duty is set off by notice **from the bureau**, not by a member
complaining to Juniper. A member who reports an error to Juniper and nowhere else has started no clock
anywhere in the system. **If the UI absorbs that complaint without routing it, Juniper has functionally
stopped the member's dispute rights from operating**, which is both a bad outcome and, if the copy implied
Juniper would handle it, a deceptive practice. [INFERRED]

So build: a path from any displayed item to a plain explanation that the bureau resolves disputes and
Juniper cannot change bureau data; the bureau's name and a link to its dispute portal (mirroring what
`1681m(a)(3)` requires of users who do have a duty, including "a statement that the consumer reporting
agency did not make the decision"); a link to annualcreditreport.com, since `1681j(a)(1)(A)` entitles the
member to a free annual file disclosure [VERIFIED]; a refresh path so a corrected file is not masked by a
stale cache; and copy that never says "fix", "remove", "dispute", or "escalate".

One non-obvious point: **caching drifts toward CRA status.** `1681a(g)` defines a "file" as "all of the
information on that consumer recorded and retained by a consumer reporting agency regardless of how the
information is stored" [VERIFIED], and FTC comment 603(f)-3B treats collecting from multiple sources plus
evaluating plus displaying as CRA activity. The third-party limiter still protects Juniper. But a growing,
retained, multi-bureau, self-evaluated store of credit data is the asset a CRA has, and the only thing
keeping Juniper outside the definition is who sees it. Short payload retention is therefore not only a
security control, it is part of what keeps the CRA analysis clean. [INFERRED]

### Exposure, so the numbers are known

Federal: `1681n` gives statutory damages "of not less than $100 and not more than $1,000" for willful
noncompliance plus punitive damages and fees, and `1681n(b)` creates liability to the **bureau** for
obtaining a report without a permissible purpose [VERIFIED]. `1681q` is criminal: obtaining information
"under false pretenses" is punishable by fine, "imprisoned for not more than 2 years, or both" [VERIFIED].
`1681p` allows suit up to 2 years after discovery or 5 years after the violation [VERIFIED].

At a handful of users the absolute exposure is small. It scales linearly with user count, which is the
real reason to get the consent artifact right now rather than later. California's structure is harsher and
is covered next.
### State law: preemption is narrower than it looks

The FCRA preempts some state law but not the part that matters here. `1681t(b)(1)` enumerates eleven
preempted areas including prescreening, dispute timing, adverse action, and risk-based pricing
([15 U.S.C. 1681t](https://www.law.cornell.edu/uscode/text/15/1681t)) [VERIFIED]. **`1681b(a)`,
permissible purposes, is not on the list.** So state statutes imposing their own consent or
authorization conditions on obtaining a report are not subject-matter preempted, and survive unless
actually inconsistent under `1681t(a)`. A state law that is merely *more protective* is not
inconsistent, so it stands. [VERIFIED on the text, [INFERRED] on the gap analysis]

Direction of travel is favorable: the CFPB issued an interpretive rule applicable 2025-10-28
clarifying that the FCRA "generally preempts State laws that touch on broad areas of credit
reporting", replacing a 2022 rule it withdrew in May 2025
([90 FR 48710](https://www.federalregister.gov/documents/full_text/text/2025/10/28/2025-19671.txt)) [VERIFIED].
But an interpretive rule binds no court, this position has already flipped once, and it does not reach
the `1681b(a)` gap. Do not treat it as a general shield.

### California, which is the state that matters

Good news on the big questions.

**Not a CRA in California either.** `Cal. Civ. Code 1785.3(d)` carries the same limiter as the federal
definition: assembling or evaluating credit information "for the purpose of furnishing consumer credit
reports **to third parties**"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1785.3)) [VERIFIED].
Juniper sits in CCRAA Chapter 3, "Requirements on Users of Consumer Credit Reports", not Chapter 2.
And `1785.11(a)(2)` is a direct analogue of the federal permissible purpose: "In accordance with the
written instructions of the consumer to whom it relates" [VERIFIED]. Certify both.

**No CRA registration, licensing, or bonding requirement exists in the CCRAA** [VERIFIED via full-text
scan of 1785.1 through 1785.36 returning zero hits for registration, register, bond, or surety].

**Neither California adverse-action provision applies.** `1785.20(a)` triggers only on adverse action
[VERIFIED]. `1785.20.2` is narrower than commonly assumed: it reaches only a person "who makes or
arranges loans" using a score for an application "secured by one to four units of residential real
property" [VERIFIED]. Two cumulative conditions, both failed. There is no general "user must give
notice on obtaining a report" provision in the CCRAA.

**A credit score is not "sensitive personal information" under CCPA/CPRA.** `1798.140(ae)` is a closed
enumeration, and the financial category at `(ae)(1)(B)` requires an account or card number "**in
combination with** any required security or access code" [VERIFIED]. A score is a model output, not an
account identifier, and there is no residual "financial information" category. **But the SSN collected
to resolve identity is squarely SPI under `(ae)(1)(A)`.**

**Juniper is not a "business" under the CCPA.** `1798.140(d)(1)` requires revenue over $25M, buying or
selling or sharing the information of 100,000-plus consumers, or 50% of revenue from selling or
sharing [VERIFIED]. Note the verb list in prong (B) is "buys, sells, or shares", **not** "collects", so
a zero-sharing architecture makes that threshold structurally unreachable rather than merely currently
unmet [INFERRED]. That is a stronger position than a size exemption. Do not voluntarily certify in
under `(d)(4)`; it opts you into the whole statute.

The CPPA's ADMT and risk-assessment regulations (effective 2026-01-01, ADMT duties from 2027-01-01)
do not reach this on three independent grounds: they address "a business", a score display is not a
"significant decision" under reg 7001(ddd) whose financial-services list is exhaustively enumerated,
and rendering a third party's score is probably not ADMT at all since reg 7001(e) requires technology
that replaces human decisionmaking ([CPPA](https://cppa.ca.gov/regulations/ccpa_updates.html)) [VERIFIED].
The CPPA's own illustrative example is instructive: reg 7150(c) example (3) describes a
personal-budgeting app processing financial data and profiling users, and the trigger it identifies is
**sharing**, not the processing [VERIFIED].

Now the four items that do bite.

**1. Reasonable security applies today, with no size threshold.** `Civ. Code 1798.81.5(b)` requires "a
business that owns, licenses, or maintains personal information about a California resident" to
implement reasonable security procedures, and "business" here is **not** the CCPA's threshold
definition. A solo founder with three users is covered
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.81.5)) [VERIFIED].
The triggering data is the SSN, not the score: the `(d)(1)` list covers SSN, government ID, account
number plus security code, medical, biometric, and genetic data. **A credit score and bureau factors
appear nowhere on it.**

**2. Breach notification now has a 30-day clock.** `Civ. Code 1798.82(a)(2)(A)`, added by SB 446,
Stats. 2025 Ch. 319, requires disclosure "within 30 calendar days of discovery or notification of the
data breach"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.82)) [VERIFIED].
This replaced the old "most expedient time possible" standard. Unlike the FTC's `314.4(j)`, there is
**no 500-consumer floor**, so this is the binding deadline in practice. Thirty days is not enough to
draft a notice while containing an incident, so the runbook needs a pre-drafted template even though
the federal written incident response plan is excused.

**3. `Civ. Code 1798.150` is the sharpest single exposure.** A consumer whose nonencrypted personal
information as defined in `1798.81.5(d)(1)(A)`, **which includes SSN**, is exfiltrated "as a result of
the business' violation of the duty to implement and maintain reasonable security procedures" may
recover "not less than one hundred dollars ($100) and not greater than seven hundred and fifty ($750)
per consumer per incident or actual damages, whichever is greater"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.150)) [VERIFIED].
**Both CCPA exemptions expressly preserve this section**, so no amount of GLBA or FCRA exemption helps.
It is a statutory-damages class mechanism, and liability requires a breach of the reasonable-security
duty, which is exactly why the written security program is the highest-value artifact on the list.

**4. CCRAA penalties are harsher than the federal ones in structure.** `1785.19` allows a consumer to
recover up to $2,500 against a person who "knowingly and willfully obtains access to a file other than
as provided in Section 1785.11" or "uses the data received from a file in a manner contrary to an
agreement with the consumer credit reporting agency" [VERIFIED]. And `1785.31` provides actual damages
for **negligent** violation, punitive damages of $100 to $5,000 **per violation** for willful
violation, a $2,500 floor against a **natural person** obtaining a report without permissible purpose,
express availability of punitive damages "in the case of a class action", and one-way fee shifting to
prevailing plaintiffs [VERIFIED]. Negligence suffices for actual damages. Entity formation is not
insulation, given `1785.31(a)(3)`'s reach to a natural person.

[INFERRED] The practical read: the most likely California liability path is records hygiene, not
architecture. Re-pulling on stale or revoked consent, pulling for someone who never authorized, or
using the data in a way the reseller agreement forbids (analytics, model training, marketing are the
usual contractual bans). That is a second, independent reason the consent records in section 5 need to
be reproducible per pull.

**California codifies the four-factor cap as a state duty.** `Civ. Code 1785.15.1(a)` requires the
score, "the range of possible credit scores under the model used", "**all the key factors that
adversely affected the consumer's credit score in the model used, the total number of which shall not
exceed four**", the date created, the provider's name, and "a statement indicating that the information
and credit scoring model may be different than the credit score that may be used by the lender", with
`(c)` defining key factors as "listed in the order of their importance"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1785.15.1)) [VERIFIED].
This is a CRA duty flowed down through the interface. It confirms the UI consequence: **the live factor
list is at most four adverse factors, ordered by importance, per score model.** `credit.tsx` currently
names five planned factors as flat chips. That is fine as a "what is coming" list and wrong as a live
component.

**SB 1 asks nothing, as long as nothing is shared.** `Fin. Code 4054(a)` is dispositive: "Nothing in
this division shall require a financial institution to provide a written notice to a consumer pursuant
to Section 4053 if the financial institution does not disclose nonpublic personal information to any
nonaffiliated third party or to any affiliate"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=FIN&sectionNum=4054)) [VERIFIED].
So no notice, no consent form, no annual mailing, regardless of whether Juniper is a `4052(c)`
financial institution. Worth knowing that where SB 1 does apply it is stricter than GLBA (**opt-in**
for nonaffiliated sharing, versus opt-out) and the `4053(d)(1)` form requirements are exacting, down to
"a minimum Flesch reading ease score of 50" [VERIFIED]. Strong reason to preserve zero sharing rather
than plan to comply later.

**The vendor trap, which is the same one three times over.** The GLBA Reg P annual-notice exception
(`12 CFR 1016.5(e)(1)`), the SB 1 no-notice position (`Fin. Code 4054(a)`), and the CCPA
business-threshold argument all depend on not sharing with nonaffiliated third parties. A single
analytics beacon carrying score data breaks all three at once, and Reg P then requires annual notices
"within 100 days of the change" [VERIFIED]. **Make this one item on the vendor onboarding checklist,
not three.**

### The California finding that changes the roadmap

The Credit Services Act, `Civ. Code 1789.10 et seq.`, is not a disclosure regime. It is a
business-model prohibition, and it is closer to the current product than it looks.

`1789.12(d)` defines a credit services organization as a person who, with respect to the extension of
credit by others, sells or performs, "**or represents that the person can or will** sell, provide, or
perform", any of the following "**in return for the payment of money or other valuable consideration**":
"(1) Improving a consumer's credit record, history, or rating. (2) Obtaining a loan or other extension
of credit for a consumer. (3) **Providing advice or assistance to a consumer with regard to either
paragraph (1) or (2)**"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1789.12)) [VERIFIED].
The `1789.12(e)` exemptions cover licensed lenders, banks, proraters, brokers, attorneys, and
501(c)(3)s. **None is available to a fintech, and there is no software carve-out** [INFERRED].

If you are a CSO, `1789.25(a)` requires registration with the **Department of Justice** before doing
business, with owner disclosures and annual expiry, and `1789.18` requires "**a surety bond in the
principal amount of one hundred thousand dollars ($100,000)**" filed with the Secretary of State
[VERIFIED]. And the killer, `1789.13(a)`: a CSO "shall not ... charge or receive any money or other
valuable consideration **prior to full and complete performance of the services**", with `(c)`
requiring a monthly statement of services performed [VERIFIED].

**A recurring subscription is structurally incompatible with `1789.13(a)`.** Combined with the $100k
bond and DOJ registration, the realistic answer is not "comply", it is "do not build score-improvement
features" [INFERRED].

Passive display does not trip the Act: reporting a fact is not improving a rating, obtaining credit, or
advising on either, and neutrally restating the bureau's own key factors is disclosure [INFERRED]. But
the margin is thin, and three ordinary product decisions cross it:

1. **Marketing copy alone can do it,** because the definition captures mere representations. "Raise
   your score", "boost your credit", "improve", "fix", "repair" are all representations under `(d)(1)`.
   **The landing page is a compliance surface.** This is sharper than the UDAAP risk earlier in this
   section: in California the copy does not merely risk a deception claim, it can pull Juniper into a
   registration-and-bond regime.
2. **Prong (3) is wide.** "Pay down this card to gain roughly 20 points", a personalized improvement
   plan, or a score simulator is advice with regard to improving a rating. Generic, non-individualized
   education is meaningfully safer.
3. **A paid tier supplies the consideration element.** Free display is outside the Act on the
   compensation element alone.

**Concretely relevant to this codebase.** `api/_score.ts` already ships advice copy keyed to the credit
factor: `"Improve your credit health"` with detail `"Keep card utilization under 30% and payments on
time to lift your score."` That is generic, attached to the proprietary Juniper Score rather than a
bureau score, and the product is currently free, so it is very likely fine today [INFERRED]. It is
also exactly the shape of copy that becomes a problem once a real bureau score is on screen, the advice
is personalized to that score, and there is a subscription. ROADMAP Stage 2 also lists a pending
"ways to improve" score-breakdown surface. **Review that copy against `1789.12(d)` before building it,
not after.**

The federal analogue is lighter but points the same way: CROA `15 U.S.C. 1679a(3)(A)` requires
**compensation** plus a purpose of improving a credit record or advising on it
([Cornell](https://www.law.cornell.edu/uscode/text/15/1679a)) [VERIFIED]. A free descriptive display
satisfies neither element. A paid product with improvement-promising framing satisfies both.

### CCFPL: a regulator stacked on top

`Fin. Code 90005(f)(1)` defines a covered person as anyone "offering or providing a consumer financial
product or service to a resident of this state", and `(k)(8)` reaches "providing financial advisory
services ... to consumers on individual financial matters", excluding information "**not tailored to
the individual needs of a particular consumer**"
([leginfo](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=FIN&sectionNum=90005)) [VERIFIED].
Juniper's whole value proposition is tailoring, so `(k)(8)` is hard to argue away [INFERRED]. Note this
is the same line as the Credit Services Act: more personalization moves you further inside both.

Why it matters: `Fin. Code 90003(a)` applies regardless of registration and makes it unlawful to engage
in any "unlawful, unfair, deceptive, or abusive act or practice" or to offer a product "**not in
conformity with any consumer financial law**" [VERIFIED]. So a CCRAA or Credit Services Act violation
becomes independently enforceable by DFPI, stacking a regulator on top of the private remedies above
[INFERRED].

No registration duty today. But DFPI file **PRO 07-24**, dated 2026-01-12 with comments closed
2026-02-26, is live pre-rulemaking on "Registration and Reporting of Covered Persons" aimed
specifically at `90005(k)(9)`, and it asks how to define gross income "to avoid imposing burdensome
fees on smaller entities"
([DFPI](https://dfpi.ca.gov/wp-content/uploads/2026/01/PRO-07-24-Second-Invitation-for-Comments.pdf)) [VERIFIED].
That fee question signals registration fees are being designed. **Add PRO 07-24 to a quarterly
regulatory watch.** If it proceeds broadly, it would be Juniper's first affirmative California
registration duty.

Ruled out: Juniper is not a "data broker" under the Delete Act. `Civ. Code 1798.99.80(c)` requires
knowingly collecting and **selling to third parties** the information of a consumer "with whom the
business does not have a direct relationship" [VERIFIED]. Out on three grounds: nothing is sold, there
is a direct relationship with every member, and the FCRA and GLBA exclusions apply.

### Other states: genuinely not researched

Stated plainly rather than papered over. **[NOT COMPLETED]** on all of the following, and the first one
is the real gap:

- **Vermont, 9 V.S.A. 2480e.** The highest-value unknown. It sits squarely in the `1681b(a)` preemption
  gap identified above and is the state most likely to impose a real additional pre-pull consent
  obligation. Two research attempts failed on a TLS certificate error at legislature.vermont.gov.
  **Do not assume the federal consent analysis is sufficient nationwide until this is checked.**
- **Massachusetts 201 CMR 17.00**, the written information security program and 17.04 technical
  controls, and its extraterritorial reach to any company holding one Massachusetts resident's personal
  information. Worth checking early because it may reimpose the written program the federal
  sub-5,000-consumer exemption excuses.
- **New York** GBL art. 25 (380 et seq.), and whether 23 NYCRR 500 reaches an unlicensed fintech
  (probably not, since "covered entity" requires a DFS license, but unverified).
- **Texas** Bus. & Com. Code ch. 20, Fin. Code ch. 393 CSO registration and bond, and the Texas Data
  Privacy and Security Act, which reportedly has no revenue threshold.
- **CROA `1679b` through `1679f`**: advance-payment prohibition, mandatory contract terms, three-day
  cancellation, voidability. Only the `1679a(3)` definition is verified.

[INFERRED] California's Credit Services Act findings are a strong signal about the state CSO landscape
generally. If California captures marketing representations and bars pre-performance payment, other
aggressive states plausibly do too. Treat "do not build score-improvement features" as the safe
nationwide default rather than a California quirk to be routed around.

**Recommendation on state law: hand this to a lawyer, not to more research.** The federal analysis is
settled enough to act on. The specific questions worth paying for are: Vermont's pre-pull consent
requirement, whether Massachusetts reimposes the written security program, and, the one with real
money attached, whether the planned score-improvement and simulator features make Juniper a credit
services organization in California and elsewhere.
### The couples problem, which is specific to Juniper and is the largest hidden risk

Everything above rests on one fact: the member is the only person who sees the report. Both the federal
and the California CRA definitions turn on the same two words. `1681a(f)` covers assembling or
evaluating consumer information "for the purpose of furnishing consumer reports **to third parties**",
and `Cal. Civ. Code 1785.3(d)` uses materially identical language [VERIFIED]. FTC staff comment
603(f)-4F holds that a user does not become a CRA by "regularly giving a copy of the report ... to the
consumer who is the subject of the report ... because it is not disclosing the information to a 'third
party'" [VERIFIED].

**Juniper is a couples product with the sharing plumbing already built.** `0012_partnerships.sql` and
`0013_shared_layer.sql` are live. `account_shares` gives each Plaid account a per-account scope of
`shared`, `balance`, or `private`. `api/partner.ts` rolls up combined net worth across both members'
`plaid_items`, honoring each member's sharing preference. The shared workspace has its own Overview,
Accounts, Goals, Bills, and Activity surfaces.

A spouse or fiance is a third party under the FCRA. There is no household exception that makes this
automatic. So the moment a member's credit score or factors become visible to their partner, Juniper is
furnishing a consumer report to a third party, which needs its own permissible purpose and, on the plain
text of both definitions, is the element that would make Juniper a CRA. Recall from section 4 what CRA
status brings: `1681e(b)` "maximum possible accuracy" and the `1681i` reinvestigation machinery with a
30-day clock. Neither is retrofittable.

[INFERRED on the application to a spouse, from the structure of `1681b` and the CRA definitions rather
than from a case or an agency statement. **This is the single item most worth paying a lawyer to look
at**, and it is worth doing before any provider contract is signed, because the answer affects what the
contract needs to permit.]

Three things follow:

1. **Credit data must be excluded from the sharing layer by construction, not by a default setting.**
   Do not add a `credit` scope value to `account_shares`. Do not let the partner net-worth rollup in
   `api/partner.ts` reach `credit_snapshots`. A future contributor adding "share everything" should have
   to delete code to leak this, not flip a boolean.
2. **If partner-visible credit ever becomes a product requirement,** it needs a separate, explicit,
   per-partner, revocable authorization from the member whose report it is, recorded the same way as the
   pull consent, plus legal review before it ships. It is not a settings toggle.
3. **The shared activity feed is a leak path.** `api/partner/activity.ts` accepts a message body with a
   `txnRef`. Any future "share this insight" affordance on the Credit page would put report contents
   into a table the partner reads.

This is the part I would flag hardest. The compliance analysis for a solo self-view credit feature is
manageable, and most of this memo says so. The analysis for a couples product that shares credit files
between partners is a different and much more expensive conversation, and the codebase already contains
the plumbing that would make it a two-line accident.
### What Juniper would actually have to build or write

Not acronyms. Artifacts.

**Write (reviewed by a lawyer):**

1. **A standalone credit-pull authorization**, using active first-person language that grants rather than
   notifies (section 4's FTC test). Its own screen, separate assent from the TOS. Names what is pulled,
   from which bureau, by whom, how often, that it is a soft inquiry, and how to revoke.
2. **A revocation path** in copy and in product. "Stop tracking my credit" must be findable and must
   actually call the provider's deletion endpoint.
3. **Privacy policy amendment** covering credit data: what is collected, retention, who it is shared
   with (nobody), and the Safeguards commitment. Note the GLBA initial notice under `12 CFR 1016.4(a)(1)`
   needs the nine `1016.6(a)` content items.
4. **A written note recording the two exemptions currently relied on** and the events that would end
   them: the `16 CFR 314.6` under-5,000-consumer exemption and the `12 CFR 1016.5(e)(1)` annual-notice
   exception. Both are conditional. Both will lapse quietly if nobody is watching.
5. **Dispute routing copy plus a support path.** Juniper does not reinvestigate. The page needs a "this
   looks wrong" affordance that routes to the bureau by name with a link, plus a link to
   annualcreditreport.com, plus a human who answers when a member emails instead.
6. **A written retention and disposal schedule** with three separate lines (SSN never, consent ~6 years,
   snapshots 24 months), naming the non-obvious locations: logs, error tracking, analytics, database
   backups and snapshots. `16 CFR 682.3(b)(5)` explicitly permits folding disposal into the Safeguards
   program rather than maintaining a separate policy, so do that.
7. **A written information security program.** `314.3(a)` requires the **program** to be written even
   though `314.6` excuses the written risk assessment. Short is fine. It needs the named Qualified
   Individual (Finley, dated), access controls, encryption posture, MFA, vendor oversight, and training.
   It should be a file in this repo.
8. **A one-page incident response runbook**, even though `314.4(h)` excuses the formal plan. Two clocks
   make improvisation unwise: the FTC's 30 days for 500-plus consumers, and California's `1798.82`
   30 calendar days with **no** consumer floor.
9. **Score display copy** naming model, version, range, bureau, and date, stating that lenders may use a
   different model and see a different number, and explaining why two scores disagree.

**Build:**

10. **Consent gate.** No pull without a `credit_consents` row, enforced server-side in
    `api/credit/enroll.ts`, not by hiding a button.
11. **Consent audit trail** storing the disclosure version and a hash of the exact text rendered, so it
    is provable a year later what a member agreed to. Versioned, append-only.
12. **SSN pass-through with no persistence.** The single highest-value control, per section 5.
13. **A retention purge job.** The first scheduled deletion in this repo.
14. **Deletion fan-out**, `api/credit/remove.ts` calling the provider before deleting locally.
15. **A signed-webhook endpoint** if alerts are in scope. New pattern for this repo.
16. **Hard exclusion of credit data from the partner sharing layer.** See the couples problem above.
17. **A consumer counter with an alarm below 5,000.** `314.6` counts consumers whose information Juniper
    **maintains**, not active users, so retained data from deleted accounts still counts. Learn about
    crossing that line before an examiner does.
18. **Identity proofing plus MFA**, and re-authentication before re-displaying a stored report.
19. **Log hygiene review.** Confirm no credit field or identifier can reach a Vercel log line, including
    via an error path that echoes a response body.
20. **One vendor-onboarding checklist item** covering all three zero-sharing dependencies (Reg P annual
    notice, SB 1, CCPA business threshold). A single analytics beacon carrying score data breaks all
    three at once.

**Deliberately not built:**

21. **No dispute filing on the member's behalf.** CROA `1679a(3)` plus state CSO statutes attach to paid
    services aimed at improving a credit record. Display and route out. Do not file.
22. **No score simulator and no personalized improvement plan without legal review first.** The sleeper
    item. `Cal. Civ. Code 1789.12(d)` prong (3) reaches advice on improving a rating, `1789.25` requires
    DOJ registration, `1789.18` requires a $100,000 surety bond, and `1789.13(a)` bars charging before
    full performance, which a subscription cannot satisfy. Also review the existing advice copy in
    `api/_score.ts` ("Keep card utilization under 30% and payments on time to lift your score") and the
    pending ROADMAP "ways to improve" surface against that statute before extending either to a real
    bureau score.
23. **No score-based offer targeting.** Using the score to select which marketplace offers a member sees
    is a second use the `1681e(a)` "no other purpose" certification does not cover, and FTC comments
    604(a)(3)(F)-6 and 604(a)(3)(A)-4A both say review purposes do not permit marketing other products.
    Stage 5's `api/_picks.ts` already personalizes offers from financial signals; keep credit-report data
    out of that input set. It is also worth noting that doing this would cost Juniper the CCPA
    `1798.145(d)` exemption, which is conditioned on using the data only as the FCRA authorizes.
24. **No prescreened or firm offers of credit.** `1681b(c)` and `1681m(d)` are a separate regime with
    their own opt-out plumbing and a mandatory notice on every solicitation.
25. **No underwriting, no lead-gen to lenders, no selling the data.** Each converts this memo into a
    different and much heavier one.
## 5. Integration sketch for this codebase

The house pattern is already the right shape. Every Plaid endpoint does the same five things, and a
credit provider would do the same five:

1. `export const config = { runtime: "edge" }`, CORS preflight, method check.
2. `extractBearerToken(req)` then `verifySupabaseJwt(...)`, 401 on failure (`api/_supabase-jwt.ts`).
3. Secrets read only through `readEnv()` server-side (`api/_env.ts`). Never in the bundle.
4. Provider called over plain `fetch` through a single helper. `api/_plaid.ts` exists precisely because
   the Edge runtime will not run axios-based vendor SDKs, and that constraint applies to every credit
   provider's Node SDK too.
5. Writes go through `adminRest()` with the service-role key (`api/_supabase-admin.ts`), which bypasses
   RLS, so every query filters by `user_id` by hand. A sanitized snapshot is persisted and only the
   snapshot is ever returned to the browser.

**One caveat that would void this whole section.** If the provider is Array, their docs state
TransUnion information "may not be transmitted by Array to Array clients or third parties, nor may
Array clients access, view, share, process, or store TransUnion information" [VERIFIED, section 2]. Under
that constraint Juniper renders Array's embedded component and stores nothing, and none of the below
applies. Settle the data-access question before designing anything.

### The architecture decision that matters most

Three classes of data, three different retention postures. Getting this split right removes more risk
than any other choice in this memo.

| Data | Where it lives | How long |
| --- | --- | --- |
| **Identity-resolution inputs (SSN, DOB, full address)** | **Nowhere.** Request body only, in and out of scope inside one function | Never persisted, never logged |
| **Consent records** | Postgres, append-only, server-only | ~6 years past the last pull made under them |
| **Score and factor snapshots** | Postgres, server-only | 24 months, then purged |
| **Raw provider report payload** | **Nowhere.** Sanitized on arrival, remainder discarded in the same function | Not persisted |

The SSN line is the highest-value one. Per section 4, the SSN and not the score is what makes Juniper
subject to `Cal. Civ. Code 1798.81.5`, what triggers `1798.82` breach notification, what brings it
within `1798.150`'s $100 to $750 per-consumer statutory damages, and the only CPPA risk-assessment
trigger a zero-sharing posture does not already neutralize. **Passing the SSN straight through to the
provider and keeping only the provider's own consumer token removes four distinct risks with one design
decision.** [INFERRED, but each underlying provision is verified.]

Note also that Equifax's CES documentation says "Credit reports are delivered directly to consumers,
thus eliminating sensitive data storage challenges for partners" [VERIFIED, section 2]. If that
architecture is available, take it. The cheapest compliance posture is the one where the sensitive
payload never reaches Juniper's infrastructure at all.

### Endpoints

| Endpoint | Method | Does |
| --- | --- | --- |
| `api/_credit.ts` | helper | Provider REST wrapper mirroring `api/_plaid.ts`: base URL per environment, `creditConfigured()`, credentials from `readEnv`, never log the body, and a `sanitizeCreditSnapshot()` that is the only thing allowed to cross to the client. |
| `api/credit/consent.ts` | POST | Records the FCRA written-instruction consent before anything is pulled. Writes an append-only row: disclosure version, hash of the exact text rendered, timestamp, IP, user agent. Returns a consent id. Nothing else runs without one. |
| `api/credit/enroll.ts` | POST | Creates the provider-side consumer record from identifiers taken from the request body, stores the provider consumer id and token. Direct analogue of `api/plaid/exchange.ts`. **The identifiers must not survive this function.** |
| `api/credit/session.ts` | POST | Only for a widget or SDK provider: mints a short-lived user-scoped token for the browser. Direct analogue of `api/plaid/link-token.ts`, which already passes `user: { client_user_id: payload.sub }`. |
| `api/credit/scores.ts` | GET | Returns the stored sanitized snapshot. No live provider call, same as `api/plaid/accounts.ts`. |
| `api/credit/refresh.ts` | POST | Pulls from the provider on demand or on schedule, sanitizes, upserts. Rate limited per user. Note Spinwheel documents that refresh subscriptions "initiate billable events whenever a new credit report is fetched", so cadence is a cost decision, not just a freshness one. |
| `api/credit/remove.ts` | POST | Revokes at the provider, then deletes local rows. `api/plaid/remove.ts` is the template: it calls `/item/remove` first and only then deletes. |
| `api/credit/webhook.ts` | POST | Score-change and new-inquiry alerts. **This would be the first unauthenticated endpoint in the repo.** Nothing under `api/` currently accepts a request without a Supabase JWT, so this needs a new pattern: HMAC or signature verification against a provider secret, replay protection, and no trust in the body beyond "user X changed, go refresh". Never let a webhook body write score values directly. |
| cron target | GET | The retention purge. Nothing in this repo deletes anything on a schedule yet; this would be the first. A Vercel cron hitting an authenticated endpoint is the cheapest fit. |

### Migration

One migration, `0015_credit_provider.sql`, following the comment-first style of `0007`. Three tables,
and the access posture differs per table on purpose.

**`credit_enrollments`** (provider consumer id, provider token, status). Server-only, exactly `0007`:
`ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon, authenticated`, `GRANT ALL ... TO service_role`,
plus the restrictive `USING (false) WITH CHECK (false)` policy so a leaked user JWT hitting PostgREST
gets zero rows. Same reasoning as the Plaid `access_token`: this credential reads a credit file.

**`credit_consents`** (user_id, disclosure_version, disclosure_hash, consented_at, ip, user_agent,
resulting_pull_id). Server-only, append-only. Grant `INSERT` and `SELECT` to `service_role` and
deliberately **not** `UPDATE` or `DELETE`, because this table is the evidence that the pull was
authorized. Per section 4 it is the shield, and it should outlive the credit data itself. Version the
disclosure text and never mutate a historical version in place.

**`credit_snapshots`** (user_id, as_of, models JSONB, factors JSONB). This is where I would deviate from
the house default. `score_history` (`0009`) and `manual_accounts` (`0014`) are both client-readable with
owner RLS, on the reasoning that they are the user's own data. Credit snapshots are also the user's own
data, but the blast radius of a stolen browser token is different: a leaked JWT should not pull a credit
history out of PostgREST directly. Keep this table server-only like `0007` and serve it exclusively
through `api/credit/scores.ts`. The cost is one endpoint instead of a direct client read, which the
Credit page already does anyway, since `credit.tsx` deliberately calls `fetchPlaidItems()` rather than
the finances seam.

### What the snapshot may contain

Store the score value, the model name and version, the bureau, the `as_of` date, the score range, and
the factor rows as ordered reason codes. That is exactly the `1681g(f)` and `Cal. Civ. Code 1785.15.1`
element set from section 4, and it is enough to draw a number, a trend, and the factor list.

**The factor list is at most four adverse factors, ordered by importance, and it is per score model.**
So the column is an ordered array, not five fixed fields, and the UI renders a variable-length list.
`credit.tsx`'s current five flat chips in `PLANNED_FACTORS` are fine as a "what is coming" list and
wrong as a live component.

Never store, and never log:

- **SSN or ITIN**, per the table above. `plaidFetch` already carries the "Never log the body" comment,
  and this is the case where that comment earns its keep.
- **The raw provider response.** Report payloads carry tradeline-level detail, account numbers, employer
  history, and addresses. Sanitize on arrival and discard the rest in the same function, the way
  `sanitizeAccounts()` drops routing numbers.
- **KBA questions and answers.**
- **Anything sensitive in an error returned to the client.** `api/plaid/accounts.ts` returns a `detail`
  field from a failed PostgREST call. Do not copy that pattern here.

### Encryption and retention

`16 CFR 314.4(c)(3)` requires encryption of customer information in transit and at rest, with **no
small-entity carve-out** [VERIFIED, section 4]. Supabase Postgres is encrypted at rest at the platform
level, which should satisfy this; confirm it in the security review rather than assuming.

Do **not** reach for Postgres column encryption. Supabase says it "does not recommend the usage of
pgsodium as it will be deprecated" and that Transparent Column Encryption and Server Key Management are
not recommended "due to their high level of operational complexity and misconfiguration risk"
([Supabase](https://supabase.com/docs/guides/database/extensions/pgsodium)) [VERIFIED]. Supabase Vault
is the supported home for secrets and its API is unaffected by that deprecation
([Vault docs](https://supabase.com/docs/guides/database/vault)) [VERIFIED]. Use Vault for the provider
credential if you want it out of Vercel env vars, and otherwise minimize what is stored.

There is a second reason encryption matters more here than usual. The FTC's `314.2(m)` presumes
unauthorized *access* to unencrypted customer information is unauthorized *acquisition* unless there is
"reliable evidence" otherwise [VERIFIED, section 4]. Strong encryption with well-protected keys is what
lets Juniper rebut that presumption, and therefore what determines whether an incident is reportable at
all. Encryption is not just a control here, it is a reporting-threshold control. [INFERRED]

On retention: 24 months of snapshots matches the trend the design calls for and sits inside
`314.4(c)(6)`'s two-years-from-last-use ceiling. `user_id` already cascades on `auth.users` delete in
every existing table, so account deletion cleans up locally, but `api/credit/remove.ts` must also call
the provider's deletion endpoint, because deleting a local row does not cancel a monitoring enrollment.

### Downstream, and one seam that already exists

`api/_score.ts` already accepts optional `creditScore` (300 to 850) and `creditUtilization` on
`ScoreInput`, and `creditFactor()` prefers the score when present and falls back to utilization when it
is not. `api/_finance-snapshot.ts:99` even carries the comment "creditScore / creditUtilization left
undefined until we ingest credit data (Stage 10); the engine falls back to a neutral credit factor."

So a real score flows into the Juniper Score through a seam that already exists, closing the ROADMAP
Stage 10 item about the static 726 in the credit-health factor. No scoring-engine change is required
beyond populating the input. Note the same engine is mirrored client-side in
`artifacts/juniper/src/lib/score.ts`, so both copies read the field.

### Env and environment split

`CREDIT_PROVIDER_CLIENT_ID` and `CREDIT_PROVIDER_SECRET` read through `readEnv`, server-side only, and
**split by Vercel environment exactly as `PLAID_ENV` now is**: production credentials on Production,
sandbox credentials on Preview and Development. That split was added after the Plaid production work
specifically so preview and local can never touch a real bank. The same reasoning applies with more
force to a real credit file.
## 6. Recommendation

### The finding that should shape the decision

**The founder's exact spec is probably not buildable as described, and the blocker is contractual
rather than technical.** Two independent constraints:

1. **FICO's Open Access program terms prohibit displaying other scores alongside a FICO score**
   (section 3, `2.2(d)`), and across 18 consumer products verified in this research, not one shows both
   a FICO score and a VantageScore. FICO 8 and VantageScore 3.0 side by side on one page may simply not
   be permitted.
2. **The five-factor row is wrong.** Both `15 U.S.C. 1681g(f)` and `Cal. Civ. Code 1785.15.1` cap the
   adverse key-factor list at **four**, ordered by importance, per model. The design calls for five flat
   chips.

Neither is fatal to the feature. Both mean the design should be revised before anyone builds it.

### Recommended: ship VantageScore 3.0 first, sourced from Equifax Consumer Engagement Suite

Two decisions bundled, so take them separately.

**On the score: VantageScore 3.0 first, FICO 8 as a later phase.** Reasons, all from section 3:
consumer disclosure is an **enumerated permitted use in the base VantageScore agreement** rather than a
separately negotiated FICO permission; the VantageScore trademark license is royalty-free; bureau
pricing for VantageScore fell to roughly $1 in late 2025; every provider researched documents
VantageScore as the paved path while FICO is a premium SKU, a hard-pull-only SKU, or an unnamed version;
and every independent consumer marketplace in the market runs on VantageScore 3.0. Committing to FICO 8
up front is what pushes this toward an enterprise contract Juniper does not need at a handful of users.

**On the provider: Equifax Consumer Engagement Suite.** It is the only source whose own published
product sheet names **FICO Score 8 (1B) and VantageScore 3.0 (1B and 3B)** in one matrix, so the FICO
phase later does not require changing vendors. Its Credit Scores API returns "Payment Activity, Credit
Utilization, Debt & Balances and Credit Activity", which maps directly onto the factor rows. Its Credit
Report Monitoring product covers the Stage 10 alerting item outright, including Score Monitoring and
Credit Limit Monitoring. It names fintechs as a target segment. The sandbox is self-serve today at zero
cost. And critically for section 5, its documentation says reports are "delivered directly to consumers,
thus eliminating sensitive data storage challenges for partners", which is the lowest-risk data
architecture available.

The open question is whether Equifax will contract with a company this small, and that is worth
discovering early rather than late. Which is why the sequence below starts with three free sandboxes
rather than one sales call.

### Runner-up: CRS Credit API

The most likely of any provider to actually close a deal at this size, and the one to pursue in parallel
rather than after. They complete bureau vetting on the client's behalf, publish their full vetting
checklist, offer a free sandbox **before a contract exists**, and claim two-week go-live including FCRA
onboarding. If Equifax's minimums turn out to be built for banks, CRS is the fallback that does not
require restarting.

Two caveats: their FICO 8 claim is inconsistent across their own pages, and a B2C use case requires
**cybersecurity insurance**, which is a real line item to budget.

**Also worth a free sandbox on day one:** Spinwheel and Method Financial, both of which hand out keys on
signup. Method has no FICO at all but the best developer experience and real score-change webhooks.
Spinwheel has the best public factor documentation and a live consumer-PFM reference customer. Either
would get something working in an afternoon, which is worth a great deal when the alternative is
speculating about data models.

**Not recommended: Array.** Strongest FICO signal of any intermediary, but no pre-sales evaluation at
all, channel-led distribution to banks and credit unions, and a documented restriction that may forbid
Juniper from accessing or storing the underlying data, which would void the entire integration design.

### What not to do

- **Do not use Plaid LendScore to fill the gap.** It is a cash-flow underwriting score for lenders.
  Adopting it would put Juniper in the posture of generating credit-risk scores, which is materially
  heavier than showing a member their own bureau score.
- **Do not build a score estimate from Plaid data.** A modeled number displayed as a score is the same
  failure as the 726, dressed differently.
- **Do not build a score simulator or a personalized "raise your score" plan without legal review.**
  Per section 4, `Cal. Civ. Code 1789.12(d)` prong (3) reaches "advice or assistance ... with regard to
  improving a consumer's credit record", and if the product is paid, `1789.13(a)` bars charging before
  full performance, which is structurally incompatible with a subscription. This is the sleeper item in
  the whole memo, because a score simulator looks like an obvious feature and it is the one that carries
  a $100,000 bond.
- **Do not start provider conversations before the Stage 6 privacy policy exists.** Diligence asks for it.
### Questions to ask, in writing

Pricing is behind contact sales at every provider in this memo, so asking is the only way to get
numbers. Get the first five in writing before spending time on anything else.

**Disqualifiers:**

1. **Exact FICO version and bureau, in writing.** FICO 8 or 9 or 10, and 1B or 3B. Several providers
   market "FICO Scores" and document only VantageScore. Do not accept an unversioned answer.
2. **Is FICO available on a soft inquiry?** Bloom's only documented FICO SKU is `equifax-gold-hard-fico`,
   a hard pull, which is unusable for a member checking their own score. Ask every provider this.
3. **May I display FICO 8 and VantageScore 3.0 simultaneously?** Does your FICO agreement restrict
   displaying other scores alongside a FICO score? See section 3; this is the question most likely to
   come back no.
4. **Is Fair Isaac's written consumer-disclosure approval already covered by your agreement, or must I
   obtain it separately?** Reference the consumer-disclosure restriction in the bureau End User
   Agreement. If they do not know what you are asking about, that is informative.
5. **Can I receive and store the raw data, or must I render your component?** Array's TransUnion terms
   appear to forbid client access entirely. This decides whether section 5 is buildable at all.

**Commercials:**

6. Total first-year cost at 100 members and at 1,000: platform fee, per-enrollment, per-refresh,
   per-alert, setup, minimum monthly commitment.
7. Minimum contract term. Is there month-to-month or a startup tier?
8. Is refresh priced per pull or per enrolled user per month? This decides whether daily monitoring is
   affordable or whether refresh must be user-triggered.
9. Do you require cybersecurity insurance, and at what coverage level?
10. Is a bureau site inspection required of me, and can it be virtual? See section 2; home offices are
    workable but need lockable doors, a separate business area, and permanent signage.

**Compliance division of labor:**

11. **Are you the CRA or reseller of record, or do I need my own bureau contract?** Bloom answers this
    publicly and the answer is that they are. Get everyone else on record.
12. Who handles a `1681i` dispute when a member says a tradeline is wrong?
13. Do you provide the `1681g(f)` and `Cal. Civ. Code 1785.15.1` element set as structured data: score,
    range, **up to four** ordered adverse key factors, date created, provider name, and the
    lender-may-differ statement? Or must I derive them?
14. Do you supply the consumer authorization disclosure text, must I use yours verbatim, and do you
    store the consent record or must I? (Spinwheel publishes its wording and pushes capture to the
    client. Assume that pattern.)
15. What identity verification do you run, and does any of it touch my systems? Specifically: **do you
    need the SSN, and can I pass it through without persisting it?** Section 5 depends on the answer.
16. What are your contractual retention and deletion obligations flowing to me, and what is your
    deletion API?

**Technical:**

17. Raw REST API, or hosted widget or SDK only?
18. Webhooks for score changes and new inquiries, and how are they signed?
19. Sandbox with deterministic test consumers, including thin-file and frozen-file cases?

### Rough sequence

Elapsed time is dominated by the contract, not the code. Note that step 1 costs nothing and can start
today, which is a change from how this normally gets sequenced.

| Step | Who | Duration | Notes |
| --- | --- | --- | --- |
| 1. Free sandboxes | Claude Code | an afternoon | Equifax for Developers (register the app as Type B2B2C), Spinwheel at `developer.spinwheel.io`, Method at `dashboard.methodfi.com`. All three are self-serve, no contract, no cost. This answers the data-model questions that would otherwise be guesses, before any sales conversation. |
| 2. Close the open Stage 6 gates | Finley | already outstanding | Financial-data TOS, privacy policy, security review. Prerequisites, not parallel work: provider diligence asks for the privacy policy. |
| 3. Sales conversations | Finley | 2 to 6 weeks | Equifax CES and CRS in parallel. Ask questions 1 through 5 first. Also apply to the Fintech Sandbox Data Access Residency, since Equifax is a named data partner and decisions come in 1 to 2 weeks. |
| 4. Contract and diligence | Finley plus a lawyer for one pass | 3 to 8 weeks | Security questionnaire, cybersecurity insurance, possibly a virtual site inspection. This is where a small company stalls, exactly as the Plaid Production review did. |
| 5. Build | Claude Code | 1 to 2 weeks | `api/_credit.ts`, five or six endpoints, one migration, the Credit page swap. Small, because the house pattern already exists. |
| 6. Compliance artifacts | Finley plus a lawyer | 1 to 2 weeks, overlapping step 5 | Consent disclosure, dispute routing copy, retention schedule, Safeguards program, privacy policy amendment. Plus the CSO review of any improvement or simulator copy. |
| 7. Production and launch | both | 1 week | Same shape as the Plaid production flip, with env split by Vercel environment so preview and local can never pull a real credit file. |

The code is roughly two weeks. The path to being allowed to write it is roughly three months. **That
asymmetry is the actual finding of this memo**, and it is why step 1 is worth doing now even though the
answer to "should we build this" is "not yet".
### Now or later

**Later.** Specifically: after the Stage 6 compliance gates close, and after there are enough members
that a monthly minimum is defensible. With one exception, below, that is worth doing this week.

The case for later:

- **The page is no longer lying.** That was the actual problem, and PR #131 fixed it. `credit.tsx` shows
  real utilization from real limits and says plainly that score tracking is not live. A member reading
  that page is not being misled. The urgency died with the 726.
- **Fixed cost, near-zero users.** Every provider is a contract with a platform fee and probably a
  minimum. Paying a monthly floor to show a score to a handful of members is the worst possible ratio,
  and it does not improve until there are members.
- **It is gated behind work that has not happened.** There is no financial-data TOS and no privacy
  policy yet (Stage 6, both open). Provider diligence asks for the privacy policy. Starting
  conversations before it exists means stalling in someone else's review queue, which is precisely the
  five-month failure mode Plaid Production just produced.
- **The compliance surface is real but not the blocker.** Section 4 is long, and almost none of it is
  hard at this scale, particularly with the sub-5,000-consumer Safeguards exemption and the Reg P
  annual-notice exception. It is a week of writing plus a lawyer review.
- **Members already have free alternatives.** Every member can see a VantageScore 3.0 free at Credit
  Karma and a score in most bank apps. Score display makes the Credit tab feel complete. It does not win
  a user. The wedge is the couples modeling.

**The one thing worth doing now, and it is free:** step 1 of the sequence above. Register for the
Equifax, Spinwheel, and Method sandboxes and spend an afternoon in them. No contract, no cost, no
commitment. It converts the biggest unknowns in this memo (what the data actually looks like, whether
the factor codes map onto the design, what identity data is really required) from speculation into
fact, and it does so before any money or lawyer time is spent. If the Fintech Sandbox residency
application is a fit, that is also free and Equifax is a named partner.

**The narrower case for doing the real thing sooner:** `api/_score.ts` currently has no credit input at
all, so the Juniper Score's credit-health factor (weighted 0.15) falls back to utilization or a flat
neutral 70. That is the one place the missing data degrades something other than the Credit page. The
cheap fix there is not a credit provider, it is adding the Plaid `liabilities` entitlement so utilization
is computed from reliable limits (section 1).

### What it costs to do properly

| Item | Estimate | Confidence |
| --- | --- | --- |
| Provider subscription, first year | **Unknown.** Every provider hides pricing behind contact sales. | [UNVERIFIABLE] The only published market anchors are Soft Pull Solutions at "$100 per month (includes five reports)" month-to-month plus a paid upfront inspection, and Experian Connect at $19.95 per consumer report. Neither is a direct fit. Do not budget from a guess; get two quotes. |
| Cybersecurity insurance | Required by CRS for B2C, likely by others | [VERIFIED] as a requirement, [UNVERIFIABLE] as a number |
| Bureau site inspection | Real, paid upfront by the client, 10 to 15 minutes, virtual option exists | [VERIFIED] existence and process, [UNVERIFIABLE] cost |
| Legal review: consent disclosure, dispute routing, privacy policy, FCRA posture, **CSO characterization**, and the couples question | One pass by a fintech-literate lawyer | [INFERRED] a few thousand dollars. The CSO and couples questions are the two with real money behind them. |
| Engineering | ~2 weeks | [VERIFIED] against the codebase. The house pattern makes this small. |
| Ongoing | Dispute routing support, retention purge, annual Safeguards review, quarterly watch on DFPI PRO 07-24 | [INFERRED] a few hours a month |
| **Elapsed time in someone else's review queue** | **2 to 3 months** | [INFERRED] from the Plaid Production experience in this same product |

### Open questions this memo does not close

Listed so they are not mistaken for settled:

1. **Whether FICO 8 and VantageScore 3.0 may be displayed together.** The Open Access PLA FAQ says no
   for that program; the lender-track agreement text is not public. Section 3.
2. **Whether Equifax CES, or anyone, will contract with a company this small.** Section 2.
3. **Spinwheel's actual FICO availability.** Two research passes reached opposite conclusions from their
   public docs. Section 2.
4. **Whether an aggregator shields Juniper from the bureau site inspection.** Not publicly documented.
5. **The couples sharing question.** Reasoned from statutory text, not from a case or agency statement.
6. **Vermont `9 V.S.A. 2480e`**, and whether Massachusetts `201 CMR 17.00` reimposes the written security
   program the federal exemption excuses. Both unresearched. Section 4.
7. **Whether the planned score simulator and "ways to improve" surface make Juniper a credit services
   organization.** Turns on copy nobody has written yet. Section 4.
8. **All pricing.**
