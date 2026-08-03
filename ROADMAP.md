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

## Stage 2 — Rebuild the shell in the real codebase **(build)**

- [ ] Stand up `DESIGN.md` + Tailwind theme from the locked Juniper.com tokens (cream/serif, warm-brown dark)
- [ ] New top nav + routing, replacing the plan-centric shell ♻️ *(`pages/app-shell.tsx`, wouter sub-routes)*
- [ ] Embed the real logo + app icons across the app shell ♻️ *(`public/logo.png`, `site.webmanifest`)*
- [ ] Port pages to React components: Home, Spending, Plans, Marketplace, Accounts, Score
- [ ] Fold in existing surfaces ♻️ *(plans, `partners.ts` marketplace, `portfolio-summary.tsx`, Plaid `connections.tsx`)*

---

## Stage 3 — Data spine: transactions → categories → budgets ⚠️ **(build)**

**The core of the Mint pitch. None of this exists yet — the biggest single lift.**

- [ ] Add Plaid `transactions` product (plus `liabilities` / `investments`); sync + store ♻️ *(extends `api/plaid/*`, `PLAID_PRODUCTS`, `plaid_items`)*
- [ ] Transactions schema + owner RLS + Data API grants
- [ ] Categorization engine — Plaid categories + merchant rules + user overrides
- [ ] Budgets — schema, CRUD, monthly rollups, over-budget logic
- [ ] Net worth history — daily balance snapshots (Plaid returns current balances only) to build the trend line
- [ ] Wire Home / Spending / Accounts to real data (replace mock)

---

## Stage 4 — Juniper Score engine **(build)**

*Decided: proprietary 0–100 Juniper Score; credit shown as a factor (Stage 0).*

- [ ] Define factors, weights, formula — savings rate, DTI/debt load, emergency-fund months, retirement pace, credit health
- [ ] Compute from Stage 3 data; store score history for the 8-month trend
- [ ] Generate ranked "ways to improve" from factor gaps; cross-link each to the relevant plan

---

## Stage 5 — Marketplace + monetization **(build + compliance)**

- [ ] Migrate `partners.ts` → a `partners` table (edit offers without a deploy) ♻️
- [ ] Merchant **self-listing** submission + moderation queue (the supply side)
- [ ] Affiliate link / subid management; keep FTC disclosure + `affiliate_click` tracking ♻️
- [ ] Rank offers by estimated benefit to the user (not payout)
- [ ] **(compliance)** Approved affiliate programs, real URLs, category-specific disclosures/licensing (mortgage, insurance, credit, legal) — replaces all `example.com` placeholders

---

## Stage 6 — Compliance & data gates **(compliance)**

- [ ] Plaid **Production** access — application review, beneficial owners, billing; flip `PLAID_ENV=production`
- [ ] Financial-data terms of service + privacy policy
- [ ] Security review of the new data surfaces (transactions, balances, score inputs)
- [ ] Configure Anthropic API spending limits *(open loop from PROJECT.md)*

---

## Stage 7 — Reframe Plans + couples **(build)**

- [ ] Reframe the 5 planning domains as goals inside the new dashboard (funded from real balances) ♻️
- [ ] Apply the audience decision — **solo default with "invite partner" layer** ♻️ *(decided Stage 0; partner invites + alignment already built)*
- [ ] Auto-fill plan inputs (savings / debt) from linked balances *(open loop from PROJECT.md)*

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

## Critical path (read this first)

**Stages 3 → 4 are the real product.** Everything Mint-like ("I miss the budgeting / expense reports") lives in **Stage 3**, which is gated on **Plaid transactions + Production access (Stage 6)**. Design and shell (Stages 1–2) are fast; the **data engine (Stage 3) is where the real weeks go.**

**Suggested sequence:** resolve **Stage 0** → finish the key **Stage 1** screens → start **Stage 3** on Plaid **Sandbox** transactions in parallel (don't wait on Production) → layer Stage 4 Score on top → then Stages 5–8.

## Reuse inventory (already built — see PROJECT.md)

Plaid account linking (Sandbox), marketplace listings (`partners.ts`, 22 seeded), cross-plan portfolio summary, 5 planning domains, partner invites + alignment, projection charts, affiliate click-out plumbing (`affiliate_click` + FTC disclosure), GA4 `engaged_session` instrumentation, Supabase auth + RLS patterns, Growth Sheets pipeline.
