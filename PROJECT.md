# Juniper
*AI copilot for couples navigating major financial life transitions.*

*Last updated: 2026-07-06 by kuba-vault*

---

## TL;DR

Juniper helps engaged and newly married couples model the financial tradeoffs behind big decisions (buying a home, combining finances, paying down debt, planning for a baby, prenups) and align on them before commitments are made. All five domains run end-to-end in production at `juniper-api-server.vercel.app`. This session (23 PRs) reworked onboarding from an open-ended per-turn LLM chat into a guided, tap-first flow: structured choice/money/timeline steps are answered client-side with no LLM call, a live plan-preview card fills in as answers arrive, and only synthesis (plus rare sensitive free-text steps) still hits Anthropic — cutting per-plan LLM spend sharply. Completed plans gained interest-aware savings/debt projection charts, affiliate click-out recommendation cards, a debt-list builder that feeds the payoff projection, and next actions that each link out or offer a "How?" walkthrough. A single first-run onboarding flow (snapshot + goals + "accounts I use" connections) and a "reset plans & preferences" testing control also shipped. Next: partner URLs and rates are still demo placeholders — real affiliate programs, disclosures, and (for regulated categories) licensing are required before going live.

---

## What it is

**The problem:** Couples make huge financial decisions (home, debt, kids, prenups) without forward-looking modeling, and money conversations between partners are emotionally loaded and often avoided.
**The solution:** A neutral AI copilot that runs each partner through the same scripted dialogue, synthesizes a shared plan, and shows side-by-side where they agree and where they don't.
**The user:** Engaged or newly married couples, late 20s to early 40s.
**The value:** A structured, low-emotion way to surface tradeoffs and align before the irrevocable decision gets made.

---

## Status

- **Phase:** post-MVP iteration
- **Engagement manager:** self-directed
- **Lead:** Finley
- **Cadence:** N/A (internal build)
- **Next milestone:** Approved affiliate programs + real partner URLs/rates/disclosures before monetized surfaces go live — TBD
- **Flags:** shipping (23 PRs merged this session; `main` at merge of PR #23)

---

## Where we are right now

Onboarding was rebuilt this session. The plan dialogue used to make an LLM call every turn; now the structured steps (choice/money/timeline) across all five plans are answered client-side with no Anthropic call, a live plan-preview card fills in as answers land, an "N questions left" countdown shows progress, and the plan appears instantly at the end. Only genuinely open/sensitive steps (e.g. Prenup carveouts) stay as `text` LLM steps, and synthesis is still the one LLM call per plan — so per-plan LLM spend dropped a lot. Completed plans got materially richer: interest-aware SVG projection charts (savings mode solves the required monthly contribution and lets the user edit "I can save $X/mo"; debt mode contrasts a 0% balance transfer vs a typical APR), affiliate click-out recommendation cards, a debt-list builder that sums balances and blends APR into the payoff projection, and next actions that each either link out (affiliate or a free resource like Credit Karma) or offer a "How?" button that asks the plan chat to walk the step. A single first-run onboarding flow (name → snapshot → goals → grouped "accounts I use") now gates new users, and money steps pre-fill from the saved profile. A "Reset plans & preferences" testing control wipes plans + profile via new owner-scoped DELETE endpoints. The one thing gating a monetized launch: every partner URL and rate is a demo placeholder.

---

## What's built

**Frontend / UI**
- React + Vite + wouter SPA at `artifacts/juniper/` with sub-routes `/app`, `/app/chat`, `/app/plans/:domain`, `/app/connections`
- **Tap-first plan onboarding** across all 5 domains — `dialogue-interface.tsx` renders a `StructuredFlow` for choice/money/timeline steps answered client-side with NO LLM call, a live plan-preview card (`right` column) that fills in as answers arrive, and an "N questions left" countdown (`remainingQuestions`); only `text` steps route to the LLM. Client script schema in `src/lib/dialogue-scripts.ts` (`StepInput = ChoiceInput | MoneyInput | TimelineInput | TextInput`, plus `profileSeed` to pre-fill money steps from the saved profile)
- **Single first-run onboarding flow** (`components/onboarding/first-run-onboarding.tsx`): name → financial snapshot → goals → grouped "accounts I use" connections; gated in `pages/app-shell.tsx` on `!isOnboarded(email) && !hasProfileData(profile)`, re-triggered after the testing reset
- **Completed-plan projection charts** (`lib/projection.tsx` + `components/plan/plan-projection.tsx`): custom SVG. Savings mode (Home Buying, Baby) solves the required monthly contribution with compound interest and exposes an editable "I can save $X/mo" that recomputes the timeline; debt mode (Debt Paydown) contrasts a 0% balance transfer vs a typical blended APR. Illustrative constants: 3.5% HYSA APY, 22% card APR
- **Affiliate click-out cards** (`components/plan/affiliate-card.tsx`, config in `lib/partners.ts` keyed by domain): real brand logos via Google favicon service (`s2/favicons`) with monogram fallback, FTC-style disclosure, GA4 `affiliate_click` event (prod-only) with a `subid` query param. Connection-aware — a partner the user already "uses" gets a "You use this" badge and is deprioritized. All partner URLs are PLACEHOLDERS (`example.com/partners/...`)
- **Debt-list builder** (`components/plan/debt-list.tsx`): list debts (name/balance/APR) persisted to `current_state.debts`; summed balance + blended APR feed the payoff projection. No migration
- **Actionable next actions** (`components/plan/next-action-link.tsx`): each links out (affiliate or free resource like Credit Karma for credit score) or shows a "How?" button that asks the plan chat to walk the step; per-action notes persisted. Fires GA4 `resource_click` / `affiliate_click`
- **Top "Back to dashboard" button** on the plan view (`pages/plan-detail.tsx`)
- Domain-tile dashboard with active-plan widgets (KPI bars + next action)
- Click-to-edit KPIs, milestones, and actions on plan view (800ms debounced save)
- In-plan chat scoped to a specific plan's context; general chat demoted to sidebar
- `DialogueInterface` component with `role: 'inviter' | 'partner'` modes; `PlanAlignment` side-by-side answer comparison; `/invite/:token` partner-acceptance landing
- Connections page with "Coming soon" placeholder cards (remote wiring still stubbed)
- Marketing site (hero, FAQ, footer, waitlist) on watercolor-house theme; waitlist form fires GA4 `sign_up`
- Tabbed `ProfileSettings` modal (Account | Financial snapshot); top-bar name button opens Account (name, email, Sign out). Includes a testing-only "Reset plans & preferences" control
- GA4 (gtag.js) loader in `src/lib/analytics.ts`, production-only, initialized in `App.tsx`; SPA route views via GA4 Enhanced Measurement
- Home-screen icons + `site.webmanifest` on brand cream `#FAF7F2`

**Backend / data**
- Vercel Edge Functions in `api/`: `chat.ts`, `dialogue.ts`, `plans.ts`, `plan-chat.ts`, `invites.ts`, `profile.ts`, `waitlist.ts`
- `api/_dialogue-scripts.ts` mirrors the frontend script indices; structured (tap-first) steps are stubbed server-side since they no longer need an LLM turn. Partner-mode aware (skips inviter-only steps)
- **`DELETE` on `api/plans.ts`** (deletes the user's owned plans) and **`api/profile.ts`** (deletes the user's profile row), both RLS owner-scoped — backing the "reset plans & preferences" control, which also clears local caches + the onboarded flag
- `api/waitlist.ts` — public unauthenticated endpoint, inserts `{ email, journey_stage, source }` via anon key; treats duplicate (409) as success
- Supabase JWT verification with ES256 (JWKS) and HS256 fallback in `api/_supabase-jwt.ts`
- Defensive env reading via `api/_env.ts` (strips CR/LF and non-printable chars)
- Tolerant JSON parser with brace-balancing fallback for synthesis output; em-dash strip backstop in `displayContent()`
- 6 SQL migrations: `0001_user_profiles_auth`, `0002_plans`, `0003_plan_chat`, `0004_partner_support`, `0005_invite_rpcs`, `0006_waitlist` (no new migration this session — debts live in existing `current_state` JSON, connections are localStorage-only)
- `plan_chat_history` JSONB; `plans` table with partner columns + RLS; `accept_invite` SECURITY DEFINER RPC
- `waitlist` table — insert-only via anon (RLS allows INSERT, no SELECT), unique index on `lower(email)`

**Infrastructure**
- Vercel deploy at `juniper-api-server.vercel.app` (build via `pnpm --filter @workspace/juniper run build`, output `artifacts/juniper/dist`)
- Supabase project `ggtditfackvvfeehyebz` (Postgres + Auth + JWKS)
- pnpm workspace monorepo with `artifacts/juniper`, `artifacts/api-server`, `artifacts/mockup-sandbox`, `scripts`, `lib`
- Growth admin pipeline (Google Apps Script, lives in `/Users/finley/Code/Juniper/*.gs`, outside this repo): `juniper-sheet-webhook.gs` receives Supabase Database Webhooks on `waitlist`/`user_profiles` INSERT and appends rows to the admin sheet; `juniper-growth-ga4-pull.gs` pulls trailing-30-day GA4 metrics into the Growth tab; `juniper-growth-dashboard.gs` rebuilds the pre-launch Growth dashboard

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite + wouter + Tailwind + Radix UI | `artifacts/juniper/` |
| Backend | Vercel Edge Functions (TypeScript) | `api/` |
| Database | Supabase Postgres + RLS | project `ggtditfackvvfeehyebz` |
| Auth | Supabase Auth (ES256 JWTs via JWKS) | `api/_supabase-jwt.ts` |
| AI/LLM | Anthropic Claude `claude-sonnet-4-6` | `@anthropic-ai/sdk` ^0.37.0; now mostly synthesis + rare text steps (tap-first structured steps make no LLM call) |
| Hosting | Vercel | `vercel.json` |
| Analytics | Google Analytics 4 (gtag.js) | `src/lib/analytics.ts`, ID `G-C6W0BFQ3ZG` |
| Growth ops | Google Apps Script + Sheets | `*.gs` files in parent dir; Supabase webhooks + GA4 Data API |
| Package manager | pnpm workspaces | monorepo |

---

## Integrations & MCPs

*No MCP configs found in repo.*

External services in use (from env vars and code):

| Integration | Purpose | Cost | Status |
|---|---|---|---|
| Supabase | Auth, Postgres, JWKS, Database Webhooks | free tier | live |
| Vercel | Hosting + Edge Functions | free tier | live |
| Anthropic Claude | LLM for synthesis + rare open/text steps | lower than before — structured steps make no LLM call; synthesis remains ~1 call per plan | live |
| Google favicon service (`s2/favicons`) | Partner brand logos on affiliate cards | free | live (Clearbit logo API was shut down; swapped) |
| Affiliate partners (SoFi, Marcus, Monarch, Policygenius, Ladder, HelloPrenup, Trust & Will, balance-transfer) | Monetized click-outs on completed plans | usage-based (rev-share, TBD) | placeholder — URLs are `example.com`, no programs approved yet |
| Free resources (Credit Karma, etc.) | Non-monetized next-action links | free | live |
| Google Analytics 4 | Landing/app analytics + `sign_up`, `affiliate_click`, `resource_click` events | free | live |
| Google Apps Script + Sheets | Growth dashboard: mirror waitlist/users, pull GA4 | free | live |
| Plaid / Monarch | Account connections (real wiring) | unknown | planned (Connections page stubbed; "accounts I use" is localStorage-only) |
| Resend / Supabase magic link | Email for partner invites | unknown | planned |

---

## Decisions log

- **2026-07-06 — Tap-first structured steps over per-turn LLM dialogue** — The onboarding dialogue made an Anthropic call every turn just to parse a numeric or choice answer. Structured `choice`/`money`/`timeline` steps are now answered client-side with no LLM call; only genuinely open/sensitive `text` steps (e.g. Prenup carveouts) and the single synthesis call still hit the LLM. Cuts per-plan spend and latency, and makes the flow deterministic and previewable. Backend script indices were kept in sync (`api/_dialogue-scripts.ts`) with structured steps stubbed.
- **2026-07-06 — Live plan-preview card during onboarding** — With structured answers landing client-side, the plan can build up visibly as questions are answered, plus an "N questions left" countdown. Reduces the "am I almost done / what am I getting" uncertainty of the old open chat.
- **2026-07-06 — Affiliate config in code, not a table** — Offers are few and change rarely, so `lib/partners.ts` (keyed by domain) avoids a migration + GRANT/RLS footgun. First entry per domain is the hero (the only one rendered). Migrate to a `partners` table only when offers need to change without a deploy.
- **2026-07-06 — All partner URLs are placeholders until programs are approved** — Ship the surface and plumbing (subid, disclosure, GA4 `affiliate_click`) now; swap `example.com` links for real referral URLs once affiliate programs are approved. Regulated categories (mortgage, insurance, credit cards, legal) may need specific disclosures/licensing first.
- **2026-07-06 — Google favicon service for brand logos** — Clearbit's logo API was shut down and no longer resolves. Google's `s2/favicons` is a live, free source; the colored monogram tile is the automatic fallback if an image fails. Demo-quality; swap for hosted/inlined assets at launch.
- **2026-07-06 — Illustrative projection rates, not live rates** — Projection charts use fixed constants (3.5% HYSA APY, 22% card APR) rather than pulling real partner rates. Deterministic, client-side, and touches nothing in the synthesis prompt or stored plan shape. Tie to real rates when offers are approved.
- **2026-07-06 — Debts in `current_state` JSON, no migration** — The debt-list builder persists to `current_state.debts` inside the existing plan JSON, so no schema change or GRANT was needed. Payoff projection sums balances and blends APR.
- **2026-07-06 — "Accounts I use" connections are localStorage-only** — Onboarding captures which tools the user already uses to tailor/deprioritize recommendations. Stored client-side for now (no remote column); a small migration with GRANT SELECT + owner RLS would add cross-device sync later.
- **2026-06-01 — GA4 loads production-only, custom events only** — `initAnalytics()` no-ops unless `import.meta.env.PROD`, so local dev never pollutes the property. Page views (incl. SPA route changes) come from GA4 Enhanced Measurement, so code only fires custom events like `sign_up`.
- **2026-06-01 — Growth dashboard in Google Sheets over a built admin UI** — Pre-launch, a Sheet fed by Supabase Database Webhooks + the GA4 Data API is enough and needs no product surface. Header-driven column mapping so reordering columns doesn't break ingestion.
- **2026-06-01 — Apps Script secret rides in the query string** — Apps Script web apps can't read request headers, so the webhook receiver authenticates via `?secret=` in the deployed URL.
- **2026-06-01 — Waitlist table is insert-only via anon** — RLS allows anon INSERT and nothing else (no SELECT); unique index on `lower(email)` dedupes, and the endpoint treats the resulting 409 as success so repeat sign-ups still see confirmation.
- **2026-05-30 — Conversational onboarding over a forced snapshot modal** — The guided dialogue already collects missing numbers one per turn, so the upfront financial-snapshot form was redundant friction. `handleStartPlan` now navigates straight into the plan.
- **2026-05-30 — Same dialogue for both partners (vs different)** — Alignment comparison only works if both partners answer the same questions. Partner role skips Step 1 (partner check) and Step 8 (synthesis), which are inviter-only.
- **2026-05-30 — Neutral framing in synthesis output** — Plan text is shared between both viewers, so the LLM uses "you both" / "your partner" rather than specific names.
- **2026-05-29 — SECURITY DEFINER RPCs for invite acceptance** — Partner at accept time matches neither `user_id` nor `partner_user_id`, so the standard RLS UPDATE policy rejects them. RPCs bypass RLS with controlled invariants.
- **2026-05-29 — Two parallel queries + client-side merge over PostgREST OR filter** — `or=(user_id.eq.X,partner_user_id.eq.X)` returned `[]` even with matching rows; replaced with two queries and merged in `/api/plans`.
- **2026-05-29 — Shareable invite link over email automation** — No email infra dependency for MVP. Copy/paste delivery for now. Email is Stage 6.
- **2026-05-29 — Wouter sub-routes over view-state** — URL shareability and refresh stability, easier nested route handling for plan detail pages.
- **2026-05-29 — Tag-based LLM constraint over tool use** — Each step's system prompt asks Claude to emit `<STEP_COMPLETE>{json}</STEP_COMPLETE>` when ready. Client parses and advances. Keeps dialogue scriptable without tool-use complexity.
- **2026-05-29 — Background save for synthesis** — `PlanView` transitions from local-parsed JSON immediately; server save is fire-and-forget so UI doesn't depend on network roundtrip.
- **2026-05-29 — Supabase Auth over Clerk** — Existing stack constraint (no new infrastructure), free tier sufficient, partner invites buildable without vendor dep.

---

## Open loops

- [ ] Replace placeholder partner URLs with approved affiliate links + add category-specific disclosures/licensing for regulated offers (mortgage, insurance, credit cards, legal) before any monetized surface goes live — Finley
- [ ] Tie projection rates (3.5% HYSA / 22% APR) to real partner rates once offers are approved — Finley
- [ ] Migrate "accounts I use" connections to a remote column (GRANT SELECT + owner RLS) for cross-device sync — Finley
- [ ] Debt-list CSV upload + per-debt avalanche/snowball amortization (deferred refinements) — Finley
- [ ] Automated email for partner invites (Resend or Supabase magic link) — Finley
- [ ] Real Plaid / Monarch wiring on Connections page (currently "Coming soon" placeholders) — Finley
- [ ] Multi-language and accessibility audit pass — Finley
- [ ] Partner display-name handling — partner sees inviter as "your partner" generically because `user_profiles.name` isn't fetched for partner-side dialogue — Finley
- [ ] Token expiration / revocation UI for invites — Finley
- [ ] Configure spending limits on Anthropic API — Finley
- [x] Better account button UX — now opens Account tab (name, email, Sign out) instead of the snapshot modal (done 2026-05-30)

---

## Risks & known issues

- **Partner URLs, logos, and rates are demo placeholders** — every affiliate `url` is `example.com`, logos come from a favicon service, and projection rates are fixed constants. Regulated categories (mortgage, insurance, credit cards, legal) likely need specific disclosures/licensing. Do not launch monetized surfaces on these; they are plumbing/UX only.
- **Anthropic cost is uncapped** — no spending limit configured. Per-plan spend dropped this session (structured steps no longer call the LLM; synthesis is ~1 call per plan), but a runaway prompt loop or abuse could still spike.
- **"Accounts I use" is localStorage-only** — connections don't sync across devices and are lost if local storage is cleared; no remote source of truth yet.
- **Connections page is non-functional** — placeholders only; user expectation could outrun the build.
- **Apps Script webhook secret is committed** — the growth pipeline's shared secret (`jnpr_whk_...`) is hard-coded in `juniper-sheet-webhook.gs`. Those files sit outside the git repo, but the secret is plaintext; rotate before any wider sharing.
- **Growth pipeline is out-of-repo** — the `.gs` files live in the parent directory and aren't version-controlled with the app, so their state can drift silently.
- **Partner display name is generic** — minor UX paper cut on partner-side dialogue and plan view.
- **Em-dash leakage** — Claude keeps emitting `—` despite strict prompts; mitigated by client-side strip in `displayContent()`, but any new surface that bypasses that helper will leak.
- **GRANT footgun for new tables** — SQL-migration-created tables don't auto-grant Data API access. New tables silently return 401 without `GRANT ... TO authenticated`. Pattern is baked into migrations 0002+ but is easy to forget on future tables.
- **Env-var newline footgun** — Past `Invalid header value` outages came from copy-pasted env vars with embedded `\n`. `api/_env.ts` sanitizes on read; any new server-side env reader should use it.

---

## Notable debug lessons

Subtle enough to repeat, so worth keeping a section:

- **Env vars with embedded newlines** — `SUPABASE_ANON_KEY` had a `\n` at position 208 from a copy-paste. Node fetch headers reject CR/LF. `api/_env.ts` strips non-printable chars from all server-side env reads.
- **ES256 vs HS256** — Newer Supabase projects use asymmetric JWT signing keys (ES256). Legacy "JWT Secret" doesn't sign user tokens anymore. `api/_supabase-jwt.ts` checks `header.alg` and routes to JWKS (ES256) or HMAC (HS256) accordingly.
- **GRANT for raw-SQL tables** — Tables created via SQL migration don't auto-grant Data API access. Every new table needs `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;` or every request returns silent 401.
- **Unescaped backticks in template literals** — `BASE` prompt had backticked angle brackets inside a backtick-delimited string. JS parser closed the template early and tried to interpret the rest as tagged template expressions ("X is not a function" at module load). Don't use backticks in prose inside backtick-delimited strings.
- **PostgREST OR filter quirks** — `or=(user_id.eq.X,partner_user_id.eq.X)` returned `[]` even when matching rows existed. Switched to two parallel queries + client-side merge.
- **Double-read of fetch response body** — `/api/plans` GET error path was reading `.text()` after `.json()`; fixed by buffering once and reusing.

---

## Links

- **Live URL:** https://juniper-api-server.vercel.app
- **GitHub:** https://github.com/Kuba-Ventures/Juniper (branch `main`)
- **Supabase project ID:** `ggtditfackvvfeehyebz`
- **Staging:** (none — Vercel preview deploys per PR)
- **Client Drive folder:** (none yet)
- **Slack channel:** (none yet)

---

## Env vars (Vercel + frontend)

- `SUPABASE_URL` (backend) and `VITE_SUPABASE_URL` (frontend) — bare project URL, no `/rest/v1/` suffix
- `SUPABASE_ANON_KEY` (backend) and `VITE_SUPABASE_ANON_KEY` (frontend) — anon public JWT
- `SUPABASE_JWT_SECRET` (backend) — legacy secret, kept as fallback for HS256-mode projects
- `ANTHROPIC_API_KEY` (backend)
- `VITE_SIGNUP_INVITE_CODE` (frontend, optional) — gates open signups during private preview

GA4 measurement ID (`G-C6W0BFQ3ZG`) and the Apps Script webhook secret are hard-coded in `src/lib/analytics.ts` and the `.gs` files respectively, not env vars.

---

## Changelog

- **2026-07-06:** kuba-vault refresh — caught PROJECT.md up on 23 PRs (`main` at merge of PR #23). Through-line: onboarding reworked from per-turn LLM chat to a guided tap-first flow (structured choice/money/timeline steps answered client-side, live plan-preview card, "N questions left", instant plan; only text steps + synthesis hit the LLM). Completed plans gained interest-aware projection charts (`lib/projection.tsx`), affiliate click-out cards (`lib/partners.ts` — placeholder URLs, favicon logos, GA4 `affiliate_click`), a debt-list builder (`current_state.debts`, no migration), and actionable next actions with links / "How?" walkthrough. Added a single first-run onboarding flow, profile-seeded money steps, a "reset plans & preferences" testing control (new DELETE endpoints on `plans`/`profile`), and a top "Back to dashboard" button. Verified all claims against code. Added 8 decisions, 4 open loops, 3 risks; refreshed status/what's-built/integrations/tech-stack. Flag: shipping.
- **2026-07-05 (Jun 30–Jul 5, per commits):** 23-PR session — tap-first onboarding, plan projection charts, affiliate cards + favicon logo fix (Clearbit dead), debt-list builder, actionable next actions with connection-aware recs, first-run onboarding, profile pre-fill, money-chip rounding fix, Baby Planning input fixes.
- **2026-07-05:** kuba-vault refresh — caught PROJECT.md up on 5 commits from May 30–Jun 1: GA4 analytics, waitlist capture (`/api/waitlist` + `0006_waitlist`), Google Sheets growth pipeline, tabbed ProfileSettings + fixed account UX, conversational onboarding, app icons/manifest, sidebar rename. Added 5 decisions, resolved the account-UX open loop, updated integrations + tech stack. No code changes; repo quiet since Jun 1.
- **2026-06-01:** Added GA4 (gtag.js) to landing/app — production-only loader, `sign_up` event on waitlist submit.
- **2026-06-01:** Renamed sidebar nav "Saved from chat" → "Saved plans".
- **2026-06-01:** Wired waitlist capture — `/api/waitlist` edge function + `waitlist` table (`0006`); Supabase webhook mirrors rows to the admin sheet.
- **2026-05-30:** Profile settings tab (Account | Financial snapshot) + fixed account button; removed forced snapshot modal for conversational onboarding; added tree home-screen icons + webmanifest.
- **2026-05-30:** Initial PROJECT.md superdoc created by kuba-vault. Captures full Stage 1–5 build (auth, plan data model, interactive plan view, partner invites, all five domains live), architecture decisions, debug lessons, and post-MVP open loops.
- **2026-05-30:** Stage 5 parts 3+4 shipped — Baby Planning (7 steps) + Prenup (7 steps) dialogues.
- **2026-05-30:** Stage 5 part 2 shipped — Debt Paydown dialogue (5 steps).
- **2026-05-30:** Stage 5 part 1 shipped — Combining Finances dialogue + domain-keyed alignment.
- **2026-05-29:** Stage 4 shipped — partner invites + alignment view, SECURITY DEFINER RPC for accept, neutral synthesis framing, partner-mode aware script/progress.
- **2026-05-29:** Stage 3 shipped — editable plan view, in-plan chat, active tile widgets, em-dash strip backstop, synthesis-save fixes.
- **2026-05-29:** Stage 2 shipped — `plans` table + Home Buying guided dialogue, BASE-prompt backtick fix, env sanitization hardening.
- **2026-05-29:** Stage 1 shipped — domain dashboard + Supabase Auth + wouter sub-routes, ES256 JWT support via JWKS.
