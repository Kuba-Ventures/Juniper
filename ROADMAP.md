# Juniper Roadmap — Repositioning to a financial planning app

*Owner: Finley · Started: 2026-08-03 · Status: Stage 0 decisions locked (2026-08-03) · build not started*

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

- [ ] First-run onboarding — "Connect your accounts", reskinned to Juniper.com ♻️ *(exists: `first-run-onboarding.tsx`)*
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
- **3b — Transactions sync** [ ] Add `transactions` to `PLAID_PRODUCTS`; `api/plaid/transactions-sync.ts` pulling Plaid `/transactions/sync` by cursor into the table (service-role, user-scoped, dedup on `plaid_transaction_id`).
- **3c — Categorization** [ ] Map Plaid `personal_finance_category.primary` → Juniper categories (Housing, Groceries & dining, …) + merchant rules + user overrides (`category` / `category_source`).
- **3d — Budgets** [ ] CRUD + monthly rollups (spent per category from transactions) + over-budget logic.
- **3e — Net worth history** [ ] Daily balance snapshots (Plaid returns current balances only) → the trend line.
- **3f — Frontend data layer** [x] the seam is in: `src/lib/finances.ts` (`useFinances()`) + read endpoint `GET /api/finances` (server-side rollups: spending-by-category, budgets-with-spent, cashflow, recent tx, grouped accounts, net-worth series). Starts on the demo mock, fetches live, and **swaps to real data only when linked + synced** (else stays mock — nothing breaks pre-gates). **Home is wired.** Remaining polish: adopt the hook in Spending/Accounts too, and add a sync trigger (call `POST /api/plaid/transactions-sync`, e.g. on link / periodically).

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

- [ ] Plaid **Production** access — application review, beneficial owners, billing; flip `PLAID_ENV=production`
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

- [ ] **(build)** Recurring/subscription detection from transactions — group by merchant + cadence, surface amount, next charge date, and price hikes ♻️ *(uses Stage 3 data spine)*
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

- [ ] **"Ask Juniper"** LLM advisor — money Q&A (investing, transaction structuring) with dashboard context; needs prompt safety + financial-advice disclaimers *(deferred from Stage 0)*
- [ ] Plaid data tiers beyond transactions (liabilities / investments) into plan auto-fill *(open loop from PROJECT.md)*
- [ ] Cross-device sync for "accounts I use" *(open loop from PROJECT.md)*

---

## Stage 12 — Auth & onboarding flow **(design + build)**

The front door: a branded **log-in / sign-up** experience and the first-run path from account creation → connect accounts → first dashboard. Supabase Auth + RLS already exist under the hood (see reuse inventory) — this stage is the *product* layer on top: the screens, the reskin to the current cool-off-white + pine identity, and the sequencing into the app.

**Sequencing:** best done **alongside finalizing the page designs (Stage 1)** so the auth screens share the locked visual system, and **before launch (Stage 8)** since new users can't reach the product without it. It's split out as its own stage so the sign-up funnel gets deliberate design attention rather than being an afterthought.

- [ ] **(design)** Sign-up / log-in / password-reset screens in the pine identity — mock first (matching `design/juniper-app-mock.html`), then port
- [ ] **(design)** First-run onboarding sequence: create account → *(optional)* invite partner → **connect accounts** (reuse `connections.tsx`) → land on dashboard (mock fallback until synced)
- [ ] **(build)** Wire screens to Supabase Auth (email/password + magic link; consider Google OAuth); session + `RequireAuth` already route `/app/*`
- [ ] **(build)** Empty/first-run dashboard state — the "connect your first account" nudge that flips to live data once synced (ties into Stage 3f `useFinances`)
- [ ] Account settings surface — profile, linked institutions (Connections), partner, sign-out

---

## Critical path (read this first)

**Stages 3 → 4 are the real product.** Everything Mint-like ("I miss the budgeting / expense reports") lives in **Stage 3**, which is gated on **Plaid transactions + Production access (Stage 6)**. Design and shell (Stages 1–2) are fast; the **data engine (Stage 3) is where the real weeks go.**

**Suggested sequence:** resolve **Stage 0** → finish the key **Stage 1** screens → start **Stage 3** on Plaid **Sandbox** transactions in parallel (don't wait on Production) → layer Stage 4 Score on top → then Stages 5–8.

## Reuse inventory (already built — see PROJECT.md)

Plaid account linking (Sandbox), marketplace listings (`partners.ts`, 22 seeded), cross-plan portfolio summary, 5 planning domains, partner invites + alignment, projection charts, affiliate click-out plumbing (`affiliate_click` + FTC disclosure), GA4 `engaged_session` instrumentation, Supabase auth + RLS patterns, Growth Sheets pipeline.
