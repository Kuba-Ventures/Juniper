# Juniper — Design system

*Source of truth for the repositioned product (financial planning for young individuals & families). The interactive reference is `design/juniper-app-mock.html` at the repo root; this doc is the production translation.*

## Identity — "cool off-white + pine"

| Token | Light | Dark | Use |
|---|---|---|---|
| `--jnpr-ground` | `#F4F7F3` | `#0F140F` | app background (cool off-white) |
| `--jnpr-surface` | `#FFFFFF` | `#171E17` | cards |
| `--jnpr-surface-2` | `#FAFBF9` | `#1D251D` | insets / secondary fills |
| `--jnpr-surface-3` | `#EAF0E9` | `#242D24` | pills, tracks, tiles |
| `--jnpr-ink` | `#232B21` | `#E8EFE6` | body text |
| `--jnpr-ink-2` | `#556052` | `#A6B0A2` | secondary text |
| `--jnpr-ink-3` | `#889081` | `#717B6E` | muted / captions |
| `--jnpr-line` | `#E3E9E1` | `#2A332A` | borders |
| `--jnpr-accent` | `#1C4A31` | `#6FB98C` | pine — links, active, buttons, chart lines, icons |
| `--jnpr-accent-deep` | `#123320` | `#8ACFA4` | pressed / on-accent text |
| `--jnpr-accent-soft` | `#E1EBE3` | `#213024` | accent tint backgrounds |
| `--jnpr-head` | `#173D28` | `#BFE0C8` | headings & UI icon color |
| `--jnpr-pine` | `#234E37` | `#1F3B2B` | **page header bands** (light text over) |

**Semantic:** good `#2F8558`, warn `#A9781E`, bad `#B4523B` (light). Reserved for status only — never as a series color.

**Series (categorical, validated ΔE + contrast):** `--jnpr-c1..c7` = `#2F8558 #A8781E #3E6FB0 #B0563F #9455A8 #5E7D2E #9AA090` (light) / `#3E9E6B #B5822F #5A88C8 #C86B52 #AE6EC0 #6E9138 #8B927E` (dark). Assigned in fixed order, never cycled; a 7th "everything else" uses c7 (neutral).

## Type

System sans stack (`-apple-system, "Segoe UI", Roboto, …`). Weight + size carry hierarchy; numbers use `tabular-nums`. Headings are dark green (`--jnpr-head`); on pine header bands they go light (`#FBFDFB`).

## Layout rules

- **Page header band:** every page opens with a pine (`--jnpr-pine`) band holding the title, intro, and its controls in light text (`.jnpr .page-head`, `.jnpr .greet`). This is the brand's signature and reduces white.
- **Cards:** white on off-white, 1px `--jnpr-line`, radius 16, soft shadow.
- **Nav:** top bar — Home · Spending · Plans · Credit · Recommended. Active item is an accent-soft pill in pine.
- **Recommendations:** only inside a relevant plan and on the Score/Recommended surfaces — never floating on the dashboard.

## Scoping

All app styles live under a `.jnpr` root wrapper in `src/styles/juniper.css` so they never collide with shadcn/ui globals. shadcn HSL theme tokens (`--primary`, `--background`, …) are also aligned to this palette in `index.css` for any shared primitives (Dialog, Input, Button).

## Data (mock)

`src/lib/mock-data.ts` holds the demo household (Maya & Devin) until Stage 3 wires real Plaid transactions + the categorization/budget engine. Keep components reading from typed selectors so the swap to live data is a data-layer change, not a UI change.
