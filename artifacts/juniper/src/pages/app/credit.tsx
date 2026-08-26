import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CreditCard as CardIcon } from "lucide-react";
import { PageHeader } from "@/components/juniper/app-frame";
import { fetchPlaidItems, type PlaidItem } from "@/lib/plaid";

// The Credit tab shows only what Juniper actually holds: the credit-card accounts
// the member linked through Plaid, their balances, and their limits. Everything
// else this page used to claim was seeded demo data (a 726 score, a band, an
// eight-month trend, bureau-style factor rows, "refreshed monthly through a
// credit-data provider, soft pull") presented as the member's own. No credit-data
// provider is integrated anywhere in this codebase, so none of that had a source,
// and a fabricated score is the single most damaging thing to get wrong on a money
// product. Score monitoring is Stage 10 in ROADMAP.md; until a provider is under
// contract this page says so plainly instead of drawing a number.
//
// Deliberately reads accounts via fetchPlaidItems() (GET /api/plaid/accounts, the
// stored sanitized snapshot) rather than useFinances(), even though the house rule
// is to route money features through the lib/finances.ts seam. Reason: api/finances.ts
// early-returns { linked: false } unless the caller has BOTH plaid_items AND
// transaction rows, so a member with a linked card whose transactions have not
// synced yet (or whose card issuer returns no transactions) would see the "connect
// an account" empty state while their real card sits in the database. A later stage
// loosens that gate; when it lands, collapse this back onto useFinances() so the
// page stops having its own data path.
//
// APR is not shown. Plaid only returns card APRs under the `liabilities` product,
// and PLAID_PRODUCTS is `transactions` (see api/_plaid.ts), so there is no honest
// source for a rate. The old page printed one anyway.

type LinkedCard = {
  key: string;
  institution: string;
  name: string;
  mask: string | null;
  // Amount owed. Plaid reports credit balances as a positive `current`, but take
  // the magnitude anyway: a few issuers hand back a negative balance for an
  // overpaid card, and a negative bar width renders as nothing at all.
  balance: number;
  // null whenever the bank does not report a limit, and also on every snapshot
  // written before the server started sanitizing `limit` through. Utilization is
  // simply unknown for those cards, never assumed.
  limit: number | null;
  currency: string | null;
};

const money = (n: number, currency: string | null): string => {
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
};

// Credit accounts are `type === "credit"` in Plaid's taxonomy (cards plus the odd
// line of credit). Loans are a separate type and belong to the debt surfaces, not
// to a utilization calculation.
function linkedCards(items: PlaidItem[]): LinkedCard[] {
  return items.flatMap((it) =>
    (it.accounts ?? [])
      .filter((a) => (a.type ?? "").toLowerCase() === "credit")
      .map((a) => ({
        key: a.account_id,
        institution: it.institution_name || "Linked institution",
        name: a.name,
        mask: a.mask,
        balance: Math.abs(a.balance ?? 0),
        limit: a.limit != null && a.limit > 0 ? a.limit : null,
        currency: a.currency,
      })),
  );
}

const pct = (balance: number, limit: number) => Math.round((balance / limit) * 100);

// The factors a real score is built from, named so the not-live panel is specific
// about what is coming rather than vaguely promising "credit features".
const PLANNED_FACTORS = [
  "Utilization",
  "On-time payments",
  "Inquiries",
  "Age of credit",
  "Derogatory marks",
];

function ScorePending() {
  return (
    <div className="card pad-lg" style={{ marginBottom: 16 }}>
      <div className="eyebrow">Credit score</div>
      <h3 style={{ fontSize: 15, marginTop: 7 }}>Not tracked yet</h3>
      <p className="cs-note">
        Juniper does not read your credit score, and nothing on this page is one. Score tracking is
        planned: FICO 8 and VantageScore 3.0, alongside the factors that move them. It needs a
        credit-data provider under contract first, so there is no date to give you.
      </p>
      <div className="cs-chips">
        {PLANNED_FACTORS.map((f) => <span key={f}>{f}</span>)}
      </div>
    </div>
  );
}

function CardsEmpty() {
  return (
    <div className="card nudge-card">
      <div className="nc-mark"><CardIcon /></div>
      <h3>No credit cards linked</h3>
      <p>Connect a card and Juniper shows its balance, its limit, and how much of that limit you are using.</p>
      <Link href="/app/connections" className="btn" style={{ marginTop: 4 }}>Connect a card</Link>
    </div>
  );
}

function OverallUtilization({ cards }: { cards: LinkedCard[] }) {
  // Only cards with a known limit can be part of a utilization figure. Folding in
  // a card with an unknown limit either understates the ratio (limit treated as 0
  // and dropped from the denominator) or invents one, so it is excluded and the
  // exclusion is stated.
  const withLimit = cards.filter((c) => c.limit != null);
  const excluded = cards.length - withLimit.length;
  if (!withLimit.length) {
    return (
      <div className="util-hero">
        <div>
          <div className="eyebrow">Overall utilization</div>
          <div style={{ fontSize: 13, color: "var(--jnpr-ink-2)", marginTop: 6, maxWidth: "48ch", lineHeight: 1.55 }}>
            None of your linked cards report a credit limit, so there is nothing to measure a balance
            against. Refreshing your data on Connections re-reads limits from your bank.
          </div>
        </div>
      </div>
    );
  }
  const balance = withLimit.reduce((a, c) => a + c.balance, 0);
  const limit = withLimit.reduce((a, c) => a + (c.limit ?? 0), 0);
  const used = pct(balance, limit);
  const currency = withLimit[0].currency;
  return (
    <div className="util-hero">
      <div>
        <div className="eyebrow">Overall utilization</div>
        <div className="big tnum">{used}%</div>
        <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 2 }}>
          {money(balance, currency)} of {money(limit, currency)} across {withLimit.length}{" "}
          {withLimit.length === 1 ? "card" : "cards"}
          {excluded > 0 && `, ${excluded} more excluded for reporting no limit`}
        </div>
      </div>
      <div className="ub">
        <div className="bar" style={{ height: 10 }}>
          <i style={{ width: `${Math.min(100, used)}%`, background: used > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 7 }}>
          Scoring models generally favor staying under 30% of your limit.
        </div>
      </div>
    </div>
  );
}

function CardRow({ card }: { card: LinkedCard }) {
  const used = card.limit != null ? pct(card.balance, card.limit) : null;
  return (
    <div className="card-row">
      <div className="tile" style={{ background: "var(--jnpr-c4)" }}>{(card.institution[0] || "C").toUpperCase()}</div>
      <div className="ci">
        <div className="cn">{card.institution} · {card.name}</div>
        <div className="csub">
          {card.mask && <>····{card.mask} · </>}
          {money(card.balance, card.currency)}
          {card.limit != null ? <> of {money(card.limit, card.currency)} limit</> : <> owed, limit not reported</>}
        </div>
      </div>
      <div className="util">
        {used != null ? (
          <>
            <div className="ut"><span>Used</span><span className={used > 30 ? "hi" : undefined}>{used}%</span></div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, used)}%`, background: used > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} />
            </div>
          </>
        ) : (
          <div className="ut"><span>Used</span><span>Unknown</span></div>
        )}
      </div>
    </div>
  );
}

export function Credit() {
  const [cards, setCards] = useState<LinkedCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaidItems().then((items) => {
      if (!cancelled) setCards(linkedCards(items));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="frame">
      <PageHeader
        title="Credit"
        sub="Every credit card you have linked, what you owe on it, and how much of the limit you are using."
      />

      <ScorePending />

      {cards == null ? (
        <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>Loading…</div>
      ) : cards.length === 0 ? (
        <CardsEmpty />
      ) : (
        <div className="card pad-lg">
          <div className="card-head">
            <h3>Credit cards</h3>
            <span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <OverallUtilization cards={cards} />
          {cards.map((c) => <CardRow card={c} key={c.key} />)}
        </div>
      )}
    </div>
  );
}
