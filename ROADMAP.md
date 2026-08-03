# Juniper Roadmap — Repositioning to a financial planning app

*Owner: Finley · Started: 2026-08-03 · Status: design prototype approved, build not started*

## What this is

Juniper is being repositioned from a **couples-first AI planning copilot** into a **financial planning app for young individuals and families** — Mint/Monarch-style budgeting and net-worth tracking, a holistic **Juniper Score** (Credit-Karma model), a **marketplace** with affiliate monetization, and planning as the value-add on top.

This roadmap tracks the work to take the approved design prototype (a clickable mock, mock data) to a shipped product in the real stack (React + Vite frontend, Vercel Edge functions, Supabase/Postgres, Plaid, Anthropic).

### Design direction (locked)

- **Post-login home:** Mint-style dashboard — net worth + plans hero, spending-by-category, budgets, transactions, accounts.
- **Recommendations:** live **only inside a relevant plan** and on the **Score breakdown** page — never floating on the dashboard.
- **Visual identity:** **Juniper.com** skin — warm cream `#FAF7F2` + serif display (matches the live marketing site), warm-brown dark mode. Real bonsai logo (`artifacts/juniper/public/logo.png`).
- **Prototype reference:** interactive design mock covering Home, Spending, Plans, Marketplace, Accounts, and the Score breakdown (kept outside the repo; not production code).

### Status legend

- [ ] not started · [~] in progress · [x] done
- Tags: **(design)** · **(build)** · **(compliance)** · **(growth)**
- ⚠️ = critical path / biggest lift · ♻️ = existing code to reuse

---

## Stage 0 — Lock open product decisions ⚠️ *(blocks build)*

Each of these changes what gets built. Resolve before Stage 2+.

- [ ] **Score model** — proprietary 0–100 "Juniper Score" vs leading with the 300–850 credit number. *(Recommend: proprietary score, credit shown as a factor.)*
- [ ] **Audience default** — individual-first with "invite partner" as a layer, vs ask at onboarding. *(Today's app is couples-first; this sets how much gets reframed — see Stage 7.)*
- [ ] **"Ask Juniper" Q&A** — include an LLM advisor surface (Reddit ask: investing / transaction structuring) or cut for v1. *(Not yet designed.)*
- [ ] **v1 data depth** — ship on Sandbox/mock to validate the concept, vs block launch on real Plaid transactions.

---

## Stage 1 — Finish the design **(design)**

Shell is done; remaining screens and states:

- [ ] First-run onboarding — "Connect your accounts", reskinned to Juniper.com ♻️ *(exists: `first-run-onboarding.tsx`)*
- [ ] Empty / loading / error states — no accounts, no transactions, no plans; skeleton loaders
- [ ] Plan detail screen (full)
- [ ] Marketplace: listing detail + "List your service" merchant submission flow
- [ ] Interaction states: edit transaction category, edit budget, add/adjust goal
- [ ] Spending sub-tabs: Transactions table, Recurring
- [ ] "Ask Juniper" Q&A surface *(only if kept in Stage 0)*
- [ ] Responsive / mobile layouts for all surfaces

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
- [ ] Apply the Stage 0 audience decision — solo default with "invite partner" layer, or dual-path ♻️ *(partner invites, alignment already built)*
- [ ] Auto-fill plan inputs (savings / debt) from linked balances *(open loop from PROJECT.md)*

---

## Stage 8 — Launch to 20 active users **(build + growth)**

- [ ] Analytics on all new surfaces ♻️ *(GA4 `engaged_session` + Sheets pipeline exist)*
- [ ] Notifications — score change, budget over, bill due
- [ ] QA pass + performance + accessibility
- [ ] Private beta → **20 active users** goal
- [ ] Iterate on activation / retention from usage data

---

## Critical path (read this first)

**Stages 3 → 4 are the real product.** Everything Mint-like ("I miss the budgeting / expense reports") lives in **Stage 3**, which is gated on **Plaid transactions + Production access (Stage 6)**. Design and shell (Stages 1–2) are fast; the **data engine (Stage 3) is where the real weeks go.**

**Suggested sequence:** resolve **Stage 0** → finish the key **Stage 1** screens → start **Stage 3** on Plaid **Sandbox** transactions in parallel (don't wait on Production) → layer Stage 4 Score on top → then Stages 5–8.

## Reuse inventory (already built — see PROJECT.md)

Plaid account linking (Sandbox), marketplace listings (`partners.ts`, 22 seeded), cross-plan portfolio summary, 5 planning domains, partner invites + alignment, projection charts, affiliate click-out plumbing (`affiliate_click` + FTC disclosure), GA4 `engaged_session` instrumentation, Supabase auth + RLS patterns, Growth Sheets pipeline.
