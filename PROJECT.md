# Juniper
*AI copilot for couples navigating major financial life transitions.*

*Last updated: 2026-05-30 by kuba-vault*

---

## TL;DR

Juniper helps engaged and newly married couples model the financial tradeoffs behind big decisions (buying a home, combining finances, paying down debt, planning for a baby, prenups) and structures the conversation between partners before commitments are made. The five-stage restructure brief (auth, plan data model, interactive plan view, partner invites, remaining domains) shipped end-to-end across May 29 and May 30, 2026. All five planning domains are live in production at `juniper-api-server.vercel.app` with Supabase Auth, partner invite flow, and side-by-side plan alignment. Next focus is post-MVP polish: real email for invites, account UX, and Plaid/Monarch wiring on the Connections page.

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
- **Next milestone:** Stage 6 polish (email invites, account UX, Connections wiring) — TBD
- **Flags:** shipping

---

## Where we are right now

The full original five-stage brief landed across May 29 and May 30. As of today, all five planning domains (Home Buying, Combining Finances, Debt Paydown, Baby Planning, Prenup & Legal) run end-to-end with guided dialogues, interactive plan views, in-plan chat, and partner invite + alignment. Production is live on Vercel against a Supabase Postgres backend with ES256 JWT auth. The dialogue engine uses tag-based step gating (`<STEP_COMPLETE>`/`<PLAN_COMPLETE>`) to keep Claude on-script without tool-use complexity. No active blockers. The open loops are all polish — email automation for partner invites, the Connections page being stubbed, and the account button still opening the financial-snapshot modal instead of showing email + Sign Out.

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
- Marketing site (hero, FAQ, footer, waitlist) on watercolor-house theme

**Backend / data**
- Vercel Edge Functions in `api/`: `chat.ts`, `dialogue.ts`, `plans.ts`, `plan-chat.ts`, `invites.ts`, `profile.ts`
- Supabase JWT verification with ES256 (JWKS) and HS256 fallback in `api/_supabase-jwt.ts`
- Defensive env reading via `api/_env.ts` (strips CR/LF and non-printable chars)
- Dialogue scripts per-domain in `api/_dialogue-scripts.ts`; partner-mode aware (skips inviter-only steps)
- Tolerant JSON parser with brace-balancing fallback for synthesis output
- Em-dash strip backstop in `displayContent()`
- 5 SQL migrations: `0001_user_profiles_auth`, `0002_plans`, `0003_plan_chat`, `0004_partner_support`, `0005_invite_rpcs`
- `plan_chat_history` JSONB; `plans` table with partner columns + RLS; `accept_invite` SECURITY DEFINER RPC

**Infrastructure**
- Vercel deploy at `juniper-api-server.vercel.app` (build via `pnpm --filter @workspace/juniper run build`, output `artifacts/juniper/dist`)
- Supabase project `ggtditfackvvfeehyebz` (Postgres + Auth + JWKS)
- pnpm workspace monorepo with `artifacts/juniper`, `artifacts/api-server`, `artifacts/mockup-sandbox`, `scripts`, `lib`

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
| Package manager | pnpm workspaces | monorepo |

---

## Integrations & MCPs

*No MCP configs found in repo.*

External services in use (from env vars and code):

| Integration | Purpose | Cost | Status |
|---|---|---|---|
| Supabase | Auth, Postgres, JWKS | free tier | live |
| Vercel | Hosting + Edge Functions | free tier | live |
| Anthropic Claude | LLM for dialogue + synthesis | ~$0.10–0.20 per full plan generation | live |
| Plaid / Monarch | Account connections | unknown | planned (Connections page stubbed) |
| Resend / Supabase magic link | Email for partner invites | unknown | planned |

---

## Decisions log

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
- [ ] Better account button UX — currently opens financial-snapshot modal; should show email + Sign Out — Finley
- [ ] Real Plaid / Monarch wiring on Connections page (currently "Coming soon" placeholders) — Finley
- [ ] Multi-language and accessibility audit pass — Finley
- [ ] Partner display-name handling — partner sees inviter as "your partner" generically because `user_profiles.name` isn't fetched for partner-side dialogue — Finley
- [ ] Token expiration / revocation UI for invites — Finley
- [ ] Configure spending limits on Anthropic API — Finley

---

## Risks & known issues

- **Anthropic cost is uncapped** — no spending limit configured. Estimated ~$0.10–0.20 per full plan, but a runaway prompt loop or abuse could spike.
- **Connections page is non-functional** — placeholders only; user expectation could outrun the build.
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

---

## Changelog

- **2026-05-30:** Initial PROJECT.md superdoc created by kuba-vault. Captures full Stage 1–5 build (auth, plan data model, interactive plan view, partner invites, all five domains live), architecture decisions, debug lessons, and post-MVP open loops.
- **2026-05-30:** Stage 5 parts 3+4 shipped — Baby Planning (7 steps) + Prenup (7 steps) dialogues.
- **2026-05-30:** Stage 5 part 2 shipped — Debt Paydown dialogue (5 steps).
- **2026-05-30:** Stage 5 part 1 shipped — Combining Finances dialogue + domain-keyed alignment.
- **2026-05-29:** Stage 4 shipped — partner invites + alignment view, SECURITY DEFINER RPC for accept, neutral synthesis framing, partner-mode aware script/progress.
- **2026-05-29:** Stage 3 shipped — editable plan view, in-plan chat, active tile widgets, em-dash strip backstop, synthesis-save fixes.
- **2026-05-29:** Stage 2 shipped — `plans` table + Home Buying guided dialogue, BASE-prompt backtick fix, env sanitization hardening.
- **2026-05-29:** Stage 1 shipped — domain dashboard + Supabase Auth + wouter sub-routes, ES256 JWT support via JWKS.
