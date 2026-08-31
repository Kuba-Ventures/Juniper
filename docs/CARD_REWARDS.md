# Card rewards on the Credit page

**Status:** #168 shipped and live (migrations 0031 and 0032 applied 2026-08-31). #211, setting a limit
the bank does not report, is built behind migration 0033.
**Date:** 2026-08-31
**What it is:** the four things #168 asked for, in Juniper's own design system: identify which card each
linked account is, a per-category rewards earning guide, a benefits tracker, and recommendations.
**Design record:** `design/card-rewards-variants.html`, three rendered treatments. Treatment A
(stacked sections, closest to the Credit Karma screenshots on the issue) was chosen.

## The one-paragraph version

Plaid does not know which card product a linked account is, and no product Juniper integrates returns
rewards terms. So the member confirms their card against a hand-curated catalog, and every rate in that
catalog carries a source URL and a read date, with `verified = FALSE` until a human has re-checked it.
The arithmetic lives in one pure module (`api/_rewards.ts`) exercised by 54 cases in
`scripts/src/check-rewards.ts`. Nothing on the client does rewards maths, nothing infers which card
somebody holds, and any figure that compares a points card against a cash-back card carries the house
cents-per-point assumption on screen.

## Why this needed a catalog

**[VERIFIED] Plaid returns no rewards data.** `liabilities` returns APRs, credit limits and payment
data for a card. It does not return earn rates, bonus categories or benefits. Nothing in
`PLAID_PRODUCTS` (currently `transactions`) comes close.

**[VERIFIED] Plaid does not identify the product either.** `/accounts/get` returns `name`,
`official_name`, `mask`, `type` and `subtype`. On this member's real production data the credit
accounts come back as generic names. Credit Karma knows the product because it reads a credit report,
where the tradeline carries the issuer's product name; Juniper reads an aggregator, which does not.

**[INFERRED] There is no free API for card rewards terms.** Every source found is either a paid
affiliate feed (which would tie the rate data to a monetization relationship Juniper does not have and
is not cleared for) or a scrape. A curated table with provenance columns is the honest option at this
scale.

## The three rules the schema enforces

The Credit page was rewritten once already, in #131, to strip a fabricated 726 score, a fabricated
eight-month trend and fabricated bureau factor rows that had all been presented as the member's own. A
rewards rate is the same trap wearing a different hat: it reads as a fact and it is really a snapshot
of a marketing page that changed last Tuesday. So three rules are enforced in migration 0031 rather
than left to whoever writes the next seed.

**1. No rate and no benefit exists without provenance.** `source_url` and `as_of` are `NOT NULL` on
`card_products`, `card_product_earn` and `card_product_benefits`. A row that cannot say where it came
from cannot be inserted, so it can never be drawn.

**2. Nothing infers which card a member holds.** `api/_rewards.ts` `rankCandidates` orders the picker
and there is no threshold anywhere that promotes a guess into a stored row. `member_cards.product_id`
is written only by `POST /api/member-cards`, from a tap. A wrong guess attaches a stranger's reward
rates to somebody's real spending and then quotes a confident dollar figure off it, and nothing on
screen would look wrong.

**3. A points card's value is an assumption, not a rate.** Comparing "3x points" against "1.5% cash
back" is impossible without saying what a point is worth. The assumption is stored per product
(`card_products.point_value_cents`), travels with every figure that used it
(`ResolvedRate.assumesPointValue` through to the `cr-assume` chip), and the chip names the number
rather than gesturing at it. Credit Karma's own Cards Optimizer sidesteps this by showing "3x points"
and never comparing across currencies, which is how it avoids owing the disclosure. Juniper compares,
so Juniper owes it.

Rule 3 is the one most likely to be quietly dropped by a later change. If a caller stops threading
`assumesPointValue` out to the surface, the page starts presenting a house valuation as though the
issuer published it, and `check-rewards.ts` has a case asserting the flag is set exactly when the rate
needed the valuation.

### On the one valuation in the seed

The only points card seeded is Chase Sapphire Preferred, at 1.25 cents. That figure is not plucked from
the air: it is the rate Chase itself publishes for redeeming Sapphire Preferred points through Chase
Travel ("25% more value"), so it is the most defensible floor available for a card whose points can
also be transferred for more. Transfer-partner redemptions routinely beat it, which means every
comparison it drives is conservative in the member's favour. `ratePct` also falls back to one cent for
a points rate with no stored valuation, which understates rather than flatters, so a comparison that
survives the fallback is still true at any higher valuation.

## Card art

**Juniper does not ship issuer card art, and will not.** Those images are trademarked and licensed;
Credit Karma pays for the ones in the screenshots on #168. A card face is synthesized from two things
Juniper legitimately has:

- the product's stored `brand_color`, which is a colour rather than a mark, and
- the institution's own logo as served by Plaid, which this app is already licensed for through its
  Plaid agreement and already renders on Connections and on the Credit card rows.

The logo resolves through `resolveInstitutionMark` in `lib/institution-brand.ts`, the same chain every
other surface uses, so there is one fallback ladder. The face is deliberately the only place on the
page that resolves a mark and returns `null` rather than falling through to a monogram: the face
already carries the brand colour and the product name, and a monogram letter on top of both would be a
third mark in one small box.

A card the member has not identified is drawn as an outline, not a colour. There is no brand to borrow
yet, and borrowing one would make an unanswered card look answered.

## Architecture

```
api/_rewards.ts          pure, I/O-free: rates, caps, guide, switch ideas, upgrades,
                         card matching, benefit period keys
api/card-rewards.ts      GET, the whole surface in one request
api/member-cards.ts      POST / DELETE, the member's answer about which card is which
api/card-benefits.ts     POST / DELETE, the benefits checklist
scripts/src/check-rewards.ts   54 cases, no database, no Plaid, no session

src/lib/cards.ts                          transport, types, useCardRewards()
components/juniper/card-rewards-bits.tsx  card face, assumption chip, provenance note
components/juniper/card-identify.tsx      the prompt and the picker
components/juniper/rewards-guide.tsx      hero and the earning guide
components/juniper/benefits-tracker.tsx   the checklist
components/juniper/card-switches.tsx      worth switching, and cards that would beat yours
pages/app/credit.tsx                      wiring
```

**One GET, not four.** The alternative is separate catalog, confirmation, guide and benefit endpoints,
four round trips before the page draws anything, and three of them repeating the same three joins. The
payload is small only because the catalog is small: **the moment the catalog passes a few hundred
products, `catalog` has to come out of that response and become its own searchable endpoint.** It is
listed last in the response and the picker's client-side filter says the same thing.

**Three fetches on the Credit page, and each earns its place.** `fetchPlaidItems` for the balances and
limits the utilization card needs, `fetchInstitutionLogos` for the marks (separate by design so it can
be cached per institution and fail silently), and `/api/card-rewards`, which needs the member's
taxonomy, their per-account spend and the catalog joined together. Collapsing them means widening the
`/api/finances` rollup with `limit` and with per-account spend, which is the follow-up this page has
been waiting on since #132 and is deliberately not attempted here.

**Standing house-rule exception, widened by one endpoint.** `CLAUDE.md` routes money features through
the `lib/finances.ts` seam. The Credit page already documents why it does not: the `/api/finances`
account rollup carries name, institution and balance only, and utilization needs each card's `limit`.
This surface needs that plus per-**account** spend, because "your groceries are on the wrong card" is a
statement about one account rather than about a total.

### Two things reused rather than reimplemented

`coveredDays`, `isoDaysAgo` and `WINDOW_DAYS` are now exported from `api/_finance-snapshot.ts` and used
by `/api/card-rewards`. That divisor turns observed category spend into an annual figure that a dollar
recommendation is quoted off, so a window that overstates the history overstates the advice. One
definition, not two: this is the exact bug `_finance-snapshot.ts` already had once, where a fixed
90-day window over three weeks of history divided every monthly figure by three.

Spend classification goes through `taxonomyFor(uid)` and applies the same three rules `/api/finances`
does: transfers are dropped entirely, income is not spending, and spending is summed **signed** so a
refund reduces its category. Dropping transfers matters more here than it looks: without it, a credit
card payment would be spending in the "Credit card payment" category and the page would end up
recommending a card for paying off a card.

## The benefits tracker, and what Juniper refuses to detect

**Nothing is ticked automatically, on purpose.** It would be tempting to tick a $50 hotel credit off a
matching hotel charge. It would be wrong: the charge proves a hotel was paid for, not that the issuer
applied the credit, and those arrive weeks apart. An automatic tick that is sometimes wrong is worse
than no tick at all, because the member stops trusting the list and stops checking.

**Periods are calendar periods, and the page says so.** A good share of real card credits reset on the
**cardmember year**, the anniversary of the account opening. Plaid's `transactions` product does not
return an account's open date, so a calendar year is the only bucket Juniper can compute. Presenting it
as the issuer's own reset date would be a small lie that costs somebody a $120 credit, so the tracker
is framed as the member's own checklist and names the period it is using.

**`period_key` is what makes a recurring credit reset with no cron job.** `2026-08` monthly, `2026-Q3`
quarterly, `2026` yearly, the literal `once` for a one-time credit. Next month the key changes, no row
matches, the benefit is unticked again. The key is computed server-side and **never accepted from the
client**: a client-supplied key could tick a period that has not happened yet, leaving a monthly credit
reading as already used for the rest of the year with no way for the member to work out why.

A benefit with no dollar figure (lounge access, primary rental coverage) is counted and tickable but
never summed, and `BenefitSummary.valuePartial` makes the surface say the total is partial rather than
assigning a guess.

## Recommendations, and why only one of the two is an offer

**Worth switching** compares cards the member already holds. Both rates have a source, the spend is
their own, and acting on it costs them nothing: no application, no hard pull, no affiliate link, so
none of the compliance work gating the marketplace applies. This is what #168's "maybe a better gas,
travel or everyday rewards" is really asking for, answered from what they already have.

**Cards that would beat yours** names catalog cards they do not hold and **carries no URL**. Every
affiliate link in this product is a placeholder until approved programs and category-specific credit
disclosures clear (ROADMAP Stage 5, the compliance note in migration 0010), and a credit-card
application is the category where that matters most: `CREDIT_PROVIDER.md` section 4 records that a paid
credit-offer marketplace is the "with respect to the extension of credit by others" element of the
credit-services statutes, which in California alone means DOJ registration and a $100,000 bond.
`UpgradeIdea` has nowhere to put a URL and `check-rewards.ts` asserts that, so a later change cannot
quietly add one.

**The annual fee is subtracted before a card is named at all.** A card earning $180 more a year on a
$250 fee is a worse card, and showing the $180 alone would be the most expensive half-truth on the
page. `grossGain` and `netGain` are separate fields, only `netGain` gates inclusion, and the UI always
prints both.

## Known limitations, recorded rather than hidden

**Discover it Chrome's cap is modelled twice.** It caps gas and restaurants at $1,000 per quarter
**combined**, and `card_product_earn` caps per row, so two rows each carrying $1,000 overstate the earn
for somebody who spends heavily in both. The `note` on both rows says the cap is combined, so the fine
print on screen is right even where the arithmetic is optimistic. A shared-cap column is the fix if a
second card ever needs one; one card did not justify the schema.

**Rotating categories are not modelled as rates.** Freedom Flex and Discover it rotate their 5%
quarterly and require activation, so there is no fixed category to store. They are seeded with their
fixed rates only, and the rotation appears where it is actionable: as a quarterly benefit in the
tracker.

**Portal-only rates are excluded.** Freedom Unlimited earns 5% on travel booked through Chase Travel;
the member's Travel category is whatever they booked wherever they booked it. Crediting the card 5% on
all of it would invent a booking channel they never used.

**Signup bonuses are excluded.** One-time, constantly changing, and unearnable by somebody who already
holds the card, which is this surface's entire audience.

**The catalog is 18 cards** (0032 seeded 10, 0034 added 8). Common US cards, not all of them, which is
why "my card is not listed" is a first-class answer stored as a row rather than a dismissal.

### 0034 corrects an assumption 0032 made about understating

0032 said excluding a rate "understates rather than flatters" and treated that as the safe direction.
It is not, for a card the member **already holds**. `switchIdeas` compares the card they used against
the best card they own, so a held card recorded at 1% when it really earns 2% produces advice to move
spending **off** it. Understating is safe when deciding whether to recommend a new card and unsafe when
describing an existing one, and this surface does both.

So 0034 established the rule: a card whose **headline** earning cannot be represented by
`card_product_earn` is left out of the catalog entirely rather than added with only the rates that fit.
Apple Card (2% is conditional on Apple Pay, a payment method rather than a category), Bilt (rent needs
five transactions that month), Citi Custom Cash and BoA Customized Cash (the 5% or 3% category is
chosen or derived per cycle) are all absent for that reason. Sapphire Reserve and Amex Gold are absent
for a different one: their annual fees have moved recently and `upgradeIdeas` subtracts the fee, so a
stale figure there inverts the recommendation rather than merely blurring it.

A card that is absent is not a dead end. The picker offers "My card is not listed", it is stored as a
real answer, and the member simply gets no rewards claims for that card. No claim beats a wrong claim.

**Student and legacy names get their own rows.** Quicksilver Student earns the same 1.5% as Quicksilver,
so no figure would have been wrong, but this surface exists to name the member's card correctly and
offering a card that is not the one in their hand is exactly its wrong failure. SavorOne is in for the
same reason: it is what Capital One called the card before the rename and it is still printed on plenty
of cards in circulation.

**The limitation this makes sharper.** Rotating-category cards carry only their fixed rates, so during a
quarter when a member's rotating 5% is live the guide understates that card and may suggest moving spend
away from it. The rotation appears as a quarterly benefit in the tracker, which is where it is
actionable. Fixing it properly needs a per-quarter category table somebody maintains four times a year.

## Setting a limit the bank does not report (issue #211)

**Design record:** `design/credit-limit-variants.html`, three treatments, A chosen (the control sits
inline on the row that states the gap).

Plaid returns `balances.limit` only when the issuer sends it, and plenty do not. On this member's real
production data Chase reports $9,000 while Capital One and Discover report nothing, so utilization was
computed from one card of three and the page said so. The limit is printed on their statement, so they
can supply it. `member_cards.credit_limit` holds it (migration 0033).

### The two rules

**A limit the member typed is never drawn like one the bank reported.** It carries a "You set this"
badge on the row, and the utilization figure states how many of its limits came from the member. One is
a fact and the other is a claim; a percentage mixing them is only as good as the claim, and a member
who has forgotten they set one would otherwise have no way to know the figure rests on it.

**It never reaches the Juniper Score.** `api/_finance-snapshot.ts` computes `creditUtilization` from
`plaid_items` only and carries a comment saying not to join `member_cards` in. Otherwise anybody could
raise their own Score by typing a generous number, with nothing on screen to show why it moved. A
member whose only limits are self-reported correctly gets an unmeasured credit factor and the
renormalized weights #146 built, rather than a flattering one.

### Three things that were not obvious

**`product_answered` had to exist.** #168 read "a row exists for this account" as "the member has
answered which product this is", which was sound while a row could only be created by answering.
`product_id IS NULL` is itself a real answer there ("not in your catalog"), so row existence was the
only thing separating that from "never asked". Once a row can be created purely to hold a limit, the
inference breaks in the worst direction: the Identify prompt would decide the member had answered and
stop asking. `DEFAULT TRUE` is why 0033 needs no backfill, since every row predating it came from a
product answer.

**Every write in `api/member-cards.ts` moved off `merge-duplicates`.** That upsert replaces the row
rather than patching it, and `member_cards` now holds two independent facts, so saving a product answer
would have wiped a limit and vice versa, silently. Restating every column on each write is the other
fix and it is the fragile one: correct only until somebody adds a third column and forgets.
`patchOrInsert` patches what it names, and its `insertOnly` argument is what lets a limit create a row
without claiming the product question was answered.

**`forget` no longer deletes the row unconditionally.** "Change which card this is" would otherwise
discard a limit the member had set on the same card. It now clears the product answer and keeps the
row when a limit is present.

### The control is offered only where there is something to answer

A card whose bank reports a limit gets no "set your own" affordance. `limitOf` gives the bank's number
precedence, so a member limit on such a card would be stored and change nothing on screen, which is
worse than an absent control. Written as explicit precedence rather than `??` so that if an issuer ever
starts reporting a limit for a card the member had already answered for, the bank's number takes over:
it is the fact, and theirs was a stand-in for its absence.

### Not verified

- **`product_answered` has not been exercised against a database.** It is the highest-risk item here:
  if setting a limit on an unidentified card wrongly marked it answered, that card would silently drop
  out of the Identify queue and never get its rewards data. The logic and the `DEFAULT TRUE` are the
  guard; nothing has run against Postgres.
- **The server's number parsing is only exercised by a stub.** The field accepts "$8,000" and the
  server strips `$`, commas and whitespace, rejects non-numbers and anything over 10,000,000, and
  rounds to cents. The browser check used a stub mirroring that regex, not the endpoint.
- **`credit_limit_set_at` is stored and not yet shown.** A limit goes stale when an issuer raises one
  and Juniper will never hear about it, so the column is there for a "you set this in August" line that
  is not built.

## Ops to activate

1. Apply `supabase/migrations/0031_card_products.sql` (tables, RLS, grants).
2. Apply `supabase/migrations/0032_card_products_seed.sql` (10 products, 18 earn rows, 36 benefits) and
   `0034_card_products_variants.sql` (8 more products, taking the catalog to 18 products, 31 earn rows,
   50 benefits).
   `ON CONFLICT DO NOTHING`, not `DO UPDATE`, so a re-run cannot overwrite a row somebody has verified
   by hand and reset its `as_of` to a date nobody checked. Correcting a seeded row is a later migration
   that names it.
3. Apply `supabase/migrations/0033_member_card_limit.sql` (#211: `credit_limit`,
   `credit_limit_set_at`, `product_answered` on `member_cards`). No backfill statement, because
   `product_answered DEFAULT TRUE` is already correct for every row that predates it.
4. Nothing else. The endpoints degrade to "no cards identified yet" when the tables are absent, which
   renders the same prompt a new member sees, so a deploy that lands ahead of the migrations is safe.

**A deploy landing ahead of 0033 is safe, but only because it is handled explicitly.** PostgREST
rejects the whole select on one unknown column, and the generic `rows()` helper turns any failure into
an empty array, so the naive version of this would have been worse than quiet: with no confirmations,
every card looks unidentified, and a member who had already identified their cards would find them back
in the Identify queue with their rewards data gone. `readConfirmations` therefore requests the #211
columns as optional and retries without them, the same shape as the per-item health columns in
`api/plaid/accounts.ts`, and defaults `product_answered` to TRUE when absent because every row
predating 0033 came from a product answer.

## Not verified

- **Nothing has run against a real database.** The pure module has 54 cases and the components were
  checked in a browser against a fixed payload, in light and dark. The SQL has not been applied
  anywhere and no endpoint has been called with a real session.
- **No rate in the seed has been checked against an issuer page.** That is what `verified = FALSE`
  records and what the on-screen note says. Verifying the 10 products is an afternoon with 10 tabs
  open, and it is the highest-value follow-up here.
- **The `member_cards` upsert uses `merge-duplicates`**, which replaces the row rather than patching
  it. Both mutable columns are sent, so it is correct as written, but it is the same trap the
  categories PATCH and the recurring override upsert both carry, and a third column added later must be
  sent too.
- **PostgREST NUMERIC coercion is defended but unproven.** `Number()` is applied to every numeric
  column read from the catalog, because PostgREST hands NUMERIC back as a string in some
  configurations and a string multiplier would make every rate `NaN` in silence. Whether this project's
  PostgREST actually does that has not been observed either way.
