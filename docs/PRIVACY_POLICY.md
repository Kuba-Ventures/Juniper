*Last updated: September 9, 2026*

## 1. What this covers

This policy describes what Juniper collects, why, who it's shared with, and what rights you have
over it. It applies to the Juniper web app at www.juniperplan.com.

## 2. Data we collect

**Account and profile data**, from you directly: name, email, household/partner status, financial
goals you set at signup.

**Linked financial data**, from Plaid, once you connect an account: account and routing
identifiers (never seen by Juniper, held only by Plaid), balances, transactions, investment
holdings and flows, and, if you've granted access to loan and card account details, loan/card APRs
and payment terms. This is real transaction-level data from real banks. Juniper stores your Plaid
access token in a database only our own servers can read (never sent to your browser), along with
a sanitized snapshot of your account information.

**Credit-bureau data**, only if you separately opt in: your phone number and date of birth are
sent to Spinwheel, our credit-data provider, solely to verify your identity via a one-time SMS
passcode and connect your credit file. Once verified, we store only your Spinwheel identifier, the
last 4 digits of your phone number, and the consent timestamp. **We never store your date of
birth, and never a copy of your credit report.** Your score is looked up fresh each time you view
it; we only keep the most recent value on file so we can alert you if it changes.

**Manually entered data**: any account, balance, or credit limit you type in by hand for
institutions Plaid can't reach.

**Ask Juniper conversations**: your messages, and the account data used to ground a response
(current balances, spending, plan figures), are sent to Anthropic's Claude API to generate a
response. See Section 4.

**Shared-workspace data**, only if you invite a partner: whichever of your accounts, balances, and
goals you explicitly mark as shared (private by default), plus messages you send inside the
shared space.

**Usage analytics**: anonymized/aggregated product-usage events via Google Analytics 4
(production only), never including account balances or transaction content.

We do **not** collect your bank login credentials. Plaid handles authentication with your
institution directly and never shares it with Juniper.

## 3. How we use it

- To show you your own net worth, spending, budgets, Juniper Score, and plans.
- To generate Ask Juniper's responses to your questions.
- To detect recurring charges, alert you to a budget going over, a connection needing
  reconnecting, or (once out of sandbox) a real credit-score change.
- To improve the product, using aggregated or de-identified usage data. Your Ask Juniper
  conversations are not used to train Anthropic's models (see Section 4).

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

Each recipient processes data under its own privacy policy: [Plaid](https://plaid.com/legal/),
[Anthropic](https://www.anthropic.com/legal/privacy), [Supabase](https://supabase.com/privacy),
[Vercel](https://vercel.com/legal/privacy-policy), and
[Google Analytics](https://policies.google.com/privacy).

We do not share your data with advertisers. Marketplace and affiliate partners shown elsewhere in
the product receive a click event, not your account data. As of this writing there is no live
affiliate program: every partner link in the app is a placeholder.

## 5. Data retention and deletion

- You can request deletion of your account and all data we hold about you at any time by emailing
  hello@juniperplan.com. We delete every row you own across roughly twenty tables, unlink every
  connected bank account at Plaid itself (not just locally), and end any partnership or shared
  household you're part of, within 30 days of a verified request.
- Credit-bureau consent records retain only your Spinwheel identifier, phone last-4, and consent
  timestamp. Never the date of birth used to verify you, and never the credit report itself, which
  is fetched fresh on each view rather than stored.
- We otherwise retain your data for as long as your account is active. Some records (for example,
  transaction and consent records that function as financial recordkeeping) may be retained for a
  longer period after deletion where we're required to by law.

## 6. Your rights

Depending on where you live, you may have the right to:

- know what personal data we hold about you and request a copy of it;
- correct inaccurate data;
- delete your data (see Section 5);
- opt out of the sale or sharing of your data (we do not sell or share your data, so this is
  already the case for everyone); and
- not be discriminated against for exercising any of these rights.

To exercise any of these rights, email hello@juniperplan.com. We'll respond within 45 days.

## 7. Security

Your linked-account access token is stored in a database table that no app or browser can read
directly: only our own backend servers can reach it, using a separate, more privileged credential.
Every other record is restricted so that each member can only reach their own data. These
protections were checked as part of an internal security review.

If we experience a security incident that compromises your personal information, we'll notify you
as required by applicable law.

## 8. Children's privacy

Juniper is not directed to and does not knowingly collect data from anyone under 18.

## 9. Changes to this policy

We may update this policy from time to time. The "Last updated" date at the top of this page
reflects the most recent change. For a material change, especially one that expands who we share
your data with, we'll notify you by email or an in-app notice at least 30 days before it takes
effect.

## 10. Contact

Reach us at hello@juniperplan.com.

---
