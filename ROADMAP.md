# Juniper Roadmap — Repositioning to a financial planning app

*Owner: Finley · Started: 2026-08-03 · Status: shipping, Stages 2, 3, 4, 5, 7 and 13 substantially built · last re-verified against the code 2026-08-28*

> **Re-verified 2026-08-28.** The checkboxes below had drifted from the repo in
> three places, each corrected in place rather than left to be rediscovered:
> Stage 3 carried two copies of sub-stages 3b to 3e (one done, one untouched)
> from a merge, Stage 6's Plaid Production gate was still open months after it
> cleared, and Stage 11's "Ask Juniper" was still marked deferred with the
> surface routed and streaming in production. Stage 12 gained the one thing
> nobody had written down: there is no password reset anywhere in the codebase.

## What this is

Juniper is being repositioned from a **couples-first AI planning copilot** into a **financial planning app for young individuals and families** — Mint/Monarch-style budgeting and net-worth tracking, a holistic **Juniper Score** (Credit-Karma model), a **marketplace** with affiliate monetization, and planning as the value-add on top.

This roadmap tracks the work to take the approved design prototype (a clickable mock, mock data) to a shipped product in the real stack (React + Vite frontend, Vercel Edge functions, Supabase/Postgres, Plaid, Anthropic).

### Design direction (locked)

- **Post-login home:** Mint-style dashboard — net worth + plans hero, spending-by-category, budgets, transactions, accounts.
- **Recommendations:** live **only inside a relevant plan** and on the **Score breakdown** page — never floating on the dashboard.
- **Visual identity:** **cool off-white + pine** — background `#F4F7F3`, pine-green accent `#1C4A31`, dark-green headers & UI icons, and each page's header/intro is a **pine-filled band** with light text. White cards, multi-color plan/category tiles, and real brand logos kept for contrast. Real bonsai logo (`artifacts/juniper/public/logo.png`). Dark-green dark mode included. *(Superseded the earlier cream + serif "Juniper.com" direction.)*
- **Prototype reference:** `design/juniper-app-mock.html` — a self-contained, clickable design mock (open in any browser; ☾/☀ toggles theme). Covers Home, Spending, **Subscriptions**, Plans, Marketplace, Accounts, the **Score breakdown**, and **Credit monitoring**. This is a design reference, not production code.
- **Planned surfaces not yet designed:** Ask Juniper advisor (Stage 11).

### Status legend

- [ ] not started · [~] in progress · [x] done
- Tags: **(design)** · **(build)** · **(compliance)** · **(growth)**
- ⚠️ = critical path / biggest lift · ♻️ = existing code to reuse

---

## Stage 0 — Product decisions ✅ *Locked 2026-08-03*

- [x] **Score model → proprietary 0–100 "Juniper Score."** Computed from savings rate, debt load, emergency fund, retirement pace, and credit health; the 300–850 credit number is shown as one factor, not the hero. *(Drives Stage 4.)*
- [x] **Audience → individual-first, partner as a layer.** Solo is the default experience; "invite your partner" is an optional add-on that unlocks the existing alignment features. *(Drives Stage 7.)*
- [x] **"Ask Juniper" Q&A → deferred to post-launch fast-follow.** Not in v1; ship the dashboard-first product first, then add the LLM advisor. *(See Stage 11.)*
- [x] **v1 data depth → build now on Sandbox, launch when Production clears.** Start the Stage 3 data engine against Plaid Sandbox in parallel so it's ready the moment Production access lands; don't block engineering on the compliance gate.

---

## Stage 1 — Finish the design **(design)**

Shell is done; remaining screens and states:

- [~] First-run onboarding — "Connect your accounts", reskinned to Juniper.com ♻️ *(exists: `first-run-onboarding.tsx`; connect step reworked into the **Stage 13** three-tier account-discovery flow, gallery multi-select + manual add live, Layer gated)*
- [ ] Empty / loading / error states — no accounts, no transactions, no plans; skeleton loaders
- [ ] Plan detail screen (full)
- [ ] Marketplace: listing detail + "List your service" merchant submission flow
- [ ] Interaction states: edit transaction category, edit budget, add/adjust goal
- [ ] Spending sub-tabs: Transactions table, Recurring
- [x] Subscriptions manager screen + one-click-cancel confirmation/approval modal *(Stage 9)* — in mock
- [x] Credit-score monitoring view on the Score/credit page — score trend, change alerts, factors *(Stage 10)* — in mock
- [ ] Responsive / mobile layouts for all surfaces
- [ ] ~~"Ask Juniper" Q&A surface~~ — deferred to post-launch *(Stage 11)*

---

## Stage 2 — Rebuild the shell in the real codebase **(build)** — *in progress*

- [x] Stand up `DESIGN.md` + design tokens (offpine cool off-white + pine) — `artifacts/juniper/DESIGN.md` + scoped `src/styles/juniper.css` (`.jnpr`)
- [x] New top nav + routing, replacing the plan-centric shell — `src/pages/juniper-app.tsx` + `components/juniper/app-frame.tsx` (Overview · Plans · Credit · Recommended); routed at `/app/*` in `App.tsx` (old `app-shell.tsx` kept, unrouted). *(P3: Home + Spending merged into a single **Overview** page at `/app` — `src/pages/app/overview.tsx` — folding in the full searchable transactions table and the subscriptions manager; the standalone Spending tab/route is dropped.)*
- [x] Embed the real logo + app icons across the app shell — `public/logo.png` in the app bar
- [x] Port pages to React components — **all nav surfaces done**: Overview (Home + Spending merged, P3), Plans, Credit, Recommended (`src/pages/app/*.tsx`), each typecheck/build/SSR verified. *(Standalone Score-breakdown page — the "ways to improve" surface behind the Home score strip — is the one design-mock screen not yet given its own route; the strip currently links to Credit. Small follow-up.)*
- [ ] Fold in existing surfaces ♻️ — deferred into the Stage-3 data swap *(plans, `partners.ts` marketplace, `portfolio-summary.tsx`, Plaid `connections.tsx`)*: components already read `mock-data.ts` typed selectors, so this becomes wiring real data behind the same shapes rather than UI work.
- Data: components read `src/lib/mock-data.ts` (typed selectors) so the Stage-3 swap to live data is data-layer only

---

## Stage 3 — Data spine: transactions → categories → budgets ⚠️ **(build)** — *in progress*

**The core of the Mint pitch — the biggest single lift.** Built on Plaid **Sandbox** now; goes live when Production clears (Stage 6). Sub-staged:

- **3a — Schema** [~] `transactions`, `budgets`, `net_worth_snapshots` tables (owner RLS + Data API grants, following the `0002_plans` pattern) + a server-only `transactions_cursor` on `plaid_items`. → `supabase/migrations/0008_transactions_budgets.sql` **(written; must be applied to the Supabase project to activate — ops step, like prior migrations).**
- **3b — Transactions sync** [x] `api/plaid/transactions-sync.ts` — pulls Plaid `/transactions/sync` by cursor (incremental, paged) and upserts into `transactions` (service-role, user-scoped, dedup on `plaid_transaction_id`, handles removed ids, persists the cursor on `plaid_items`). **Needs `transactions` added to `PLAID_PRODUCTS`** + migration applied + a linked item to actually run.
- **3c — Categorization** [~] core map in `api/_categorize.ts` (Plaid `personal_finance_category` primary/detailed → Juniper categories, used by the sync). Merchant rules + user overrides (`category_source='user'`) still to add.
- **3d — Budgets** [x] `api/budgets.ts` — CRUD for per-category monthly limits (GET list / POST upsert `{category, limit}` / DELETE `?category=`, JWT-scoped, service-role writes, `on_conflict=user_id,category,period`). Monthly *spent* rollup + over-budget flagging is computed in `/api/finances` against the synced transactions.
- **3e — Net worth history** [x] `api/plaid/networth-snapshot.ts` — fetches fresh balances from Plaid (`/accounts/balance/get`), classifies assets (depository + investment) vs debts (credit + loan), and upserts one row per (user, day) into `net_worth_snapshots` (`on_conflict=user_id,as_of`). Call on link, on refresh, and daily (cron) to build the trend line.
- **3f — Frontend data layer** [x] the seam is in: `src/lib/finances.ts` (`useFinances()`) + read endpoint `GET /api/finances` (server-side rollups: spending-by-category, budgets-with-spent, cashflow, recent tx, grouped accounts, net-worth series). Starts on the demo mock, fetches live, and **swaps to real data only when linked + synced** (else stays mock — nothing breaks pre-gates). **Home, Spending, and the Accounts/Connections surface all read live data.** Sync trigger: `syncFinances()` (`src/lib/plaid.ts`) fires `POST /api/plaid/transactions-sync` + `POST /api/plaid/networth-snapshot` automatically on link, and on the manual **"Refresh data now"** button in Connections.
- **3g** [x] **A reconstruction can be redone when its inputs change** *(2026-09-02)*. `networth-backfill`
  writes with `resolution=ignore-duplicates`, which was doing two jobs at once: never overwrite a day
  Juniper OBSERVED with a day it guessed (always right), and never re-derive a day it already guessed
  (right by default, because a reconstruction walks back from TODAY's balances and therefore moves as
  the market moves, so rewriting it on every sync would make a member's May net worth wobble daily).
  The second rule is wrong in exactly one case: when the INPUTS change. Charles Schwab, about 73% of
  the member's net worth, was linked before #144 sent `additional_consented_products`, so its invested
  balance was carried back flat; it was relinked on 2026-08-29 and the history could not be redone,
  because the endpoint fires on every sync and is a no-op by design. `POST ?rebuild=1` now replaces
  the days it reconstructed itself and only those. The decision is `replaceableDays` in
  `api/_networth-walk.ts`, kept pure because it drives a DELETE on the one table in the app that
  cannot be recomputed (`net_worth_snapshots` is keyed by (user, day), so a lost observation is lost
  for good), and `scripts/src/check-networth-rebuild.ts` asserts over 4096 combinations that a
  recorded day can never be deletable and that a day the walk did not produce is never touched. The
  delete sends `estimated=eq.true` as well as the day list, so the database refuses an observation
  even if the list were ever wrong. Triggered by **Settings, Developer, "Rebuild net-worth history"**,
  which reports what it cleared and what it left alone rather than saying "Done"; `syncFinances()`
  deliberately does not pass the flag
- [ ] **(ops)** **Press it once for the real member**, whose 66 reconstructed days (27 May to 31
  August) still carry Schwab flat. Expect "66 reconstructed days replaced, 5 recorded days left
  alone" and investments adjusted on one connection. Worth reading the net-worth chart before and
  after: even rebuilt, the invested portion counts money added and not how the market moved, because
  Plaid reports today's prices and not past ones, so the shape should change and will not be exact - Finley

> **Deduplicated 2026-08-28.** This list appeared twice, once as above and once
> with 3b to 3e unchecked and described as unbuilt, which made the most finished
> part of the repo read as half-built. The stale copy is deleted; the state above
> is the one that matches the code.

---

## Stage 4 — Juniper Score engine **(build)** — *in progress*

*Decided: proprietary 0–100 Juniper Score; credit shown as a factor (Stage 0).*

- [x] **Define factors, weights, formula** → `api/_score.ts` (pure, I/O-free, unit-testable). Five weighted factors each scored 0–100: savings rate (0.25), emergency fund (0.25), debt load (0.20, debt-to-income), investing pace (0.15), credit health (0.15). Overall = weighted sum; bands At risk / Building / Fair / Healthy / Excellent.
- [x] **Compute from Stage 3 data + store history** → `api/_finance-snapshot.ts` assembles the inputs (trailing-90-day income/spending + account balances) so `/api/finances` and the writer score off the same numbers. `POST /api/score/compute` upserts one `score_history` row per (user, day) for the trend + delta (migration `0009_score_history.sql`). `/api/finances` now returns the live score, trend, and delta; `syncFinances()` fires the compute on link/refresh.
- [x] **Ranked "ways to improve" cross-linked to plans** → the engine emits improvements ranked by weighted headroom (potential points), each linked to the relevant plan icon. New **Score breakdown page** (`src/pages/app/score.tsx`, routed `/app/score`) shows the ring + trend, per-factor bars, and the ranked levers; the Home score strip links to it.
- Ops to activate (like Stage 3): apply migration `0009`; the score goes live once an item is linked + synced. Until then the UI shows the demo score.
- Later: real credit-score/utilization ingestion into the credit factor (Stage 10); age-aware retirement-pace target; score-change notifications (Stage 11).

---

## Stage 5 — Marketplace + monetization **(build + compliance)** — *in progress*

- [x] **Migrate to a DB-backed `partners` table** (edit offers without a deploy) ♻️ — table + serving endpoint (`0010_partners.sql`, `GET /api/partners`, benefit-ranked, active-only). Catalog **seeded** (`0011_partners_seed.sql`, + `headline` column) and the **Recommended Library now reads it** via `usePartners()` (`src/lib/marketplace.ts`), starting on the seeded catalog and swapping to live once the table is populated. *(The `partners.ts` plan-detail cards are the unrouted legacy shell and were left as-is.)*
- [x] **"Picked for you" personalization** → `api/_picks.ts` (pure) turns the member's financial signals (card vs loan debt, emergency-fund months, idle cash, investing pace — from `_finance-snapshot.ts`) into a ranked, deduped set of offers, each with a reason drawn from their own numbers ("you're carrying $3,200 in credit-card debt — a 0% balance transfer could cut the interest"). `GET /api/recommendations` draws them from the benefit-ranked catalog; `usePicks()` swaps the Recommended "Picked for you" strip to live once synced, with a clean "you're all set" empty state and the demo picks as fallback. Matching is by FIT, never payout.
- [x] **Merchant self-listing submission + moderation queue** (the supply side) → `partner_submissions` table + `POST /api/partners/submit` (validates, http(s)-only URL, JWT-scoped, lands `pending`) + a working **"List your service"** modal on Recommended. **Admin moderation UI** shipped: `/app/admin` (`src/pages/app/admin.tsx`) lists submissions and Approve (→ upserts the offer into `partners` as active, self-listed) / Reject, backed by `GET|POST /api/admin/submissions`. Gated on an `ADMIN_EMAILS` env allowlist (`api/_admin.ts`) — no in-app path to escalate; the page self-gates to a clean "no access" state for non-admins. **Ops: set `ADMIN_EMAILS`** to enable moderators.
- [~] **Affiliate link / subid management; keep FTC disclosure + `affiliate_click`** ♻️ — disclosure + `affiliate_click` tracking already in place and untouched; `partners.url` + subid wiring lands with the display-swap above.
- [x] **Rank offers by estimated benefit to the user (not payout)** → `api/_offers.ts` `rankByBenefit()` (pure): sorts by estimated user benefit, then curator trust, then explicit order/name — never payout. Used by `GET /api/partners`.
- [ ] **(compliance)** Approved affiliate programs, real URLs, category-specific disclosures/licensing (mortgage, insurance, credit, legal) — replaces all `example.com` placeholders. *(Business/legal — gates monetization going live; the plumbing above is ready for it.)*
- Ops to activate: apply migration `0010`; the marketplace stays on its seed config until the `partners` table is populated.

---

## Stage 6 — Compliance & data gates **(compliance)**

- [x] Plaid **Production** access — approved 2026-08-25 and proven end to end 2026-08-28 (real institutions linked on the production account, six items in that day's runtime logs). `PLAID_ENV=production` and the production secret are scoped to the Production environment only; Preview and Development stay on Sandbox. The five month stall was the wrong Plaid account, see PROJECT.md
- [ ] Financial-data terms of service + privacy policy
- [ ] Security review of the new data surfaces (transactions, balances, score inputs)
- [ ] Configure Anthropic API spending limits *(open loop from PROJECT.md)*

---

## Stage 7 — Reframe Plans + couples **(build)** — *mostly done*

- [x] **Reframe the domains as goals funded from real balances** ♻️ — the new Plans page's create flow seeds a goal from the member's linked balances (a debt-payoff goal targets actual debt, an emergency fund uses 6× real spend + current cash, retirement pulls in invested balances), and the header reflects "funded from your linked balances" once live. *(Per-plan account designation — pinning a specific account to a goal — is a future refinement.)*
- [x] **Auto-fill plan inputs (savings / debt) from linked balances** → `prefillFor()` in `src/pages/app/plans.tsx` reads `useFinances()` and pre-fills target/saved with a "from your accounts" hint per template.
- [x] **Solo default with "invite partner" layer** ♻️ — solo-first `PartnerPanel` on Plans + an **individual↔shared workspace** in the app shell (switcher + account-menu invite, shared sub-nav) and a full shared UI: Overview, Accounts, Goals, Bills, Activity/chat, and privacy-toggle Sharing (`src/pages/app/shared/*`, `lib/workspace.tsx`). Design locked in `design/juniper-partner-*.html`.
- [x] **An invite says who sent it, in the message and on the page** *(issue #172, treatment B of
  three rendered in `design/partner-invite-preview-variants.html`)*. The link previewed as the
  marketing card, a watercolour house and "build your financial future, together", so nothing in the
  first thing an invited person saw said they had been invited, by whom, or to what. **The constraint
  that shaped it: a link preview is built by a crawler that does not run JavaScript**, and every route
  is rewritten to one static `index.html`, so no React change could touch it. `api/invite-preview.ts`
  now serves `/invite/partner/:token`: it resolves the token to the inviter's first name, takes the
  BUILT shell and swaps six tags in it, and hands the same HTML to crawler and person alike, with no
  user-agent sniffing. The image is static (`design/invite-og-card.html` rendered to
  `public/invite-og.png`, 1200x630) and the NAME is what varies, because the name is the bold line a
  reader actually reads and a static image needs no per-request rendering. `api/_invite-lookup.ts` is
  the one unauthenticated read on this API, gated on the token rather than a session because the
  person asking has no account yet; it returns ONE field, the inviter's first name, only for a token
  that is pending right now, and refuses anything that is not 32 hex characters before a query is
  built. The landing page names them, pairs their initial with an empty "you", and states the three
  facts that decide whether a reasonable person accepts (the shared space, private until chosen
  account by account, transactions never shared) rather than asking for trust. Sign-up carries the
  name through, since "Join Finley on Juniper" landing on a page that never mentions Finley is where
  the thread would break. No migration: every field already existed. The name is a nicety and never a
  dependency, and the unnamed wording is real copy rather than a fallback nobody looked at
- [x] **Partner data model (backend)** → migration `0012_partnerships.sql` (`partnerships`, `partner_sharing_prefs`, `shared_goals`, `shared_goal_contributions` — server-only, restrictive RLS) + `api/partner.ts` (GET shared overview with **combined net worth rolled up from both members' `plaid_items` honoring each member's `share_balances`**, + POST invite/accept/disconnect/set-prefs/add-goal/add-contribution). Frontend seam `lib/partner.ts` (`usePartner()`): the workspace auto-connects from a real partnership, the invite modal mints a real link, `/invite/partner/:token` accepts it, and the shared Overview + Sharing read/write live (demo fallback until synced). *(Account-level share flags, bills, and chat persistence are additive follow-ups; combined net worth + shared goals + sharing prefs are live.)*
- [x] **Finish the shared data layer** → migration `0013_shared_layer.sql` (`account_shares`, `shared_bills`, `shared_messages`, `shared_reactions` — server-only) + endpoints: per-account share scope in `/api/partner` (GET returns both members' accounts by scope, `set-account-share` action), `api/partner/bills.ts` (list/add/delete), `api/partner/activity.ts` (messages + 👍 reactions, toggle). Shared **Accounts** (per-account Shared/Balance/Private, tap-to-change on your own), **Bills** (live add/delete), and **Activity** (live partner chat + reactions) all read/write live, with demo fallback.
- Ops to activate: apply migrations `0012` + `0013`; a real shared space needs both partners linked + synced. Until then the shared workspace shows the demo preview.

---

## Stage 8 — Launch to 20 active users **(build + growth)**

- [ ] Analytics on all new surfaces ♻️ *(GA4 `engaged_session` + Sheets pipeline exist)*
- [ ] Notifications — score change, budget over, bill due
- [ ] QA pass + performance + accessibility
- [ ] Private beta → **20 active users** goal
- [ ] Iterate on activation / retention from usage data

---

## Stage 9 — Subscriptions manager **(design + build + compliance)**

See and manage every active subscription, and cancel with one click + an approval step. Detection builds on Stage 3 recurring-transaction data.

- [~] **(build)** Recurring/subscription detection from transactions ♻️ *(uses Stage 3 data spine)*. Built and deployed in PR #155: Plaid's `/transactions/recurring/get` generates candidates, `recurring_streams` caches them, `recurring_overrides` holds the member's own confirmations, and nothing counts toward a total until the member confirms it. Design and rationale in docs/RECURRING_DETECTION.md. **Was blocked on an entitlement, not on code:** production logs on 2026-08-28 show every item refused with `INVALID_PRODUCT client is not authorized to access the following products: ["recurring_transactions"]`. It is a separate Plaid add-on, requested 2026-08-28 and **granted 2026-08-31**. Live on production since, and **no consent change was needed to get there**, which is the opposite of what this line used to say. `recurring_transactions` was added to `additional_consented_products` that day (#221) on the belief that the entitlement gated it, and **Plaid rejected every `/link/token/create` for the next day** with 400 `recurring_transactions is not a valid product for this field`, so no member could connect a bank until #234 removed it. That field takes the same enum as `products` and an add on is not in it: it is entitled on the Plaid ACCOUNT and read through `/transactions/recurring/get`, so consenting to `transactions`, which `plaidProducts()` already requests, is the whole requirement. The seven items linked long before the grant serve recurring detection untouched. Linking is proven recovered rather than assumed: a Chase item was linked at 2026-09-01 15:07 UTC, 32 minutes after #234 merged, and all seven items carry a null `last_error_code`. Corrected in `docs/RECURRING_DETECTION.md`, section 2; read that before touching a consent list
- [ ] **(build)** Price rise history per stream. The cache stores last and average amount, so a rise is visible the month it happens, but there is no per stream series behind it
- [x] **(design)** Subscriptions list + per-item detail; the one-click **Cancel** with a confirmation/approval modal (amount, next charge, "are you sure") — in `design/juniper-app-mock.html`
- [ ] **(build)** Cancellation mechanism — realistically an **assisted/concierge or partner-API flow**, not a universal one-click across all merchants. Options: generate a pre-filled cancellation request, hand off to a cancellation partner, or a Juniper-assisted queue. User's approval gates every action.
- [ ] **(build)** Track cancellation status (requested → confirmed) and estimated savings; feed savings into the Juniper Score / "ways to improve"
- [ ] **(compliance)** Terms for acting on the user's behalf; audit log of approvals

> **Reality check:** true "one-click cancel everywhere" isn't a single API — incumbents (e.g. Rocket Money) use human concierge + partner integrations behind the button. Scope the button as *request cancellation with my approval*, with the backend flow chosen per merchant.

## Stage 10 — Credit-score monitoring **(build + compliance)**

Ongoing credit-score tracking and alerts on the Score/credit page (distinct from the proprietary Juniper Score, which uses credit as one factor).

- [ ] **(build)** Integrate a credit-data provider (e.g. Array / bureau soft-pull / Credit Karma-style partner) — pull score + factors on a schedule
- [x] **(design)** Credit page: current score, trend over time, score factors, and change alerts (score moved, new inquiry, utilization up) — in `design/juniper-app-mock.html`
- [ ] **(build)** Alerting — notify on meaningful changes; store history
- [ ] **(build)** Feed the live credit score into the Juniper Score's "credit health" factor (replaces the static 726 placeholder)
- [ ] **(compliance)** FCRA / credit-data handling, provider contract, consent + disclosures for soft pulls

## Stage 11 — Post-launch fast-follows **(build)**

- [x] **"Ask Juniper"** LLM advisor — shipped, not deferred. `/app/ask` is routed in `pages/juniper-app.tsx` and `pages/app/ask.tsx` runs threaded conversations that stream from `api/planner/chat.ts` grounded in the member's real figures, plus generated plan reports through `api/planner/report.ts`. The Stage 0 decision to defer it was overtaken by the build. **Still owed, and the reason this is not simply closed:** the prompt safety pass and the financial advice disclaimers named in the original line have not been done
- [ ] Plaid data tiers beyond transactions (liabilities / investments) into plan auto-fill *(open loop from PROJECT.md)*
- [ ] Cross-device sync for "accounts I use" *(open loop from PROJECT.md)*

---

## Stage 12 — Auth & onboarding flow **(design + build)**

The front door: a branded **log-in / sign-up** experience and the first-run path from account creation → connect accounts → first dashboard. Supabase Auth + RLS already exist under the hood (see reuse inventory) — this stage is the *product* layer on top: the screens, the reskin to the current cool-off-white + pine identity, and the sequencing into the app.

**Sequencing:** best done **alongside finalizing the page designs (Stage 1)** so the auth screens share the locked visual system, and **before launch (Stage 8)** since new users can't reach the product without it. It's split out as its own stage so the sign-up funnel gets deliberate design attention rather than being an afterthought.

*This stage read as entirely unstarted until 2026-08-28. Most of it is built and
routed; what follows is what the code actually shows.*

- [~] **(design)** Sign-up and log-in screens in the pine identity — built and routed (`pages/auth/sign-in.tsx`, `pages/auth/sign-up.tsx`, `/auth/sign-in` and `/auth/sign-up` in `App.tsx`). Sign-up is gated by `VITE_SIGNUP_INVITE_CODE` during private preview. **No password-reset screen exists**, see below
- [x] **(design)** First-run onboarding sequence — `components/onboarding/first-run-onboarding.tsx`, mounted by the live shell: name and household, goals, connect accounts (the Stage 13 three-tier flow), money snapshot last so linked figures pre-fill it
- [~] **(build)** Wire screens to Supabase Auth — email and password is wired (`signInWithPassword`, `signUp` with `emailRedirectTo` built from the current origin). Magic link and Google OAuth are not, and are optional
- [ ] **(build) A member who forgets their password cannot get back in.** There is no `resetPasswordForEmail` call and no update-password screen anywhere in the repo, verified by grep on 2026-08-28. Supabase can send the mail, so this is one screen, one callback route, and one call. It gates any beta with real members, because the alternative is resetting people by hand in the Supabase dashboard
- [~] **(build)** Empty/first-run dashboard state — the seam is real (`hasTransactions` from `/api/finances`, no demo fallback since #140), and Overview waits on real rows rather than showing zeroes. The deliberate nudge screen that ties it together is still the design item under Stage 1
- [x] Account settings surface — `components/juniper/settings-modal.tsx` (account, appearance, developer tools under `DEVELOPER_EMAILS`), with linked institutions on `/app/connections`

---

## Stage 13 — Account discovery & connect **(build)** — *in progress*

The "connect your accounts" experience, reworked so a new user reaches a
populated dashboard with the least possible friction. Inspired by the Credit
Karma "enter a little info and everything appears" moment, but built honestly on
what the underlying rails can actually do. **Three tiers, most-magic first, each
degrading cleanly into the next** so both Plaid-network veterans and
never-used-Plaid users get a good path:

- **Tier 1 — Instant (Plaid Layer)** ⚠️ *gated on Plaid Production.* Enter a
  phone number, Plaid recognizes the returning network user and surfaces the
  accounts they've already connected elsewhere, categorized, with a "select all",
  no per-institution login. This is the headline flow.
  - [x] **Seam built:** `api/plaid/layer-session.ts` (`/session/token/create`
    with a Layer template) + `createLayerSession()` + `layerEnabled()` flag
    (`src/lib/plaid.ts`) + a gated `LayerDiscovery` phone-entry component wired
    into onboarding **and** Connections. Inert until turned on.
  - [ ] **Activate (ops):** get Plaid **Production** (Stage 6), create a **Layer
    template** in the Plaid dashboard, set `PLAID_LAYER_TEMPLATE_ID` + flip
    `VITE_PLAID_LAYER=1`. Then **verify Layer's multi-item return + exchange
    end-to-end** (the one path that can't be exercised on Sandbox; the scaffold
    reuses the standard public-token exchange and is marked to re-verify).
  - [x] **Demo mode for Sandbox testing:** `VITE_PLAID_LAYER=demo` runs the full
    tier-1 UX without Production, phone entry, a "recognizing you…" beat, then a
    **Juniper-rendered categorized account list with Select all** (the experience
    the real Plaid-hosted Layer screen provides). Recognized accounts are mocked
    and, on connect, saved as manual accounts so they actually land on the
    dashboard + net worth. `LayerDiscovery` branches live vs demo.
  - **Known limit:** Layer only knows accounts *already in the Plaid network for
    that person*. It is not an omniscient "every account you own" lookup, hence
    tiers 2 + 3 are permanent, not stopgaps.

- **Tier 2 — Browse (indexed/sorted gallery)** ✅ *works today on Sandbox.* A
  searchable, alphabetized, categorized institution gallery with **multi-select +
  Select all** and a **sequential Plaid Link queue**, pick everything you use,
  connect it in one pass (Plaid opens each institution's login in turn), plus
  **Search all institutions** for small/regional banks.
  - [x] `institution-picker.tsx` rewritten to the multi-select gallery (search,
    per-category + global select-all, expanded catalog, dedupe by name).
  - [x] `src/lib/use-link-queue.ts` — the sequential Link hook (ref-driven,
    per-item token, skip-on-exit, progress "Connecting 2 of 4…"), shared by
    onboarding + Connections.

- **Tier 3 — Manual add** ✅ *works today, no gates.* For institutions Plaid
  can't link (small/regional banks, many employer 401(k) providers) or anything
  the user prefers to enter by hand, so their account list + net worth can be
  complete without a live connection. Balances are user-maintained.
  - [x] Migration `0014_manual_accounts.sql` (owner RLS + Data API grants,
    `0002`/`0008` pattern), `api/manual-accounts.ts` (CRUD), client
    `src/lib/manual-accounts.ts`, `ManualAccountForm` component, surfaced in
    onboarding + the Connections list (with a "Manual" tag + remove).
  - [x] **Manual balances fold into net worth + the account rollup** via a
    shared `api/_manual-accounts.ts` (fetch + bucket + sum): `GET /api/finances`
    appends them to the cash/invest/debt groups (so net worth picks them up),
    the net-worth **snapshot writer** adds them to the trend, and
    `_finance-snapshot.ts` folds them into the **Juniper Score** inputs (cash /
    investing / card / loan by category + `kind`). Counted on the linked path
    today (a Plaid-linked user who also hand-adds a 401(k)/regional bank); a
    net-worth-only live view for *manual-only* users is a further follow-up.

- Ops to activate (like the rest of Stage 3): apply migration `0014`; manual add
  works as soon as it's applied. Tiers 1/2 need Plaid configured; tier 1
  additionally needs Production + a Layer template.

---

## Stage 14: Card rewards on the Credit page **(build)**, *shipped, behind two unapplied migrations*

Cannibalizes the Credit Karma Cards Optimizer (issue #168): identify which card each linked account
is, a per-category rewards earning guide, a benefits tracker, and recommendations. Distinct from Stage
10, which is bureau score monitoring and still needs a provider; this needed no provider at all.
Design record: `design/card-rewards-variants.html`, three rendered treatments, A chosen. Full
rationale in `docs/CARD_REWARDS.md`.

- [x] **(build)** Curated card catalog with enforced provenance → migration `0031_card_products.sql`
  (`card_products`, `card_product_earn`, `card_product_benefits`, plus `member_cards` and
  `card_benefit_uses` for the member's own layer). `source_url` and `as_of` are NOT NULL on all three
  catalog tables, so a rate cannot exist without saying where it came from, and `verified` is FALSE on
  everything the seed writes with the page saying so. No product Juniper integrates returns rewards
  terms: Plaid's `liabilities` gives APRs and limits, not earn rates.
- [x] **(build)** Seed of 10 common US cards, 18 earn rows, 36 benefits → `0032_card_products_seed.sql`.
  `ON CONFLICT DO NOTHING`, never `DO UPDATE`, so a re-run cannot overwrite a row somebody verified by
  hand. Rotating categories, portal-only rates and signup bonuses are deliberately excluded, each for a
  reason recorded in the migration header.
- [x] **(build)** The maths, pure and I/O-free → `api/_rewards.ts`, exercised by 54 cases in
  `scripts/src/check-rewards.ts` with no database, no Plaid account and no session. The four things it
  guards: a cap drops to the card's BASE rate rather than stopping, a points rate is only comparable
  once a valuation is applied and that valuation is disclosed, a leaf category beats its group, and the
  annual fee is subtracted before a card is recommended.
- [x] **(build)** Which card is which, answered by the MEMBER → `api/member-cards.ts` plus
  `components/juniper/card-identify.tsx`. Plaid returns an account name like "CREDIT CARD" and nothing
  that identifies a product, so there is no auto-confirm path anywhere: `confidence` orders the picker
  and a tap is the only thing that writes a row. "My card is not listed" is a stored answer rather than
  a dismissal, so a member holding something outside the catalog stops being asked.
- [x] **(build)** Rewards earning guide, ordered by the member's OWN spend rather than a fixed
  Groceries / Gas / Dining / Travel → `components/juniper/rewards-guide.tsx`.
- [x] **(build)** Benefits tracker → `api/card-benefits.ts` plus
  `components/juniper/benefits-tracker.tsx`. `period_key` (`2026-08` / `2026-Q3` / `2026` / `once`) is
  computed server-side and never accepted from the client, which is what makes a recurring credit reset
  with no cron job. Nothing is ticked automatically: a matching charge proves a purchase, not that the
  issuer applied a credit.
- [x] **(build)** Recommendations → `components/juniper/card-switches.tsx`. "Worth switching" compares
  cards the member already holds, so it needs no application, no hard pull and no affiliate link.
  "Cards that would beat yours" names catalog cards they do not hold and **carries no URL**, because
  every affiliate link here is still a placeholder and a credit-card application is the category where
  that matters most (`docs/CREDIT_PROVIDER.md` section 4).
- [x] **(ops)** Applied `0031` and `0032` to the production Supabase project on 2026-08-31 (Finley),
  verified at 10 products / 18 earn rows / 36 benefits. The surface is live: a production screenshot on
  issue #211 shows the Identify prompt rendering and the Chase, Capital One and Discover institution
  marks resolving.
- [x] **(build)** **A limit the bank does not report can be set by the member** (issue #211, migration
  `0033_member_card_limit.sql`). Plaid returns `balances.limit` only when the issuer sends it, and on
  real production data Chase reports $9,000 while Capital One and Discover report nothing, so
  utilization was computed from one card of three. Treatment A of three
  (`design/credit-limit-variants.html`): the control sits inline on the row that states the gap, so the
  member is looking at that card's name and mask while they type. Two rules hold. A limit they typed
  carries a "You set this" badge and the utilization figure says how many of its limits came from them,
  because one is a fact and the other is a claim. And it **never reaches the Juniper Score**:
  `_finance-snapshot.ts` reads bank-reported limits only and carries a comment saying not to join
  `member_cards` in, since otherwise anybody could raise their own score by typing a generous number.
- [x] **(ops)** Applied `0033` to the production Supabase project on 2026-08-31 (Finley), and verified
  from `information_schema`: `credit_limit` numeric, `credit_limit_set_at` timestamptz, and
  `product_answered` boolean defaulting to `true`, which is the value the no-backfill argument rests on.
  The migration tree is now 0001 to 0033. #225's code was already deployed at the time, which was safe
  only because `readConfirmations` treats the new columns as optional and retries without them.
- [x] **(build)** **The catalog offers the name printed on the card** (migration
  `0034_card_products_variants.sql`, 8 more products, taking it to 18 products / 31 earn rows / 50
  benefits). Found by the first real production test of #211: the member's card says "Quicksilver
  Student" and 0032 could only offer plain "Quicksilver". Student and legacy brandings (SavorOne) now
  get their own rows, because a catalog of current marketing names cannot identify cards people actually
  hold. 0034 also establishes the rule for what stays OUT and corrects an assumption 0032 made:
  understating a rate is safe when recommending a NEW card and unsafe when describing one the member
  ALREADY HOLDS, since `switchIdeas` would then advise moving spend off it. So Apple Card, Bilt, Citi
  Custom Cash and BoA Customized Cash are absent (headline earning is conditional on a payment method, a
  transaction count, or a category chosen per cycle), as are Sapphire Reserve and Amex Gold (recently
  moved annual fees, which `upgradeIdeas` subtracts, so a stale figure inverts the recommendation).
- [x] **(build)** **Better card faces and a wallet the cards sit in** (`design/card-wallet-variants.html`,
  one face proposal and three wallet treatments, A chosen). Still no issuer card art, which is licensed
  and gated on the same issuer relationship as the marketplace: a face is the stored brand colour plus
  the issuer's own Plaid logo, with the network in plain type rather than as its own mark. `shortCardName`
  in `api/_rewards.ts` derives a name that fits, since the catalog stores 53-character issuer spellings
  that the picker needs and no face can hold. **The wallet is vertical because in any overlapping stack
  the visible band of a hidden card is narrow and whatever identifies it has to sit inside that band**,
  which took four attempts: a horizontal fan revealed the network name ("VISA VISA RCARD COVER"),
  spreading it needed 816px inside a 352px box, a 34px vertical reveal showed only "CHASE" on both Chase
  cards, and a 54px reveal with the name stacked under the mask left both Discover cards reading
  "Disco...". Vertical also scales: a fifth card costs 54px of height rather than width the hero does
  not have.
- [x] **(build)** **Somewhere to put real card art, and faces big enough to read** (migration
  `0035_card_product_art.sql`). `art_url` plus `art_license`, paired by a CHECK for the same reason a
  rate needs `source_url`. The column SHIPS EMPTY on purpose: the images are issuer marketing assets and
  choosing a source is a licensing decision for the product owner, not the migration author, so the app
  renders art the moment a URL is set and keeps the synthesized face as the fallback. Three legitimate
  routes are written into the migration header: an issuer affiliate program's brand pack (the same
  approval Stage 5 needs), a licensed card-data vendor, or a deliberate decision about issuer-hosted
  URLs. Sizes moved to the real card aspect of 1.586:1, and `sm` went from 26x17 to 60x38, which is the
  one that matters: at chip size the picker was asking somebody to choose between five Capital One cards
  by shade of grey.
- [x] **(build)** **An overpaid card is not debt** (`api/_credit-balance.ts`, mirrored client-side,
  10 cases in `scripts/src/check-credit-balance.ts`). Found on real production data: a Capital One card
  at -328.21 with a $4,400 limit drew as "$328 of $4,400 limit, Used 7%" when the member was using none
  of it, because Plaid reports a credit balance as NEGATIVE when the account is in credit and five places
  took `Math.abs()` of it. That reached the Credit page, the rewards payload, the Juniper Score's
  debt-load factor, the Score's credit factor and net worth, so a refund the issuer owed made the
  member's score worse twice and their net worth smaller. Overall utilization read 5% where the truth is
  3%. A card in credit is now zero debt rather than a positive asset, deliberately: it is nearly always
  transient and folding it into net worth would make the trend jump on something that is not wealth.
- [x] **(build)** **Repair the trademark symbols mangled in transit** (`0036`). Not a migration bug:
  `0032` and `0034` are correct UTF-8 (`C2 AE`, verified), and the macOS clipboard carried raw bytes into
  the SQL editor which read them as MacRoman, so thirteen names rendered as "Chase Freedom Flex" plus two
  pieces of punctuation. The repair sets each name from a known-good value with `chr(174)` and
  `chr(8480)`, and contains no byte above ASCII anywhere including its comments, because a repair holding
  the sequence that got mangled would arrive as broken as the thing it repairs.
- [x] **(ops)** Apply `0035` and `0036` to the production Supabase project. Both applied; verified
  against `information_schema`.
- [ ] **(ops)** Apply `0037_card_art_urls.sql` to the production Supabase project. Fills `art_url` for
  15 of the 18 products; `0038` fills the remaining three. Ends with a verification SELECT: every row carrying a URL should report `ok`
  true. **Deploy the branch first** - the URLs point at `/card-art/*.webp` on Juniper's own origin, so
  applying it ahead of the deploy leaves 15 faces briefly falling back to the synthesized render.
- [x] **Decide where card art comes from.** Decided: rehost the issuers' own renders on Juniper's origin
  as a stopgap, margin-trimmed, with the issuers' placeholder cardholder names ("D. BARRETT",
  "LEE M CARDHOLDER", "LINDA WALKER") erased so a stranger's name never appears on a member's card.
  Unlicensed and knowingly so - see the header of `0037` for the full position and the one-line revert.
  Superseded the moment an affiliate brand pack lands, which is the same approval Stage 5 waits on.
- [x] **Card art, stage B: the three Chase Freedom cards** (`0038`). The ribbon mask is intersected with
  the upper-right corner triangle, which is what lets the colour threshold be loose enough to catch its
  antialiased edge without also erasing the word UNLIMITED. The ribbon juts past the card edge, so the
  card width is reconstructed from its height at the true 1.586 ratio rather than trimmed to the opaque
  bounds (which measured the ribbon: 1.519). All 18 products now carry art.
- [ ] **(ops)** Apply `0038_card_art_urls_chase.sql`. Same deploy-first rule as `0037`.
- [x] **Two-tier catalog** (`0039`). `card_products.tier` is `featured` (researched rates, feeds the
  earning guide and the switch and upgrade rows) or `listed` (name, issuer, network, fee, art -- exists
  so the Identify picker can name any card a member holds, and is kept out of everything rate-driven).
  `base_multiplier` became nullable so "no rate known" is representable instead of defaulting to a
  plausible-looking 1 percent, and 0031's points-need-a-valuation CHECK now binds featured rows only --
  otherwise naming a co-brand in a picker would require inventing a cents-per-point for every airline
  and hotel currency in the country.
- [x] **Eleven more Chase products** (`0040`, art in `0041`). Every Chase card that earns cash back or
  Ultimate Rewards: Sapphire Reserve, Reserve for Business, all four Ink cards, Amazon Visa, Prime Visa,
  DoorDash, Instacart, and Slate Edge as the first `listed` row. Rates read from the issuer's own
  rewards-program text rather than the comparison-page summary, so these eleven ship `verified = TRUE`.
  The ~30 co-brands are deliberately excluded: each earns its own currency and would need an invented
  valuation that then drives the dollar figures in "cards that would beat yours".
- [ ] **(ops)** Apply `0039`, `0040`, `0041` in order. Deploy first, as with `0037`.
- [x] **Benefits for the premium cards** (`0044`, schema in `0043`). 59 rows across the two Sapphire
  Reserves, Ink Business Preferred and Premier, and the three cards `0042` adds. Coverage LIMITS carry a
  NULL value rather than their limit: `value_amount` is summed by the tracker, so "up to $10,000 per
  item" of purchase protection is not $10,000 of annual value.
- [x] **`expires_on` on benefits** (`0043`). Card perks increasingly carry a published end date -- six of
  the Sapphire Reserve's do -- and without a column for it they had to be omitted entirely, because a
  tracker with no way to represent an ending would ask somebody in 2028 to use a credit that stopped in
  2027. `trackBenefits` drops an expired benefit before it reaches the tracker, the group counts or the
  unused-value total; the client shows "ends 31 Dec 2027" rather than letting one vanish silently.
- [x] **Three premium products** (`0042`, art in `0045`): Amex Platinum, Amex Gold, Capital One Venture X.
  Membership Rewards is valued at 1.0 cent -- Amex's own statement-credit floor, deliberately conservative
  -- on the same basis the Capital One miles row already used, so nothing is invented.
- [ ] **(ops)** Apply `0042`, `0043`, `0044`, `0045` in order. Deploy first, as with `0037`.
- [ ] **A merchant- and portal-scoped earn category.** The taxonomy cannot say "5 percent at Amazon",
  "8x through Chase Travel", "5x through Amex Travel" or "10x through Capital One Travel", so those rates
  are omitted and the cards are understated: Prime Visa, Amazon Visa, DoorDash, Instacart, both Sapphire
  Reserves, Ink Business Premier, **and now the Amex Platinum and Venture X, whose every headline rate is
  portal-booked**. The Platinum consequently reads as a 1x card whose case is entirely its credits. Same
  shape as the rotating-category gap on Freedom Flex and Discover it. This is the fourth migration in a
  row to record the same omission and is now the largest single source of understatement in the catalog.
- [ ] **(ops)** Apply `0034` to the production Supabase project. `ON CONFLICT DO NOTHING` throughout, so
  it cannot disturb 0032's rows or anything already verified by hand.
- [x] **A credit limit on a hand-entered card** (`0046`). The only route that makes utilization agree
  with the member's own credit report, because the card it exists for can never arrive through Plaid:
  see the authorized-user entry below. `manual_accounts` (`0014`) already existed for "anything Plaid
  cannot reach, entered by hand" and its `category = 'credit'` rows already counted as card debt in net
  worth, so the one thing missing was the field utilization needs. A member could describe the card and
  still not fix the number, which is the worst of both. `0046` adds `credit_limit` (NULL means unknown,
  never zero, the convention `utilizationPct` already relies on) and `mask`, with a CHECK making a limit
  on a checking account unrepresentable and another refusing zero, since zero would divide.
  `/api/card-rewards` carries them to the Credit page, which counts them in utilization and badges them
  **"You added this"**, deliberately distinct from #211's "You set this": that one is a limit on a
  BANK-LINKED card, where Juniper can see the account and only the limit was missing. A manual card gets
  no `member_cards` row, so it is never in the Identify queue, never has rewards data, and contributes
  limit and balance only. States rendered in `design/manual-credit-card.html`.
- [x] **A member-typed limit still cannot reach the Juniper Score**, and that is now checkable rather
  than merely commented. Same rule as #211, and the whole risk in `0046`: the Score is a figure Juniper
  asserts from what it can measure, so a limit somebody typed must not move it, or the member is scoring
  themselves. The isolation is structural, not a convention. The shared `fetchManualAccounts` the score
  path reads does not request the column at all; a separate `fetchManualCreditAccounts` does, and only
  `api/card-rewards.ts` imports it. `scripts/src/check-manual-limit-isolation.ts` asserts the nine facts
  that hold that up (the shared select, the three score engines, the sole importer, both CHECKs, the
  migration's ASCII purity, and 0033's own positive-only CHECK), so widening the shared select fails a
  check rather than quietly making the Score member-editable. Also corrected a comment in
  `api/_finance-snapshot.ts` that `0046` had made stale: it said a hand-added card carries no credit line
  at all, which was the old reason for excluding it. A member can now enter one, and it is still
  excluded, on the stronger ground.
- [x] **(ops)** **`0046` applied to production on 2026-09-01, by Finley**, ahead of the deploy rather
  than after it, which is safe for this one: both columns are nullable and every read and write carries
  a fallback for their absence. Its verification SELECT returned exactly what the migration's own
  `Expect` comment predicted, **24 manual accounts, 0 with a limit, 0 with a mask**, so no existing row
  was touched. Verified before that against a scratch Postgres: `0014` then `0046` applies clean,
  re-running `0046` is a no-op, pre-existing rows survive with both columns NULL, and the CHECKs refuse
  a limit on a banking account, a zero limit and a negative one.
- [ ] **Four manual credit accounts already exist in production**, which that same SELECT surfaced and
  the plan for this work did not anticipate: `credit_accounts = 4`, none of them with a limit. They have
  been counting as card debt in net worth since `0014` and were invisible on the Credit page, and the
  moment this ships all four appear there, badged "You added this", reading "no limit added" and "Used:
  Unknown", and the utilization line says four more are excluded for having no limit. Nothing is wrong
  with that, it is the feature working on data that predates it, but it means the first thing this
  change does for the real member is add four rows rather than fix one number, so **look at those four
  before assuming the page is wrong**. Any of them that are real cards want their limits; any that are
  duplicates of a Plaid-linked card want removing, since a duplicate would double-count in both net
  worth and utilization - Finley
- [ ] **Confirm the four figures on the real member's Credit page** once `0046` is applied and the
  Freedom Unlimited is entered by hand ($20,000 limit, mask 4417, balance $0). Expect **$562 of $37,900
  across 4 cards**, which rounds to **1 percent** (`562 / 37900 = 1.48`), the card badged "You added
  this", the card ABSENT from the Identify prompt, and the **Juniper Score unchanged by the addition**.
  The last of those is the one that proves the score isolation held in production rather than only in the
  check script. Note the plan for this work predicted 2 percent, which was a rounding slip; 1 percent is
  the correct reading of the same arithmetic - Finley
- [x] **The wallet draws the cards still to be identified**, which reverses a deliberate decision and
  is recorded as a reversal rather than as a new feature. `CardWallet` filtered to
  `cards.filter(c => c.product)` and its docblock gave the reason: an unidentified card has no brand
  colour to borrow, so an outline in the pocket would read as a rendering fault rather than as a card
  waiting to be named. **The evidence came back against it.** The header beside the stack says "2 of 3
  cards identified, 1 still to go", and a real member read that against a stack of two as their Chase
  card having gone MISSING, which is precisely the confusion the original decision meant to prevent,
  and the worse thing to imply on a money page. The outline is now drawn through `CardFace`'s existing
  `unknown` prop with a `label`, the same pair the Identify prompt itself uses, and it is TAPPABLE
  straight through to the picker: an outline that does nothing is what the original comment was rightly
  afraid of, and an outline that takes you to the answer is not the same object. Drawn last, which in
  this layout means at the front and fully visible, because it is the only slot in the pocket with
  something to do. The picker is opened from a distance through an `openRequest` counter on
  `CardIdentifyPrompt`, a counter rather than a boolean so the same slot can be tapped again after a
  dismissal, rather than mounting a second picker in the hero. No new CSS. The docblock was rewritten
  rather than left asserting the opposite of the code, and it records what changed and what changed it.
  States rendered in `design/card-wallet-unidentified.html`.
- [x] **A manual account can be edited in place.** Closes the loop `0046` opened: Connections offered
  add and remove only, so a member who entered a card and left the limit blank had to remove it and add
  it again, and the Credit page had to link to "Manage on Connections" because it could not honestly
  promise an editor. It says **"Edit on Connections"** now. Treatment B of three, rendered in
  `design/manual-edit-variants.html`: an `Edit` control on the manual row reopens the SAME
  `ModalBackdrop` that "Add an account" uses, with `ManualAccountForm` prefilled and the heading naming
  the account, since the row it describes sits behind the backdrop. One component for add and edit, so
  there is one description of what a credit limit is for rather than two free to drift. No new endpoint:
  `/api/manual-accounts` has updated in place when given an `id` since `0014` and nothing had ever sent
  one. Two things the build turned up rather than assumed: the form is **keyed** on the account so
  switching targets remounts it (its fields seed from initial state, and a stale field on a form that
  writes a credit limit is the wrong place to be clever), and closing the modal clears the edit target,
  without which the next "Add an account" would open prefilled and silently overwrite. `credit_limit`
  and `mask` are deliberately NOT treated alike when their fields are hidden: the limit must be cleared,
  because `0046`'s CHECK refuses one outside the credit category, while a mask is valid on any category
  and is preserved, since clearing it would be silent data loss decided by a layout choice.
- [ ] **The $20,000 Chase Freedom Unlimited is an authorized-user card on somebody else's login, so
  Plaid can never return it. Blocked on a credit-data provider, not on relinking.** Reconciled against
  Credit Karma on 2026-08-31: CK reports $37,900 of limit across four cards (Freedom Unlimited $20,000,
  Sapphire Preferred $9,000, Discover it Chrome $4,500, Quicksilver Student $4,400) and Juniper sees
  $17,900 across three. The $20,000 difference is exactly the Freedom Unlimited. The cause, established
  2026-09-01: the card was issued ~2023 as an authorized-user card on Finley's father's Chase login, and
  Finley holds no credentials for it. Plaid returns only the accounts belonging to the login it
  authenticates, so **no Chase credential Finley holds will ever surface this card**, and relinking Chase
  cannot help. Credit Karma, Monarch and Chase's own site show it because they read credit-bureau data
  rather than linked accounts. This supersedes the two earlier hypotheses recorded here (a second
  unlinked Chase login, and deselection during Link's account-selection step); **both were wrong**, and
  the stored snapshot was never the cause either (`sanitizeAccounts` drops nothing and
  `networth-snapshot` rewrites the account list from Plaid's live response on every run). Not fixable
  through Plaid at all: it is gated on the same credit-data provider Stage 10 score tracking waits on.
  A member-entered manual credit account is the only route that makes the figures match the report.
  Affects net worth and utilization, not just this page
- [ ] **Utilization and the Juniper Score read low on limit for this member, and it is not an
  arithmetic bug.** A consequence of the authorized-user card above, recorded separately so nobody
  re-diagnoses it in the code: with a $562 balance, Juniper computes `$562 / $17,900 = 3%` while the
  bureau computes `$562 / $37,900 = 1.5%`, because Juniper's denominator is missing the $20,000 limit it
  cannot see. Juniper therefore runs **high**, in the safe direction. Immaterial at this balance,
  material if a balance is ever carried. The Juniper Score inherits the same skew through its
  utilization factor. The arithmetic in `api/_credit-balance.ts` is correct; the denominator is
  incomplete. Closes when the limit is present, whether by a manual credit account or by a provider
- [ ] **Set a limit on a real card and confirm the Identify prompt still counts it.** The one assumption
  in #211 that has never touched Postgres: `product_answered` is written FALSE only when a limit
  CREATES the row, so setting a limit on an unidentified card must leave it in the Identify queue. If it
  is wrong the card silently leaves that queue and never gets its rewards data, with nothing on screen
  to explain why. Capital One ····5012 is the card to try it on, since it reports no limit and is not
  yet identified. Also worth checking on the same pass: the row reads "$328 of $8,000 limit" with a
  "You set this" badge, and the utilization line picks the card up and says one of its limits came from
  the member - Finley
- [x] **The wallet holds the hand-entered card too.** Reported on 2026-09-01 after `0046` shipped: the
  Credit cards list said **4 cards** and the wallet under it said **3**, with the Freedom Unlimited the
  one absent. The same shape of complaint that drove the wallet change above, and the same answer, so
  the counts agree again. Treatment A of three, rendered in `design/wallet-manual-card-variants.html`.
  `CardFace` gained a THIRD state, `hand`, rather than reusing `unknown`, and the distinction is the
  point: an unknown face is a QUESTION Juniper is asking, drawn as a prompt and tappable through to the
  picker; a hand-entered face is an ANSWER the member already gave in full, with a real name and mask,
  and it is tappable only to raise it like any other card. It carries no brand colour and no art because
  no catalog product was named, which is a fact about the catalog rather than about the member, so it is
  drawn as a neutral face with a dashed edge rather than as an outline that would read as broken.
  The hero's count had to change with it: "N of M identified" cannot describe a stack that now holds a
  card which can never be identified, because counting it in M leaves a total that never completes and
  leaving it out contradicts the pocket beside it. It counts LINKED cards, says so, and names the
  hand-entered ones separately. **Deliberate boundary, not an oversight:** a member whose ONLY credit
  card is hand-entered still sees no rewards hero at all, because `RewardsGuide` returns null without an
  identified card and there would be no rates, benefits or switch ideas to head. Their card still shows
  in the Credit list and in utilization. Rejected: letting a manual card be IDENTIFIED (treatment B),
  which `member_cards.plaid_account_id` would allow without a migration since it is plain TEXT with no
  foreign key, but the rewards maths keys on per-account spend from `transactions.account_id` that a
  hand-entered card has none of, so its rates would be right and its "what this is costing you" figures
  blank or wrong. Worth doing only alongside that.
- [x] **The issuer's mark comes off a card that has real art.** Reported on 2026-09-01 as "circles and
  squares overlaying the cards". They were institution logos: `.cr-face-logo` flattens Plaid's mark to a
  pure white silhouette (`brightness(0) invert(1)`), which is right on a synthesized face, since Plaid
  ships dark marks meant for a light tile and they would vanish into a navy card, and wrong twice on a
  face showing REAL ART. The artwork is the issuer's own branding, so the silhouette is a second mark
  competing with the first, and flattened to white it reads as a blank shape laid over the card. The
  issuer NAME takes its place, which is what the stylesheet was already written for:
  `.cr-pocket .cr-face-art .cr-face-iss` sets it white with a text-shadow for exactly this case and was
  unreachable for every institution that has a logo, which is most of them. Only the wallet strip ever
  saw it; a full face with art hides its whole top line. Verified that a card with a logo and NO art
  still draws the mark, which is the case the filter exists for.
- [x] **A hand-entered card can say which card it is** (`0047`), so it stops being the one face in the
  wallet Juniper cannot draw. The catalog has held the Freedom Unlimited artwork since `0038` and
  nothing could point at it. Treatment A of three, rendered in
  `design/manual-card-identity-variants.html`: one more credit-only field on the form that already
  edits the limit and the mask, so everything about the card is edited in one place.
  **IDENTITY ONLY, and that boundary is the whole design rather than a first phase.** The column buys
  the card its name, brand colour and art, and nothing else. `api/_rewards.ts` computes the guide, the
  switch ideas and the upgrade rows from per-ACCOUNT spend keyed on `transactions.account_id`, and a
  hand-entered account has no Plaid account id and therefore no transactions, ever, so any figure built
  on it would be computed over an empty spend set: "you are losing $0 a year on this card" is missing
  data wearing the clothes of a finding. `identityOf` in `api/card-rewards.ts` is the seam, resolving
  four presentation fields and never touching the `products` map that feeds the maths. The catalog is
  deliberately read twice, for two purposes. `scripts/src/check-manual-limit-isolation.ts` grew five
  checks to hold it, including that a manual row's `product_id` is read exactly once, so a second reader
  fails a check rather than quietly reaching the rewards figures. The `0046` rule is unchanged and
  restated in the migration, because this is exactly when a manual card starts looking like a linked one
  and a rule gets forgotten: the limit still never reaches the Score.
  **A bug the build turned up:** `identityOf` calls `artOf`, and `manual` is built before the
  no-linked-accounts early return, so with `artOf` declared where it used to sit it was in the temporal
  dead zone and naming a card threw a `ReferenceError`. It threw only once a card was actually named,
  which is to say only for the feature being added. The art map moved above its first use.
- [x] **The card art names the card, and the overlay stops competing with it.** Reported on 2026-09-01
  as the labels clogging the holder. The pocket painted issuer, mask and product name over every card,
  and the reason recorded in the stylesheet was that a covered card shows only its top 54px while the
  artwork's own name may sit below that line. **Rendered against the real catalog art, the premise did
  not hold:** all four of the member's cards print their own name inside the visible band (QUICKSILVER,
  DISCOVER it, SAPPHIRE PREFERRED, freedom UNLIMITED), and on the two Chase cards the overlay sat
  directly on top of the issuer's own wordmark, so it was covering a readable strip rather than rescuing
  an unreadable one. Treatment A of four, rendered in `design/wallet-label-variants.html`, which drew
  each option over the production artwork rather than over a mock. The mask STAYS, because it is the one
  thing the artwork can never carry and is what tells two Chase cards apart. The scrim narrows to match
  the one line it now covers. **A bug the render caught:** `.cr-face-top` is space-between, so removing
  the issuer left the mask an only child and it slid to the left edge, straight onto the Chase octagon
  the artwork prints there; it is pinned right, where it always sat. **Accepted and unchanged:** the
  Capital One art puts its wordmark top-right, so the mask overlaps it there, exactly as it did before
  this change. **The known risk, stated rather than designed around:** a future card whose art carries no
  name in its top 54px will read as four digits and a picture. The fix then is that card's art, not a
  label over every card in the catalog.
- [x] **The card holder is a real holder, and the member picks its material** (`0048`). Two defects
  behind the reported formatting errors, both arithmetic rather than taste: `FACE_H` in the component
  said 124 with a comment claiming it matched `.cr-face-lg`, which is **149px** at desktop, so every
  computed height was 25px short; and **nothing clipped the stack**, so collapsing reserved 148px for
  257px of content and 109px of card hung below the pocket front. The height is now derived from the
  ID-1 aspect ratio every credit card has (85.60 x 53.98mm) rather than from a constant that can go
  stale, and `.cr-holder-clip` clips. Collapsing also stopped hiding cards: it tightens the reveal, so a
  member with eight cards gets a shorter holder rather than a truncated one, which is what made "4 cards"
  sit above a stack of three.
  The construction follows a photographed holder (`design/card-holder-variants.html`, then
  `design/card-holder-b-refined.html`): each card sits behind a **slot band** lit along its top edge and
  casting a shadow onto the card below, and the **front card sits in a deeper pocket**. A hairline reads
  as a list; a lit band reads as material.
  **Six materials, chosen by the member**: cognac, black, saffiano, canvas, metal, minimal. Stored per
  MEMBER rather than per device, unlike the theme, because a theme is a property of the screen you are
  looking at and a holder is a thing you picked, so one that changed when you opened your laptop would be
  a bug. Organised by material and deliberately **not** by who the member is: a gendered split would make
  somebody sort themselves into a bucket before they could find a look they like, the bucket does not
  predict the answer, and the same range is reachable either way. The CHECK is a closed list because the
  value becomes part of a CSS class name, and `holderClass` falls back to the default for anything
  unrecognized rather than interpolating a stored string into the DOM. NULL means "has not chosen", which
  is not the same as choosing the default: if the default ever moves, an unchosen member moves with it.
  **A regression the render caught:** renaming the container from `.cr-pocket` to `.cr-holder` silently
  unhooked ten descendant rules, including the ones that hide the issuer and product name over card art,
  so the labels removed a change earlier came straight back. All ten rescoped.
  The real cost of the feature is not the styles, it is that six of them times light/dark times
  collapsed/expanded is 24 states, which is why the set is six and not ten.
- [x] **A cover on the front, and a tap opens the card rather than nudging it.** Two follow-ups from
  looking at the shipped holder beside the reference photograph. **The cover:** the front card used to
  lie fully visible on top of the pocket, which is not how a wallet works, so `.cr-holder-cover` now sits
  in front of the WHOLE stack and every card shows about a quarter of itself (`FACE_H / 4`), which is
  what the photograph shows and what makes four cards legible in the height of one. The foot sits on the
  cover rather than below it, so the holder does not grow a second seam-divided strip of leather under
  the cards. Each material has its own cover, since the panel is the same leather as the body.
  **The tap:** it moved the card seven pixels, a leftover from when the holder was a loose stack and
  raising a card was the only way to read the one behind it. With a cover in front of every card there is
  nothing to raise it out of, and seven pixels was never an answer to "what is this card". It now opens
  a **card sheet**, treatment A of three rendered in `design/card-holder-cover-preview.html`: the card at
  a size worth looking at with the figures the Credit list already shows, printed the same way. The
  figures are resolved on the SLOT rather than in the sheet, so `limitOf`'s precedence keeps one
  definition. `.cr-holder-card.up` is deleted rather than left dead.
  Verified against the real component on four cards chosen to exercise the rules: a card in credit reads
  "In credit" and 0% used rather than being drawn as debt, a card with no limit reads "Not known" and
  "Unknown" rather than 0%, a member-set limit is badged "Yours", and a hand-entered card carries "You
  added this".
  **Refined after seeing it on the real page:** the cover went from 54px to 84px, because at 54 it read
  as a strip laid under the cards rather than a pocket, and the front card in particular looked like it
  was resting against it instead of sitting down inside it. The sheet went from the standard 440px modal
  to a `narrow` 330px one with the card sized to fill it, since at the default width it read as a dialog
  that had taken over the page to show a preview: 24% of the viewport rather than most of it.
  **Collapse is gone.** It used to hide all but three cards, which is what made "4 cards" sit above a
  stack of three; that was fixed by making it tighten the reveal instead, and once it only moved a
  quarter-card's worth of height it was a control costing a line of copy to save 44px. The holder has one
  shape now: every card, a quarter of each, the cover across the front, and a foot that states the count.
  The clip's height and the cards' offsets are functions of the card count alone, so both transitions
  went with it rather than being left to animate a state change that no longer exists. The cover stays at
  84px: its depth is about looking like a wallet, not about fitting the text it lost.
- [ ] **(ops)** Apply `0048`. Deploy first, as with `0037`, though it is additive and safe either way:
  the column is nullable and an absent value renders the default holder. Verified against a scratch
  Postgres before shipping: `0001` then `0048` applies clean, re-running is a no-op, a pre-existing
  profile row survives with `holder_style` NULL, a known style is accepted, an unknown one is refused,
  and a value shaped to escape a class attribute is refused.
- [ ] **(ops)** Apply `0047`. Deploy first, as with `0037`, though it is additive and safe either way:
  the column is nullable and every read and write carries a fallback for its absence. Verified against a
  scratch Postgres before shipping: `0014`, `0046`, then `0047` applies clean, re-running is a no-op, two
  pre-existing rows survive with `product_id` NULL, a product on a banking account is refused, an unknown
  product id is refused by the FOREIGN KEY, and deleting a catalog product nulls the name rather than
  deleting the member's account.
- [ ] **(build)** Verify the 10 seeded products against their own `source_url` and flip `verified` to
  TRUE. An afternoon with ten tabs open, and the highest-value follow-up in this stage: until it is
  done every member sees the "not yet re-checked" caveat.
- [ ] **(build)** Shared caps. Discover it Chrome caps gas and restaurants at $1,000 a quarter
  COMBINED and `card_product_earn` caps per row, so the arithmetic is optimistic for somebody who
  spends heavily in both. The fine print on screen is right; a shared-cap column is the fix if a second
  card ever needs one.
- [ ] **(build)** Move `catalog` out of the `/api/card-rewards` response into its own searchable
  endpoint once the catalog passes a few hundred products. It rides along today only because ten
  products are free to send.
- [x] **The Juniper Score no longer flashes a number it cannot vouch for.** Reported from production on
  2026-09-01: a hard refresh showed **53**, then **97**. Not an arithmetic bug and not caused by the
  `0046` work, which never touched the score path. The cause is in the `lib/finances.ts` seam: the manual
  layer is built synchronously from the local profile so a hand-onboarded member sees their own figures
  on first paint instead of demo data, and that reasoning holds for balances, which are the member's own
  either way, and NOT for the score. The score is DERIVED, and each layer derives it from different
  inputs: the manual one computes from the income, spending and accounts typed at onboarding and passes
  no credit utilization at all. The seam assumed manual and live are alternatives; a member with a
  profile AND linked Plaid is both. Fixed with a `scorePending` flag (`loading && !raw`, exactly "the
  server has not answered yet") and treatment C of three, rendered in `design/score-flash-variants.html`:
  the surface keeps its exact shape and dashes the value. A failed fetch clears it, so a member with no
  server to ask still sees their own figures rather than a permanent dash. **The trade, stated because
  it is real:** a manual-only member now waits one round trip for their score, where it used to paint at
  once. The rest of their dashboard still paints immediately. Two things the build found that the mock
  did not predict: the card height was driven by the trend head's delta chip rather than by the
  paragraph, so the chip holds its place while pending, and the trend spark and its start value were
  still drawn from the manual layer, so a dashed "now" sat beside a manual "39". Verified against both
  real pages mounted with a deliberately slow `/api/finances`: every figure dashed at first paint, the
  manual score never rendered at all, and the card measured identical in both states (Overview 76px,
  Score 187px)
- [ ] **(build)** Widen the `/api/finances` rollup with `limit` and per-account spend, which is what
  would let the Credit page stop reading outside the `lib/finances.ts` seam. Open since #132, and this
  stage widened the exception by one endpoint rather than closing it.

## Stage 15: The member arranges their own Overview **(build)**, *shipped, behind one unapplied migration*

The dashboard was the most-visited page in the app and the same page for everybody, in an order
somebody chose once and re-argued in comments on the file more than once. It is now the member's:
which cards are on it, and in what order. Issue #251. Design record:
`design/dashboard-widgets-variants.html`, four rendered treatments, A chosen.

- [x] **(design)** Four treatments rendered and compared: the cards themselves as the editor (A), a
  list of widget names in a side panel (B), the page shrunk to a labelled map in a sheet (C), and a
  hybrid holding scale copies of the real cards (D). **A chosen**, because it is the only one where
  the member is looking at the actual card while deciding whether they want it. The cost is real and
  was named rather than designed around: the drags are 300px cards, so a keyboard path had to be built
  beside it rather than after it.
- [x] **(build)** `dashboard_layout` on `user_profiles` (migration `0049`), holding **the order and
  the hidden set, never the visible list**. A widget added later is absent from every layout saved
  before it existed, so a stored visible list would switch every new card OFF for every existing
  member, with nothing on screen to say one exists, and it would do it to exactly the people who have
  used Juniper long enough to have arranged their page. The CHECK constrains the SHAPE and
  deliberately not the widget ids, unlike `holder_style` in `0048`: the ids are the app's registry, so
  a closed list would mean a migration before every new card.
- [x] **(build)** The registry and the reconciliation in `src/lib/dashboard-layout.ts`. A widget the
  stored order does not mention keeps its REGISTRY position rather than being appended, so a card
  added in the middle of the default lands in the middle for a member who arranged the ones around it.
  Absence means "the registry decides", which is what lets a widget ship off.
- [x] **(build)** Two widgets that ship OFF, in the shelf: **Cards and rewards** (Credit) and
  **Recurring charges** (Transactions). Off because #251's own rule is that a member who never touches
  this sees exactly the page they saw before, and a summary of a surface that already has its own page
  should be something they asked for. A widget in the shelf costs nothing: both hooks take `active` and
  do not fetch while it is false.
- [x] **(build)** One set of rows behind both surfaces. `src/lib/credit-cards.ts` now owns the card
  projection, the limit precedence and the utilization figure, and the Credit page reads it too, so the
  widget and the page cannot answer "what is your utilization" differently. Same failure the shared
  "Together" total had when a figure was derived apart from the list it sat above.
- [x] **(build)** A hidden widget cannot hide a fact. The member-set-limit note travels with
  utilization, the point-value disclosure with a rewards rate, the unset-cadence count with the
  recurring total, in the widget as on the page.
- [x] **(build)** An empty widget does not hold its slot: it collapses out of the live page and is
  drawn as a dashed placeholder ONLY while arranging, so the slot the member gave it is still theirs to
  move. `ConnectNudge` is not a widget and never enters the order.
- [x] **(build)** Pointer events rather than the native HTML5 drag, which does not fire for touch at
  all, plus a real keyboard path: every grip is a button, and the arrow keys move the card it belongs
  to, with the move announced. Three stale-closure bugs were caught by driving the real component
  rather than by reading it: two shelf chips tapped in one tick put only one widget back, a held arrow
  key would have done the same, and a fast tap could leave the board stuck mid-drag. The order, the
  hidden set and the dragged id are all refs for that reason.
- [x] **(ops)** **`0049` applied to production on 2026-09-01, by Finley**, before the deploy. Its
  verification SELECT returned exactly what the migration's own `Expect` comment predicted,
  **4 profiles, 0 arranged**, so no existing row was touched. Additive and safe in either order with
  the deploy anyway: the column is nullable and a member with no layout gets the
  default order, which is the page exactly as it stands today. Verified against a scratch Postgres
  before shipping: `0001` then `0049` applies clean, re-running is a no-op, a pre-existing profile row
  survives with `dashboard_layout` NULL, a real layout is accepted, and each of a non-object, a
  non-string id, a missing `order`, a missing `hidden`, a string `v` and a 65-element order is refused.
  **The missing-key cases are the ones worth knowing about:** `->` on an absent key returns SQL NULL,
  `jsonb_typeof(NULL)` is NULL, and a CHECK whose expression is NULL PASSES, so the first version of
  the constraint accepted a layout with no `order` at all - Finley
- [ ] **(build)** Personal Overview only, deliberately. The shared space builds its nav from what the
  partnership holds rather than from a declaration (`components/juniper/shared-frame.tsx`), so "which
  cards are on it" is already answered there by the content, and a second, member-owned answer would be
  a third source of truth about a page two people share. Whether one member may arrange a page both of
  them look at is a question about the partnership, not about layout - Finley
- [ ] **(build)** Resizable widgets, a widget gallery, and per-widget settings are out of scope and
  stay out. Order and visibility only. The nearest real request beyond that is a card the member
  DEFINES (pick a category, pick a metric), which needs a stored definition per card rather than a
  stored order, and is a different feature - Finley
- [ ] **(build)** Five more widgets could ship off in the shelf with an hour each, since each is an
  existing component with a home page: Score levers, Benefits tracker, Connection health, and the
  Together summary. Not built - Finley

## Critical path (read this first)

**Stages 3 → 4 are the real product.** Everything Mint-like ("I miss the budgeting / expense reports") lives in **Stage 3**, which is gated on **Plaid transactions + Production access (Stage 6)**. Design and shell (Stages 1–2) are fast; the **data engine (Stage 3) is where the real weeks go.**

**Suggested sequence:** resolve **Stage 0** → finish the key **Stage 1** screens → start **Stage 3** on Plaid **Sandbox** transactions in parallel (don't wait on Production) → layer Stage 4 Score on top → then Stages 5–8.

## Reuse inventory (already built — see PROJECT.md)

Plaid account linking (Sandbox), three-tier account discovery (Layer seam + multi-select gallery + manual add, Stage 13), marketplace listings (`partners.ts`, 22 seeded), cross-plan portfolio summary, 5 planning domains, partner invites + alignment, projection charts, affiliate click-out plumbing (`affiliate_click` + FTC disclosure), GA4 `engaged_session` instrumentation, Supabase auth + RLS patterns, Growth Sheets pipeline.
