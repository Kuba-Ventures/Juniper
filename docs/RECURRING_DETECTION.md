# Recurring detection: what Plaid can tell us, and what only the member can

*Written 2026-08-28, alongside the first shipped version of the Recurring panel.*
*Companion to `docs/CREDIT_PROVIDER.md`. Treat the API findings as settled and
do not re-research them; the competitor survey has a stated gap, noted at the end.*

---

## 1. The short version

Plaid detects recurring streams and tiers its own confidence in them. It has no
place to store a member's correction, because the field that used to do that is
deprecated. So the architecture that falls out is not a choice we made freely:

> **Plaid is the candidate generator. Juniper owns the confirmation layer.**

Everything below is the evidence for that, and the design rules that follow.

---

## 2. What Plaid gives us

`/transactions/recurring/get`, which is a **separate Plaid add on**,
`recurring_transactions`, and not entitled under Transactions.

> **Corrected 2026-08-28.** This section previously said the endpoint was
> entitled under Transactions, so no extra product and no consent change were
> needed. Production disproved it the first time the sync ran: every item came
> back 400 `INVALID_PRODUCT`, "client is not authorized to access the following
> products: [\"recurring_transactions\"]". The add on was requested that day and
> is pending approval. The obvious assumption, that subscription detection is
> its own tier, was the right one.
>
> Two consequences once it is granted. `api/plaid/link-token.ts` should add
> `recurring_transactions` to `additional_consented_products`, but **not before**,
> because naming an unentitled product there makes `/link/token/create` fail for
> everyone. And items linked before that change may need a relink to consent to
> it, the same way Investments did in #144.
>
> **Both of those consequences were wrong, and acting on the first one broke
> linking for every member for a day. See the correction below before touching
> `additional_consented_products`.**
>
> Until then `api/plaid/recurring-sync.ts` recognises the refusal, stops after
> the first wave of calls, logs one warning rather than one error per
> institution, and answers 200 with `available: false`. It deliberately writes
> nothing at all in that state: an unentitled run produces no streams, and no
> streams through the stale-stream delete would wipe the member's cached list on
> the strength of a permissions error.

> **Granted 2026-08-31, and the consent change that followed it was a mistake.**
> Plaid approved the `recurring_transactions` add on. `additional_consented_products`
> was then set to `["investments", "recurring_transactions"]` (#221), and **Plaid
> rejected every `/link/token/create` for the next day** with 400
> `recurring_transactions is not a valid product for this field`. No member could
> connect a bank. #234 removed it; the field reads `["investments"]` and must stay
> that way. **Read the correction at the end of this section before changing it.**
> Nothing else in the code changed, and deliberately so: `recurring-sync.ts` decides availability from
> what Plaid answers at runtime, so an entitled client simply stops taking the
> refusal path, and the panel it feeds has always rendered whatever streams the
> cache holds. Three things are therefore true and unverified until somebody
> checks them against production, in this order:
>
> 1. `/link/token/create` still succeeds. This is the one change that can break
>    linking for **everyone**, so it is worth checking before anything else. A
>    real link token from a signed-in session is the check that counts; the
>    unauthenticated probe answers 401 either way, so it proves the function is
>    alive and not that Plaid accepted the product list. A refusal appears
>    server-side as `[plaid] link/token/create failed`.
> 2. A sync returns streams rather than `available: false`. The seven production
>    items were all linked before this change, so under Data Transparency
>    Messaging some or all of them may keep refusing until they are put back
>    through Link in update mode. A partial answer is the expected shape here
>    rather than a bug, because the sync degrades per item.
> 3. Sandbox is a separate entitlement question. Preview and local run on the
>    Sandbox secret, so if that environment refuses the product then
>    `/link/token/create` fails on every preview deploy while production is
>    fine. Check a preview link before assuming the change is safe everywhere.

> **Corrected 2026-09-02, and this is the paragraph to read.** All three checks
> above were answered, and the first one failed.
>
> **`recurring_transactions` is not a value `additional_consented_products`
> accepts, entitled or not.** That field takes the same enum as `products`, and
> `recurring_transactions` is not in it: it is an **add on to `transactions`**,
> entitled on the Plaid ACCOUNT and read through `/transactions/recurring/get`.
> There is no link-time consent value for it, and none is needed, because
> consenting to `transactions` is the whole requirement and `plaidProducts()`
> already requests it.
>
> So the "not before" rule above predicted the right failure for the wrong
> reason. It guarded against naming an UNENTITLED product; the entitlement had in
> fact been granted, and the field refused the value anyway. Between #221 on
> 2026-08-31 and #234 on 2026-09-01, `/link/token/create` returned 400 for every
> caller and **linking was broken for every member for about a day**. What hid it
> for that long was client copy, not the API: `createLinkToken()` collapsed every
> failure to null and the caller rendered "Account linking isn't enabled yet",
> which is only true for a 503, so a hard rejection read as a feature flag.
> #234 fixed both halves.
>
> The second consequence was wrong too: **the seven existing items did not need
> relinking.** A sync on 2026-08-31 at 14:34:29 returned 200 with no refusal
> warning and the member's card populated, so an item linked long before the add
> on was granted serves recurring detection with no consent change at all. That
> is the same conclusion the first point forces, from the other direction.
>
> Linking has been proven recovered rather than assumed: a Chase item was linked
> at **2026-09-01 15:07 UTC, 32 minutes after #234 merged**, which is a real link
> token from a signed-in session through the corrected list. All seven items
> carry a null `last_error_code`.
>
> **If you are here to add a product to a consent list:** the only values that
> field takes are Plaid products. An add on is entitled in the Plaid dashboard
> and needs nothing at link time.

The response splits `inflow_streams` and `outflow_streams`. Per stream:

| Field | What it is | Why it matters here |
|---|---|---|
| `status` | `MATURE` / `EARLY_DETECTION` / `TOMBSTONED` / `UNKNOWN` | Plaid's own confidence tier. `MATURE` means three or more occurrences (two for an annual). `TOMBSTONED` means an expected date passed and nothing arrived. |
| `predicted_next_date` | Next charge date | **Nullable by design.** Plaid documents it as set "only if the next payment date can be predicted". |
| `average_amount` / `last_amount` | Two separate figures | Different questions: what to budget, versus what actually came out. |
| `transaction_ids` | The backing charges | Drill-down is free, no second call. |
| `frequency` | `WEEKLY` … `ANNUALLY` / `UNKNOWN` | `UNKNOWN` cannot be normalized to a monthly figure. |
| `is_user_modified` | **DEPRECATED** | See below. This is the load-bearing finding. |

### The deprecated field is the whole architecture

Plaid's docs state that the ability to modify transaction streams has been
discontinued. There is therefore **no upstream home for a member's correction**.
A rename, a corrected amount, a "no, this is not a subscription" cannot be sent
to Plaid, and anything we stored on their side would not survive the next
detection run.

Hence two tables (migration `0016_recurring.sql`):

- `recurring_streams` is a **cache**. Overwritten on every sync, holds no member
  intent, can be dropped and rebuilt at any time.
- `recurring_overrides` is the **member's layer**. Keyed by Plaid's `stream_id`,
  reapplied over the cache on every read.

A revert **deletes** the override row rather than flagging it. Reverting has to
restore the not-yet-reviewed state exactly, and "no row" is what that state is.

---

## 3. What the incumbents do

### Monarch: quarantine until approved

A "Recurring Review" flow, shipped as beta. Detections sit behind a badge and a
banner until the member approves them; dismissing is phrased as "Mark merchant
as not recurring". Expected-versus-actual is **tri-state**:

- green, paid as expected
- **amber, paid but at a different amount than expected**
- red, missed

Overrides are revertible ("Revert back to original balance").

### Rocket Money: auto-commit

Detections are committed automatically and swept to "Inactive" after one missed
month, with no documented way to dismiss an auto-detected item. There is a user
report of exactly the harm that shape produces: hit by an unexpected bill
because it was never flagged, with no way to mark it recurring.

### The gap nobody has filled

**No product surveyed surfaces the confidence tier at all.** Plaid ships
`EARLY_DETECTION` in the API and no consumer app was found rendering the
distinction, in that language or any other. No product uses literal "possible
subscription" copy either. This is an open design opportunity rather than a
settled convention, which is why the copy here was written rather than borrowed.

---

## 4. The rules that follow

These are implemented in `api/subscriptions.ts` and
`components/juniper/subscriptions-panel.tsx`. Each one exists because of a
specific finding above.

1. **Nothing counts until the member confirms it.** `summary.monthly` totals
   confirmed outflows only. What is waiting is reported beside it as
   `monthlyUnreviewed`, never inside it. *(Monarch's shape, not Rocket Money's.)*

2. **`EARLY_DETECTION` never renders as fact.** It reads "Possible, not enough
   history yet". A guess presented as a fact about someone's money is the
   failure mode the whole panel is shaped to avoid.

3. **Render "paid, not the amount we expected" as its own state.** Silently
   updating the stored amount, which is the easy implementation, hides exactly
   the price rise a member opens this screen to find. Flagged only when the move
   clears **both** 5% and $1, so a 4% utility swing and a 12% move on a $2 charge
   both stay quiet and the state keeps meaning something.

4. **No next-charge date when Plaid gives none.** Never derived from the
   cadence. An invented date on the one screen that tells a member what is about
   to leave their account is worse than no date.

5. **A stream with `UNKNOWN` frequency is listed but not counted**, and the
   omission is stated on screen. Defaulting it to monthly would quietly add an
   annual charge to every month.

6. **Overrides are the member's and are revertible.** Undo on any decision,
   including a dismissal.

7. **Stale streams are deleted only when every item synced cleanly.** Deleting
   on behalf of an item that errored would wipe a member's whole list because
   one bank was briefly down. Overrides are never deleted by a sync, so a stream
   that reappears comes back already confirmed.

---

## 5. Deliberately not built yet

- **Cancellation.** Stage 9 in `ROADMAP.md` already records the reality check:
  "one-click cancel everywhere" is not an API. Incumbents use human concierge
  plus partner integrations behind that button. Nothing here promises it.
- **Price-rise history.** We store the last amount and the average, so a rise is
  visible the month it happens, but there is no per-stream amount history yet.
- **Feeding confirmed subscriptions into the Juniper Score.** Tempting, and
  premature: the score already had one factor invented for it (see the flat-70
  credit factor removed in #146), and this one needs a member's confirmations
  behind it before it means anything.

---

## 6. Research still owed

The competitor survey behind section 3 covers Monarch and Rocket Money properly.
**Confirmed not covered:** Chase, Amex, Capital One (Eno), Wells Fargo,
Discover, Bank of America, Revolut, Monzo, Starling; Copilot, Simplifi, YNAB,
Mint, **Credit Karma**, Emma, Empower.

Credit Karma in particular was in the original ask and is not covered.

Notes for whoever picks it up: `help.monarch.com` returns 403 to both WebFetch
and curl, but its Zendesk API answers
(`/api/v2/help_center/articles/search.json?query=...`). `r.jina.ai` defeats the
403 on most other help centers. Reddit is blocked to the search crawler; Canny
works.
