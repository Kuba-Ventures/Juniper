# Three things only a signed-in member can prove

*Written 2026-08-30. A short manual pass, with the SQL to confirm each step,*
*for the parts of #199, #201 and #214 that no automated check can reach.*

*__All three last passed 2026-08-30.__ Two bugs came out of that first run and*
*were fixed in #216: no merchant rule could be saved at all, and a corrected*
*row kept its old icon. Both were invisible to every automated check, and the*
*rule one was invisible to the preview too, because it lived in the shape of an*
*index. Re-run this whenever any of it changes.*

---

## Why this exists

Each of these was built, reviewed and shipped without its success path ever
being run against production, because running it needs a real session with real
linked banks. That is a normal gap and not a dangerous one, but it should be
named rather than assumed away, and it should not be a guessing game when
somebody finally sits down to do it.

The logic underneath all three IS covered: `check-category-precedence` decides
which of Plaid, a rule and a correction wins, and `check-member-categories`
covers the taxonomy merge. What is unproven is the wiring: that the endpoints
are reached, that the writes land, and that the Plaid sync really carries a
member's work through its upsert.

Run these in order. Each says what "right" looks like and what failure looks
like, because a check you cannot fail is not a check.

All the SQL below runs in the Supabase SQL editor on the production project.
The `WHERE` clauses filter to one member; drop the join if the account you are
testing with is the only one.

---

## 1. A budget saves and stays saved

From #199. The panel was built and its failure path was exercised; the success
path never was.

**Do:** Transactions, then the Budgets tab in the side rail. Set a limit on a
category with some spending in it. Press Save.

**Expect on screen:** the row grows a bar and reads "$X of $Y" with a Remove
link. Not "That did not save."

**Then reload the page.** The limit must still be there. This is the half that
matters: a write that succeeded and did not persist looks identical to one that
worked, until the next visit.

```sql
SELECT b.category, b.category_id, b.limit_amount, b.period, b.updated_at
FROM public.budgets b
JOIN auth.users u ON u.id = b.user_id
WHERE u.email = 'finley@qsbsrollover.com'
ORDER BY b.updated_at DESC;
```

**Right:** one row per limit you set, with `category_id` populated (migration
0024 backfilled the old ones and every write since carries it).

**Wrong:** no rows means the POST never landed. A row with `category_id` NULL
means the label is not in the taxonomy, which for a limit you just set from the
picker would be a real bug worth reporting.

---

## 2. A category correction survives a Plaid sync

From #201, and the one most worth doing. The sync upserts with
`merge-duplicates` and used to write `category_source: 'plaid'` over everything,
so a correction survived only until Plaid next touched that transaction and then
vanished with no error. The fix reads a member's corrections before the upsert
and carries them through. That has never run in production.

**Do:** correct any transaction's category by clicking its category tag.

```sql
SELECT t.id, t.merchant_name, t.category, t.category_id, t.category_source, t.updated_at
FROM public.transactions t
JOIN auth.users u ON u.id = t.user_id
WHERE u.email = 'finley@qsbsrollover.com'
  AND t.category_source = 'user'
ORDER BY t.updated_at DESC
LIMIT 10;
```

**Right:** your correction, with `category_source = 'user'`. Note the `id` and
the category.

### Now make the sync actually touch that row

This is the part that needs care. A sync only rewrites transactions Plaid
returns in `added` or `modified`, so a settled charge from three weeks ago will
sit untouched and "it survived" would prove nothing at all.

Two ways to get a real test, in order of preference.

**Either** correct a **pending** charge and wait for it to post. Plaid returns a
settling transaction in `modified`, which is exactly the path that used to eat
corrections. Slower, and the most faithful test there is.

**Or** force one item to replay its history, which pushes every one of its
transactions back through the same upsert immediately:

```sql
-- Pick the item your corrected charge belongs to.
SELECT i.item_id, i.institution_name, i.transactions_cursor IS NOT NULL AS has_cursor
FROM public.plaid_items i
JOIN auth.users u ON u.id = i.user_id
WHERE u.email = 'finley@qsbsrollover.com';

-- Clearing the cursor makes the next sync re-fetch that item's transactions and
-- send them all through the upsert. Safe: the upsert dedupes on
-- plaid_transaction_id, so nothing is duplicated. It does re-download that
-- item's history, so do one item, not all seven.
UPDATE public.plaid_items SET transactions_cursor = NULL WHERE item_id = 'PUT_ITEM_ID_HERE';
```

Then trigger the sync: **Settings, Developer, "Refresh data now"** (the control
is behind `DEVELOPER_EMAILS`, falling back to `ADMIN_EMAILS`).

**Re-run the first query.**

**Right:** the same row, same category, still `category_source = 'user'`, and
its `updated_at` has moved (proving the sync rewrote it and preserved the
correction rather than skipping it).

> **Confirmed 2026-08-30.** Chase's cursor was cleared and its whole history
> replayed. All seven Chick-fil-A rows came back stamped with one identical
> `updated_at`, so every one of them went through the upsert: six stayed
> `rule`, one stayed `user`. That is the correction surviving, the rule
> surviving, and the correction outranking the rule, all on the path that used
> to eat corrections before #201.

**Wrong:** the row is gone from the `user` list, or its category is back to
Plaid's guess. That is the exact bug #201 set out to prevent, and it means the
override read in `transactions-sync.ts` is not doing its job.

Also check the logs for the loud line the sync writes when it cannot read
overrides at all:

> `[plaid] could not read category overrides for <uid>`

---

## 3. A merchant rule, end to end

From #214. Nothing has ever written `category_source = 'rule'` in production.

**Do:** correct a charge from a merchant you have several of. Accept the offer
that appears under it: "Always use X for Y". **Note the number it reports.**

```sql
SELECT r.merchant, r.category, r.category_id, r.created_at
FROM public.merchant_rules r
JOIN auth.users u ON u.id = r.user_id
WHERE u.email = 'finley@qsbsrollover.com';

-- Substitute the merchant the rule names.
SELECT t.category, t.category_source, count(*)
FROM public.transactions t
JOIN auth.users u ON u.id = t.user_id
WHERE u.email = 'finley@qsbsrollover.com'
  AND t.merchant_name ILIKE 'PUT_MERCHANT_HERE'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

**Right:** the rule row exists, and the count of `rule` rows equals the number
the screen reported. Any `user` rows for that merchant are untouched: a
correction is a statement about one charge and outranks a rule about the
merchant.

**Wrong:** the reported count and the `rule` count disagree, which would mean
the retroactive PATCH matched differently from what was reported. Zero `rule`
rows with a rule present means the backfill failed, and the endpoint logs
`[rules] retroactive apply failed`.

### The precedence check, which is the interesting half

With the rule in place, correct **one** charge from that same merchant to
something else. Then sync again (step 2's method).

**Right:** that one charge stays `user` with your category, while its siblings
stay `rule`. If the rule overwrites it, the more-specific-wins rule is not
holding and `_category-precedence.ts` is not being consulted where it should be.

---

---

## Known: the Settings refresh button

The "Refresh data now" control in Settings did not appear to do anything, while
the one on Connections did. Both call the same `syncFinances()`, but Settings
went through `runBackgroundSync()`, which swallows every error and returns an
in-flight promise rather than starting new work. It reported "Done" either way.
It calls `syncFinances()` directly now and says what happened. Use the
Connections button if the Settings one still misbehaves, and say so.

---

## What to do with the results

If all three pass, delete nothing: this file is the script for the next time any
of it changes. Note the date it last passed at the top.

If any fail, the failure signatures above name the file to look in. None of
these need a rollback: a budget that did not save, a correction that reverted
and a rule that did not apply are all recoverable by the member repeating the
action once the bug is fixed.
