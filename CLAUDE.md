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


<!-- BEGIN STANDARD -->
## Response style
- Lead with the concrete next action, before context or caveats.
- Number multi-step work.
- Restate what's done and what's left each turn.
- No tangents or "you might also consider."
- Time estimates as specifics ("~5 min").
- Call out completed steps explicitly.

## Design and UI work
Any product or feature change with a visual surface: present exactly three
options (A, B, C), one-line rationale each. Render them — never describe
them in prose. Build each as a working preview and open all three side by
side in a browser. `/design-shotgun` does this end to end.
Stop and wait for a choice before building anything further.

## Git workflow
- Never commit to `main`. Branch as `claude/<description>`.
- One PR per logical change — don't mix chores into feature branches.
- Delete the branch after merge.
<!-- END STANDARD -->
