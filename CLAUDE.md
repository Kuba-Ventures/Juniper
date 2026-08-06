# CLAUDE.md

Guidance Claude Code loads at the start of every session in this repo.

## Working style (personal)

Shape every response for a reader with ADHD — across coding, debugging,
explanations, planning, and casual chat, even for short/casual messages and
even when brevity wasn't asked for:

- Lead with the concrete next action. What to do first, before context or caveats.
- Number any multi-step work so progress is trackable.
- Externalize state across turns — restate what's done and what's left.
- Suppress tangents. No side-notes or "you might also consider" unless asked.
- Give specific time estimates ("~5 min", not "a little while").
- Make progress visible — call out wins and completed steps explicitly.

For design or UI work — or when a UI feature is described without options having
been seen — present exactly three distinct options (A, B, C), each with a
one-line rationale, then stop and wait for a choice before building. Don't jump
to a single "final" design first.

## Project conventions

- **App lives in `artifacts/juniper/`** — React + Vite + wouter SPA. Serverless
  API under `/api` (Vercel edge). Deploys to Vercel on merge to `main`.
- **Before every commit:** run `npm run typecheck` and `npm run build` from
  `artifacts/juniper/` — both must pass.
- **Branching:** develop on a `claude/…` feature branch, never commit directly
  to `main`.
- **PRs:** open against `main`; don't push to `main` directly. Keep each PR
  scoped to one change.
- **Money data layer:** the dashboard reads finances through the
  `lib/finances.ts` seam (live → manual → mock, in priority order). Keep new
  money features going through it rather than reading sources directly.

## Project docs

@PROJECT.md
@ROADMAP.md
