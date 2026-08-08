# CLAUDE.md

Guidance Claude Code loads at the start of every session in this repo.

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
