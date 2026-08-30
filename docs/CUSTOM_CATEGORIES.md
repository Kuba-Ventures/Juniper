# Custom categories: moving the taxonomy from code into per-member data

*Written 2026-08-30, after #201 shipped per-transaction re-categorization.*
*Companion to `docs/RECURRING_DETECTION.md`. This is a plan, not a record: the*
*sections marked **Decision** are settled, the ones marked **Open** are not.*

---

## 1. The short version

A member can now correct a transaction's category (#201). They cannot invent one.
The vocabulary is 11 groups over 46 leaf categories, fixed at build time in
`api/_categorize.ts`, and Monarch, the app members compare Juniper to, lets
people create categories and groups of their own.

The work is not the picker and it is not the table. It is this:

> **`_categorize.ts` is a pure module with synchronous lookups, called about
> twenty times across six endpoints, several of them inside per-transaction
> loops. Per-member categories mean every one of those paths has to load the
> member's taxonomy before it can classify anything.**

And underneath that, one decision that cannot be deferred:

> **Three tables store a category as a TEXT label. Renaming a category breaks
> every row that points at it. Either renaming does a fan-out UPDATE, or the
> label becomes an id.**

Everything below is the evidence and the sequencing.

---

## 2. What exists today

### The taxonomy

`api/_categorize.ts` exports `CATEGORY_GROUPS`, an ordered array of 11 groups.
Each carries a `kind` of `spend`, `income`, or `transfer`, and a list of leaf
categories. Two derived maps (`GROUP_KIND`, `CATEGORY_GROUP`) are built once at
module load, and four functions read them:

| Function | Answers | Called from |
|---|---|---|
| `categorize(primary, detailed)` | Plaid's category becomes a Juniper leaf | transactions-sync, recurring-sync |
| `groupOf(category)` | which group a leaf rolls into | finances, transactions, subscriptions |
| `kindOf(category)` | spend / income / transfer | finances, transactions, `_finance-snapshot` |
| `isGroupLabel(label)` | is this a group rather than a leaf | finances (budget resolution) |

Two properties of that module are load-bearing and easy to lose:

1. **Groups are derived at read time and never stored.** That is what let the
   vocabulary widen in #136 without a migration.
2. **A group label resolves to itself.** Rows written before #136 were stored at
   group precision, and they still land correctly because `groupOf("Housing")`
   returns `"Housing"`.

### Everything that reads it

Six endpoints import the module, about twenty call sites:

- `api/finances.ts`, the dashboard rollup, and budget resolution
- `api/transactions.ts`, the row list, the range rollup, the `WRITABLE_LABELS`
  validation and the `taxonomy` payload added in #201
- `api/_finance-snapshot.ts`, **the Juniper Score's inputs**
- `api/plaid/transactions-sync.ts`, classification on ingest
- `api/plaid/recurring-sync.ts`, classification of recurring streams
- `api/subscriptions.ts`, the group on a stream

On the client, six modules read `src/lib/category-color.ts`, which holds a
`GROUP_COLOR` map of **11 fixed keys** onto 7 palette tokens, plus the ordered
`SPEND_GROUPS` list added in #199.

### Where a category is stored as text

| Table | Column | Notes |
|---|---|---|
| `transactions` | `category` | plus `category_source` (`plaid` \| `rule` \| `user`) |
| `budgets` | `category` | **unique index on `(user_id, category, period)`** |
| `recurring_streams` | `category` | cache, overwritten every sync |

The budgets index is the sharpest edge: a member's budget is identified by the
category's name, so renaming a category orphans the budget silently.

---

## 3. The decisions

### Decision: categories become per-member rows layered over the built-ins

A `categories` table holding only what a member has **added or changed**, with
the built-in table still in code as the base. Not a full copy of the taxonomy
per member.

Two reasons. A member who never touches categories keeps working with zero rows
written, which is almost all of them. And a built-in that we later rename or
regroup improves for everybody rather than being frozen at the moment their
account was created.

The cost is that "hide a built-in" and "rename a built-in" become override rows
rather than edits, which makes the resolver slightly more involved than a plain
`SELECT`. That is the right trade: the alternative is copying 46 rows into every
new account and owning a migration story for every future taxonomy change.

### Decision: `transactions.category` moves to an id

A member who renames "Coffee shops" to "Coffee" must not lose the history. With
a stored label there are only two ways out, and both are worse than the
migration:

- **Fan-out UPDATE on rename.** Every row, every budget, every recurring stream,
  in one transaction, and any of them can partially fail. It also does not solve
  two members legitimately having different categories with the same name.
- **Never allow rename.** A category you cannot rename is not really yours.

So: a `category_id` on `transactions`, `budgets`, and `recurring_streams`, with
the built-ins given stable ids in code and the existing TEXT column kept as a
denormalized fallback through the transition. This is the single largest piece of
work in the plan and the reason it is not a two-day job.

### Decision: members choose a category's group and colour, not its `kind`

`kind` decides whether money counts as spending at all, and
`api/_finance-snapshot.ts` feeds the Juniper Score from exactly that. A member
who marks a category `transfer` moves their own score, with no visible cause.

A new category inherits its `kind` from the group it is created in. Members can
still move an individual transaction to any existing category, including
transfers, which is what #201 shipped and is the honest expression of "this was
a card payment, not shopping". What they cannot do is invent a new kind of money.

If a member genuinely needs a new transfer-like category, they create it inside
`Transfers & payments` and it inherits from there. Visible, and correct.

### Decision: hiding a built-in hides it from the picker, never from history

An archived category must still resolve, or every historical row pointing at it
falls through `groupOf()` into "Everything else" and the member's past silently
changes. Archived means "not offered", not "does not exist".

---

## 4. What is still open

### Open: colours

`GROUP_COLOR` maps 11 known labels onto 7 palette tokens (`--jnpr-c1` to `c7`,
plus accent, good, and two inks). A member creating a twelfth group needs a
colour, and the palette does not have an obvious twelfth slot that stays legible
beside the others on a donut.

Options, none chosen: extend the palette with a generated ramp; let members pick
from the existing seven and accept collisions; or assign by hash and allow an
override. This wants a design pass with the donut and the legend on screen,
because adjacent wedges want unlike colours and that is a visual judgement, not
a data one.

### Open: do members get custom *groups*, or only custom leaf categories?

Leaves alone are much cheaper: the donut, the legend, the Overview card and the
budgets panel all speak groups, and `SPEND_GROUPS` stays a fixed list of nine.
Custom groups mean every one of those surfaces takes a variable-length,
member-specific list, and the colour problem above becomes unavoidable rather
than deferrable.

Monarch allows both. Recommendation is to ship leaves first and treat groups as
a second stage, but this is a product call.

### ~~Open~~ Built: merchant rules

> **Built 2026-08-30.** `merchant_rules` (migration 0028), `/api/merchant-rules`,
> and the offer that appears on a row the member has just corrected. The
> precedence it introduced is the part worth knowing: **user, then rule, then
> plaid**, decided in `api/_category-precedence.ts` and covered by
> `scripts/check-category-precedence.ts`. A rule is a statement about a
> merchant and a correction is a statement about one charge, so the more
> specific one wins: a member who rules "Amazon is Shopping" and then files a
> single Amazon charge under Groceries keeps that charge under Groceries
> through every sync.
>
> One thing the endpoint deliberately does not do: **deleting a rule does not
> undo it.** Reverting the charges it set would mean restoring Plaid's original
> classification, and that is not kept. `plaid_category` holds Plaid's PRIMARY
> only, which is exactly the level that cannot tell a card payment from a car
> payment.

---

## 5. Sequencing

Five stages, each shippable on its own. Stage 1 alone is already useful.

| # | Stage | Shape |
|---|---|---|
| 1 | **Ids without behaviour change** | Give built-ins stable ids; add `category_id` alongside the TEXT column on the three tables; backfill; write both. Nothing user-visible. |
| 2 | **The resolver** | `_categorize.ts` becomes a per-request resolver built from built-ins plus the member's rows, and the six endpoints load it once per request. Still no user-visible change: with zero member rows the resolver returns exactly today's answers. |
| 3a | **Reads move to the id** | Every read resolves `(category_id, category)` through `classify()`, id first. No user-visible change. |
| 3b | **Create and rename leaves** | The `categories` table, its endpoint, and management UI. |
| 4 | **Archive built-ins** | Hide from the picker, keep resolving for history. |
| 5 | **Custom groups** | Only if section 4 answers yes. Carries the colour work. |

Stages 1, 2 and 3a are the bulk of the risk and produce nothing a member can
see, which is worth saying out loud before starting: the demo is at stage 3b.

> **Corrected 2026-08-30, while building stage 3.** This table originally had a
> single stage 3 whose note read "renames are now safe, because rows point at
> ids". That was wrong, and it was wrong in the direction that would have
> shipped a bug. Stage 1 made rows CARRY ids; nothing READ them. Every endpoint
> still resolved a stored row by its label, so the first rename would have:
> dropped every row written before it into "Everything else", shown two names
> for one category on the same page, and split a budget from its own spending,
> leaving a limit reading zero with money plainly going out. Reading by id is
> its own stage, and it has to land before anything can be renamed. Splitting it
> out also means the change that touches the Score's classification path ships
> on its own, provable in isolation, rather than buried in the PR that adds a
> table and a management UI.

### The regression to guard at every stage

`api/_finance-snapshot.ts` feeds the Juniper Score. Any change to how a
transaction is classified changes a member's score, and the score has history in
`score_history` that a member can see moving. Before stage 2 lands, the resolver
must be proved to return byte-identical classifications for a member with zero
category rows, over a real transaction set. That is the test that matters more
than any UI check in this plan.

---

## 6. Estimate, and the honest caveat

Roughly a week for stages 1 to 4, with stage 1 the largest single piece because
it is a migration across three tables plus every write path. Stage 5 is a
further two to three days and mostly design.

The caveat: the estimate assumes the score-equivalence test in section 5 passes
early. If per-member resolution turns out to change any classification for an
untouched member, that is not a bug to fix at the end, it is a signal that
stage 2's shape is wrong, and the plan should stop there and be revised.
