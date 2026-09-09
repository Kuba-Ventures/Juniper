# Content mirrors

`terms-of-service.md` and `privacy-policy.md` are copies of `docs/TERMS_OF_SERVICE.md` and
`docs/PRIVACY_POLICY.md` at the repo root, imported here via Vite's `?raw` suffix and rendered at
`/terms` and `/privacy` (`src/pages/terms.tsx`, `src/pages/privacy.tsx`).

They're copies, not the same file, because the app's Vite root is `artifacts/juniper/` (see
`vite.config.ts`) and importing across that boundary is avoided rather than relied on. **When the
`docs/` originals change (a lawyer's edit, a filled-in `[NEEDS LAWYER INPUT]` placeholder, the
contact address), re-copy them here too** or these pages silently go stale. There is no build step
enforcing this yet.
