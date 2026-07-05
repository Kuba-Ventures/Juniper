# Juniper
*AI copilot for couples navigating major financial life transitions.*

*Last updated: 2026-07-05 by kuba-vault*

---

## TL;DR

Juniper helps engaged and newly married couples model the financial tradeoffs behind big decisions (buying a home, combining finances, paying down debt, planning for a baby, prenups) and structures the conversation between partners before commitments are made. All five planning domains run end-to-end in production at `juniper-api-server.vercel.app` with Supabase Auth, partner invites, and side-by-side plan alignment. Since the MVP, the account UX was fixed (Account/Financial-snapshot tabs, email + Sign Out), the forced snapshot modal was removed in favor of conversational onboarding, and a full pre-launch growth stack shipped: waitlist capture, GA4 analytics, and a Google Sheets growth dashboard fed by Supabase webhooks + the GA4 Data API. The build is quiet since June 1; next focus is still real email for invites and Plaid/Monarch wiring on the Connections page.

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
- **Next milestone:** Email invites + Plaid/Monarch Connections wiring — TBD
- **Flags:** on-track (last commit 2026-06-01, no activity since)

---

## Where we are right now

All five planning domains (Home Buying, Combining Finances, Debt Paydown, Baby Planning, Prenup & Legal) run end-to-end in production with guided dialogues, interactive plan views, in-plan chat, and partner invite + alignment. Since the MVP landed, the June 1 work was pre-launch growth infrastructure and UX cleanup: the forced financial-snapshot modal is gone (the dialogue collects missing numbers conversationally), the top-bar account button now opens a proper Account tab (name, email, Sign out), waitlist sign-ups now actually persist (`/api/waitlist` + a `waitlist` table), and GA4 is wired on the landing page firing a `sign_up` event on waitlist submit. A Google Sheets admin dashboard mirrors waitlist/user rows via Supabase Database Webhooks and pulls trailing-30-day GA4 metrics via the Data API. No active blockers. The repo has been quiet since 2026-06-01. Remaining open loops are email automation for partner invites and the still-stubbed Connections page.

---

## What's built

**Frontend / UI**
- React + Vite + wouter SPA at `artifacts/juniper/` with sub-routes `/app`, `/app/chat`, `/app/plans/:domain`, `/app/connections`
- Domain-tile dashboard with active-plan widgets (KPI bars + next action)
- Onboarding gate + profile questionnaire
- Click-to-edit KPIs, milestones, and actions on plan view (800ms debounced save)
- In-plan chat scoped to a specific plan's context
- General chat demoted to sidebar
- `DialogueInterface` component with `role: 'inviter' | 'partner'` modes
- `PlanAlignment` side-by-side answer comparison view
- `/invite/:token` landing page for partner acceptance
- Connections page with "Coming soon" placeholder cards
- Marketing site (hero, FAQ, footer, waitlist) on watercolor-house theme; waitlist form fires GA4 `sign_up` on success
- Tabbed `ProfileSettings` modal (Account | Financial snapshot) replacing the old `ProfileQuestionnaire`; top-bar name button opens Account (name, email, Sign out)
- Onboarding is conversational — no forced snapshot modal on "new plan"; the dialogue collects missing numbers one turn at a time
- GA4 (gtag.js) loader in `src/lib/analytics.ts`, production-only, initialized in `App.tsx`; SPA route views via GA4 Enhanced Measurement
- Home-screen icons + `site.webmanifest` (apple-touch-icon 180, icon-192/512, favicon-32) on brand cream `#FAF7F2`

**Backend / data**
- Vercel Edge Functions in `api/`: `chat.ts`, `dialogue.ts`, `plans.ts`, `plan-chat.ts`, `invites.ts`, `profile.ts`, `waitlist.ts`
- `api/waitlist.ts` — public unauthenticated endpoint, inserts `{ email, journey_stage, source }` via anon key; treats duplicate (409) as success
- Supabase JWT verification with ES256 (JWKS) and HS256 fallback in `api/_supabase-jwt.ts`
- Defensive env reading via `api/_env.ts` (strips CR/LF and non-printable chars)
- Dialogue scripts per-domain in `api/_dialogue-scripts.ts`; partner-mode aware (skips inviter-only steps)
- Tolerant JSON parser with brace-balancing fallback for synthesis output
- Em-dash strip backstop in `displayContent()`
- 6 SQL migrations: `0001_user_profiles_auth`, `0002_plans`, `0003_plan_chat`, `0004_partner_support`, `0005_invite_rpcs`, `0006_waitlist`
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
| AI/LLM | Anthropic Claude `claude-sonnet-4-6` | `@anthropic-ai/sdk` 0.37.0 |
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
| Anthropic Claude | LLM for dialogue + synthesis | ~$0.10–0.20 per full plan generation | live |
| Google Analytics 4 | Landing/app analytics + `sign_up` conversion | free | live |
| Google Apps Script + Sheets | Growth dashboard: mirror waitlist/users, pull GA4 | free | live |
| Plaid / Monarch | Account connections | unknown | planned (Connections page stubbed) |
| Resend / Supabase magic link | Email for partner invites | unknown | planned |

---

## Decisions log

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

- [ ] Automated email for partner invites (Resend or Supabase magic link) — Finley
- [ ] Real Plaid / Monarch wiring on Connections page (currently "Coming soon" placeholders) — Finley
- [ ] Multi-language and accessibility audit pass — Finley
- [ ] Partner display-name handling — partner sees inviter as "your partner" generically because `user_profiles.name` isn't fetched for partner-side dialogue — Finley
- [ ] Token expiration / revocation UI for invites — Finley
- [ ] Configure spending limits on Anthropic API — Finley
- [x] Better account button UX — now opens Account tab (name, email, Sign out) instead of the snapshot modal (done 2026-05-30)

---

## Risks & known issues

- **Anthropic cost is uncapped** — no spending limit configured. Estimated ~$0.10–0.20 per full plan, but a runaway prompt loop or abuse could spike.
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
