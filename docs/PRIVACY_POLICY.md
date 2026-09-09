## 1. What this covers

This policy describes what Juniper collects, why, who it's shared with, and what rights you have
over it. It applies to the Juniper web app at www.juniperplan.com.

## 2. Data we collect

**Account and profile data**, from you directly: name, email, household/partner status, financial
goals you set at signup.

**Linked financial data**, from Plaid, once you connect an account: account and routing
identifiers (never seen by Juniper, held only by Plaid), balances, transactions, investment
holdings and flows, and, where you've granted the `liabilities` product, loan/card APRs and
payment terms. This is real transaction-level data from real banks. Juniper's server-only
`plaid_items` table stores your Plaid access token (never sent to your browser) and a sanitized
account snapshot.

**Credit-bureau data**, only if you separately opt in: your phone number and date of birth are
sent to Spinwheel, our credit-data provider, solely to verify your identity via a one-time SMS
passcode and connect your credit file. Once verified, we store only your Spinwheel identifier, the
last 4 digits of your phone number, and the consent timestamp. **We never store your date of
birth and never a copy of your credit report** (see `supabase/migrations/0065_credit_consents.sql`'s own
design comment). The score itself is fetched live on each view and only its most recent value is
cached for score-change alerts (`credit_consents.last_score`).

**Manually entered data**: any account, balance, or credit limit you type in by hand for
institutions Plaid can't reach.

**Ask Juniper conversations**: your messages, and the account data used to ground a response
(current balances, spending, plan figures), are sent to Anthropic's Claude API to generate a
response. See Section 4.

**Shared-workspace data**, only if you invite a partner: whichever of your accounts, balances, and
goals you explicitly mark as shared (private by default, see migration `0020`), plus messages
you send inside the shared space.

**Usage analytics**: anonymized/aggregated product-usage events via Google Analytics 4
(production only), never including account balances or transaction content.

We do **not** collect your bank login credentials. Plaid handles authentication with your
institution directly and never shares it with Juniper.

## 3. How we use it

- To show you your own net worth, spending, budgets, Juniper Score, and plans.
- To generate Ask Juniper's responses to your questions.
- To detect recurring charges, alert you to a budget going over, a connection needing
  reconnecting, or (once out of sandbox) a real credit-score change.
- To improve the product. **[NEEDS LAWYER INPUT: whether/how aggregated or de-identified usage
  data may be used for product analytics, and whether any data is used to train or fine-tune any
  model. Confirm the actual terms of the Anthropic API agreement Juniper is on, since the
  Anthropic Commercial/API terms differ from consumer Claude.app terms on training-data use, and
  this section must reflect whichever agreement is actually in force.]**

We do not sell your data.

## 4. Who we share it with

| Recipient | What they get | Why |
|---|---|---|
| **Plaid** | Nothing from us: Plaid is the source, not a recipient, of your linked account data | Bank connectivity |
| **Spinwheel** | Phone number, date of birth (only during identity verification, not retained by Juniper after) | Credit-bureau score pull, only if you opt in |
| **Anthropic** | Your Ask Juniper messages and the account figures grounding them | Generates Ask Juniper's responses |
| **Supabase** | All of the above, as our database and auth provider | Hosting/storage infrastructure |
| **Vercel** | Nothing beyond what transits our own servers | Hosting infrastructure |
| **Google Analytics** | Anonymized usage events only | Product analytics |
| **A partner you invite** | Only what you explicitly mark shared | The shared-workspace feature you opt into |

**[NEEDS LAWYER INPUT: confirm each vendor's own data-processing agreement / sub-processor terms
are actually in place before this table is published as a factual representation, and add each
vendor's own privacy-policy link.]**

We do not share your data with advertisers. Marketplace/affiliate partners named elsewhere in the
product (Stage 5) receive a click event, not your account data, and, per PROJECT.md, every
affiliate URL in the current build is still a placeholder with no live program.

## 5. Data retention and deletion

- You can delete your account and all data we hold about you (see `api/reset-account.ts`): this
  deletes every row you own across roughly twenty tables, unlinks every connected bank account at
  Plaid itself (not just locally), and ends any partnership or shared household you're part of.
  **[NEEDS PRODUCT INPUT: this control is currently gated to developer-allowlisted accounts only
  (`isDeveloperEmail`) and needs to be made available to every member before this policy can
  truthfully say "you can delete your account at any time."]**
- Credit-bureau consent records (`credit_consents`) retain only your Spinwheel identifier, phone
  last-4, and consent timestamp. Never the date of birth used to verify you, and never the credit
  report itself, which is fetched fresh on each view rather than stored.
- **[NEEDS LAWYER INPUT: a stated retention period for each data category, and whether any data
  must be retained post-deletion for legal/regulatory reasons (e.g., financial recordkeeping
  rules), which would need to be disclosed as an exception to "we delete everything."]**

## 6. Your rights

Depending on where you live, you may have rights to access, correct, delete, or receive a copy of
your personal data, and to opt out of certain uses. **[NEEDS LAWYER INPUT: this section needs
actual state-by-state treatment, at minimum CCPA/CPRA (California), and any other state where
Juniper has or expects members, e.g. Colorado, Connecticut, Virginia, Utah privacy laws differ
in scope and required disclosures. Do not publish a generic "you have rights" paragraph without
counsel naming which specific statutory rights apply and how a member exercises them.]**

## 7. Security

Your linked-account access token is stored in a server-only database table with no client access
at all (`plaid_items`, `REVOKE ALL FROM anon, authenticated`), reachable only by our backend via a
service-role key. Every other table uses row-level security scoping each member to their own data.
See the companion security review (issue #283) for a fuller account of what was checked.

**[NEEDS LAWYER INPUT: whether a security-incident notification commitment belongs in this
document, and under what state breach-notification laws Juniper would be obligated to notify
members if a real incident occurred.]**

## 8. Children's privacy

Juniper is not directed to and does not knowingly collect data from anyone under 18 (or a younger
age with parental consent, depending on jurisdiction). **[NEEDS LAWYER INPUT: confirm the correct
threshold.]**

## 9. Changes to this policy

**[NEEDS LAWYER INPUT: notice mechanism for material changes, especially any change that expands
what data is shared with a new third party.]**

## 10. Contact

Reach us at hello@juniperplan.com. [NEEDS LEGAL INPUT: confirm whether a dedicated privacy@ address
is also required for formal data-rights requests once Section 6's state-by-state treatment is
decided.]

---
