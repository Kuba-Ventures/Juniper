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

`/transactions/recurring/get`, **entitled under Transactions**, which Juniper
already requests. No extra product, no relink, no consent change. This was worth
confirming before anything was built, because the obvious assumption is that
subscription detection is its own paid tier.

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
