# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Juniper App

Juniper is a frontend-only decision-support calculator for couples evaluating home affordability with student debt. Built with React + Vite + Tailwind CSS + shadcn/ui.

- **Artifact**: `artifacts/juniper` (preview at `/`)
- **No backend API needed** — all calculations are client-side
- **No database needed** — stateless calculator
- **Key features**: mortgage calculator, DTI analysis, buy-now vs wait scenario comparison, couple contribution split, downloadable summary
- **Design**: Calm, trustworthy fintech aesthetic with juniper green palette

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
