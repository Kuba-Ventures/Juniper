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

- [~] **(build)** Recurring/subscription detection from transactions ♻️ *(uses Stage 3 data spine)*. Built and deployed in PR #155: Plaid's `/transactions/recurring/get` generates candidates, `recurring_streams` caches them, `recurring_overrides` holds the member's own confirmations, and nothing counts toward a total until the member confirms it. Design and rationale in docs/RECURRING_DETECTION.md. **Blocked on an entitlement, not on code:** production logs on 2026-08-28 show every item refused with `INVALID_PRODUCT client is not authorized to access the following products: ["recurring_transactions"]`. It is a separate Plaid add-on, requested 2026-08-28 and **granted 2026-08-31**. `recurring_transactions` was added to `additional_consented_products` in `api/plaid/link-token.ts` that day, which was the one code change the entitlement gated; the sync needed none, because it reads availability from Plaid's answer at runtime. **Still to verify in production:** that `/link/token/create` succeeds under the longer product list (it fails for everyone if Plaid refuses one), that a sync now returns streams rather than `available: false`, and whether the seven items linked before the change need a relink to consent, the way Investments did in #144
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
- [ ] **(ops)** Apply `0035` to the production Supabase project. Nothing changes on screen until a URL
  is set, which is what makes it safe to apply ahead of any licensing decision.
- [ ] **Decide where card art comes from, or decide not to have it.** The plumbing is done and the
  column is empty. The cheapest option (hotlinking issuer URLs) is also the least defensible; the
  cleanest (an affiliate program's brand pack) is the same approval the marketplace already waits on - Finley
- [ ] **(ops)** Apply `0034` to the production Supabase project. `ON CONFLICT DO NOTHING` throughout, so
  it cannot disturb 0032's rows or anything already verified by hand.
- [ ] **The Chase card Juniper sees is the Sapphire Preferred, and a second Chase card is not linked at
  all.** Reconciled against Credit Karma on 2026-08-31: CK reports $37,900 of limit across four cards
  (Freedom Unlimited $20,000, Sapphire Preferred $9,000, Discover it Chrome $4,500, Quicksilver Student
  $4,400) and Juniper sees $17,900 across three. The $20,000 difference is exactly the Freedom Unlimited.
  The stored snapshot is not the cause: `sanitizeAccounts` drops nothing and `networth-snapshot` rewrites
  the account list from Plaid's live response on every run. So either it sits behind a second Chase login
  that was never linked, or it was deselected during Link's account-selection step. Affects net worth and
  utilization, not just this page - Finley
- [ ] **Set a limit on a real card and confirm the Identify prompt still counts it.** The one assumption
  in #211 that has never touched Postgres: `product_answered` is written FALSE only when a limit
  CREATES the row, so setting a limit on an unidentified card must leave it in the Identify queue. If it
  is wrong the card silently leaves that queue and never gets its rewards data, with nothing on screen
  to explain why. Capital One ····5012 is the card to try it on, since it reports no limit and is not
  yet identified. Also worth checking on the same pass: the row reads "$328 of $8,000 limit" with a
  "You set this" badge, and the utilization line picks the card up and says one of its limits came from
  the member - Finley
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
- [ ] **(build)** Widen the `/api/finances` rollup with `limit` and per-account spend, which is what
  would let the Credit page stop reading outside the `lib/finances.ts` seam. Open since #132, and this
  stage widened the exception by one endpoint rather than closing it.

## Critical path (read this first)

**Stages 3 → 4 are the real product.** Everything Mint-like ("I miss the budgeting / expense reports") lives in **Stage 3**, which is gated on **Plaid transactions + Production access (Stage 6)**. Design and shell (Stages 1–2) are fast; the **data engine (Stage 3) is where the real weeks go.**

**Suggested sequence:** resolve **Stage 0** → finish the key **Stage 1** screens → start **Stage 3** on Plaid **Sandbox** transactions in parallel (don't wait on Production) → layer Stage 4 Score on top → then Stages 5–8.

## Reuse inventory (already built — see PROJECT.md)

Plaid account linking (Sandbox), three-tier account discovery (Layer seam + multi-select gallery + manual add, Stage 13), marketplace listings (`partners.ts`, 22 seeded), cross-plan portfolio summary, 5 planning domains, partner invites + alignment, projection charts, affiliate click-out plumbing (`affiliate_click` + FTC disclosure), GA4 `engaged_session` instrumentation, Supabase auth + RLS patterns, Growth Sheets pipeline.
