# Plaid account linking — setup

This wires up real bank / investment account connections via Plaid (link + show
accounts). It ships **inert**: with no credentials configured, the endpoints
return `503`/empty and the Connections page shows a friendly "not enabled yet"
state. Nothing goes live until you complete the steps below.

## 1. Create a Plaid account (free, Sandbox)

1. Sign up at <https://dashboard.plaid.com/signup>.
2. In the dashboard: **Team Settings → Keys**. Copy your **`client_id`** and the
   **Sandbox `secret`**.
3. Sandbox uses fake banks — no real data, no approval needed. (Production
   requires Plaid's application review + a contract; do that later.)

## 2. Get the Supabase service-role key

Access tokens are stored in a server-only table (`plaid_items`) that the browser
cannot read. The Edge functions reach it with the service-role key.

- Supabase dashboard → **Project Settings → API → `service_role` secret**. Copy it.
- ⚠️ This key bypasses RLS. It lives **only** in server env vars — never ship it
  to the client or commit it.

## 3. Set environment variables

Add these in **Vercel → Project → Settings → Environment Variables** (Production
+ Preview), and to your local `.env` for local runs:

| Variable | Value | Notes |
|---|---|---|
| `PLAID_CLIENT_ID` | from step 1 | |
| `PLAID_SECRET` | Sandbox secret from step 1 | swap for Production secret when live |
| `PLAID_ENV` | `sandbox` | `development` / `production` later |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 | server-only |
| `PLAID_PRODUCTS` | `auth` | optional; e.g. `auth,transactions,liabilities` to pull more |
| `PLAID_COUNTRY_CODES` | `US` | optional |
| `PLAID_REDIRECT_URI` | — | optional; only needed for OAuth banks (must be registered in the Plaid dashboard) |

`SUPABASE_URL` and `SUPABASE_JWT_SECRET` are already configured (used by the
existing endpoints).

## 4. Apply the database migration

Run `supabase/migrations/0007_plaid_items.sql` against the Supabase project
(SQL editor, or `supabase db push`). It creates the server-only `plaid_items`
table with RLS locked so only the service role can read it. It's idempotent.

## 5. Deploy and test (Sandbox)

1. Redeploy so the new env vars take effect.
2. Sign in, go to **Connections**, click **Connect an account**.
3. In the Plaid Link dialog pick any sandbox bank and use the test login:
   - username **`user_good`**, password **`pass_good`**
4. You should see the institution and its accounts (with balances) listed, and
   a `connection_linked` engagement event in GA4 DebugView.

## Going to Production later

1. Apply for Production access in the Plaid dashboard (business/compliance review).
2. Set `PLAID_ENV=production` and `PLAID_SECRET=<production secret>`.
3. OAuth banks (Chase, BofA, Wells, Capital One, most large US banks): see below.
   Without this, only non-OAuth / smaller banks will link in Production.

### OAuth banks (redirect URI)

Large US banks won't show a password box inside Plaid Link; Plaid redirects the
whole tab to the bank, and the bank returns the user to a **pre-registered**
redirect URI. Juniper handles that return on the Connections page
(`src/lib/use-link-queue.ts`): it stashes the in-flight token + queue in
`localStorage`, and on return (URL carries `?oauth_state_id=...`) re-opens Link
with `receivedRedirectUri` to finish, then continues the queue.

To turn it on:

1. **Plaid dashboard → Developers → API → Allowed redirect URIs → Configure.**
   Add the return URL(s), exact match, one per environment/domain you serve:
   - `https://juniper-api-server.vercel.app/app/connections`
   - `https://<your-custom-domain>/app/connections` (add when you launch on it)
2. **Set `PLAID_REDIRECT_URI`** in Vercel to the URL whose origin matches the
   domain your users actually browse on (the return lands on that origin, and
   the Supabase session is per-origin, so a mismatch would drop their session).
   The backend attaches it to the link token automatically
   ([link-token.ts:41](api/plaid/link-token.ts)); leaving it unset disables the
   redirect flow (non-OAuth banks still work).
3. Redeploy. OAuth banks now link on the live site.

**Caveats.**
- **Preview deploys can't do OAuth:** their URLs change per deploy and Plaid
  needs exact-registered URLs, so test OAuth on production (or a stable domain).
- **First-run onboarding:** an OAuth bank picked during onboarding finishes on
  the Connections page (the redirect wipes the wizard's in-memory state). All
  selected banks still link; making onboarding OAuth seamless is a follow-up.
- **Plaid Layer (tier 1)** has its own redirect handling; wire it when Layer is
  actually enabled (Production + `PLAID_LAYER_TEMPLATE_ID`).

## What this does / doesn't do

- **Does:** Plaid Link flow, exchanges the public token for a server-only access
  token, stores the item, lists linked institutions + accounts + balances, lets
  you disconnect. Linked institution names feed the marketplace "You use this"
  badges.
- **Doesn't (yet):** auto-fill plan inputs (savings/debt) from balances, pull
  transactions/liabilities/investments, or refresh balances live. Those are the
  next scope tiers — the `PLAID_PRODUCTS` env var and the stored snapshot are
  already shaped to grow into them.
