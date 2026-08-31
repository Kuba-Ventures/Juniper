import { useMemo, useState } from "react";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { CardFace } from "@/components/juniper/card-rewards-bits";
import { confirmCard, money0, type Candidate, type CardRewards, type UnidentifiedCard } from "@/lib/cards";

// "Which card is this?" Issue #168.
//
// ── WHY THIS COMPONENT EXISTS AT ALL ───────────────────────────────────────
//
// Everything on the rewards surface depends on knowing which PRODUCT each linked
// account is, and Plaid does not say. It returns an institution and an account
// name, and that name is routinely "CREDIT CARD" or "Card ending 4021". Credit
// Karma knows the product because it reads a credit report, where the tradeline
// carries it. Juniper reads Plaid, which does not.
//
// So the member answers, once per card. There is NO auto-confirm path anywhere,
// deliberately: `confidence` from api/_rewards.ts orders this list and nothing
// promotes a guess into a stored answer. A wrong guess would attach a stranger's
// reward rates to somebody's real spending and then quote them a confident dollar
// figure off it, and nothing on screen would look wrong.
//
// "My card is not listed" is a REAL ANSWER and is stored as one. The catalog is
// hand-assembled and covers common US cards, not all of them, so a member holding
// something else has to be able to say so and stop being asked.

function CandidateRow({
  candidate,
  top,
  onPick,
  busy,
}: {
  candidate: Candidate;
  top: boolean;
  onPick: () => void;
  busy: boolean;
}) {
  const fee = candidate.annual_fee > 0 ? `${money0(candidate.annual_fee)} a year` : "No annual fee";
  return (
    <button
      type="button"
      className={top ? "cr-pk-o top" : "cr-pk-o"}
      onClick={onPick}
      disabled={busy}
    >
      {/* A real thumbnail rather than a colour chip. The chip version was
          asking somebody to pick between five Capital One cards on the strength
          of "which shade of grey", which is not a choice anybody can make. */}
      <CardFace
        size="sm"
        issuer={candidate.issuer}
        brandColor={candidate.brand_color}
        artUrl={candidate.art_url}
      />
      <span>
        <span className="cr-pk-on">{candidate.name}</span>
        <span className="cr-pk-od">
          {fee} &middot; {candidate.rewards_currency}
          {/* The reason this one is first, said out loud rather than left as an
              unexplained highlight. Only shown on a genuinely strong match: a
              useless account name ("CREDIT CARD") scores every candidate at zero,
              and claiming a "closest match" there would be inventing a signal. */}
          {top && candidate.confidence >= 0.5 && <> &middot; closest match to your account name</>}
        </span>
      </span>
    </button>
  );
}

export function CardIdentifyDialog({
  card,
  catalog,
  onClose,
  onSaved,
}: {
  card: UnidentifiedCard;
  catalog: CardRewards["catalog"];
  /** Dismissed without answering. */
  onClose: () => void;
  /** Answered. The dialog does NOT also call onClose: the parent decides whether
      to advance to the next unidentified card or close, and an earlier version
      that called both had the close overwrite the advance, so the queue never
      moved past the first card. */
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The full catalog, shaped like a candidate so one row component draws both
  // lists. Filtered client-side because the whole catalog already arrived with
  // the page; the moment it is too big for that, this becomes a search endpoint
  // and api/card-rewards.ts stops sending `catalog`. Both places say so.
  const all = useMemo<Candidate[]>(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.issuer.toLowerCase().includes(q))
      .map((p) => ({
        product_id: p.product_id, name: p.name, issuer: p.issuer,
        annual_fee: p.annual_fee, rewards_currency: p.rewards_currency,
        brand_color: p.brand_color, art_url: p.art_url, confidence: 0,
      }));
  }, [catalog, query]);

  const save = async (productId: string | null) => {
    setBusy(true);
    setError(null);
    const ok = await confirmCard(card.plaid_account_id, productId);
    setBusy(false);
    if (!ok) {
      setError("Could not save that. Try again in a moment.");
      return;
    }
    // Reset the browse state so the next card in the queue opens on its own
    // ranked guesses rather than inheriting this card's search.
    setShowAll(false);
    setQuery("");
    onSaved();
  };

  const list = showAll ? all : card.candidates;

  return (
    <ModalBackdrop onClose={onClose} wide>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>
        Which {card.institution} card is this?
      </h3>
      <p className="cr-pk-s">
        Your bank calls it &ldquo;{card.account_name}&rdquo;
        {card.mask && <> &middot; &middot;&middot;&middot;&middot;{card.mask}</>}
        . Pick the one printed on your card, so Juniper can show what it earns and what it comes with.
      </p>

      {showAll && (
        <input
          className="cr-pk-search"
          type="search"
          value={query}
          placeholder="Search all cards"
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      )}

      <div className="cr-pk-list">
        {list.length === 0 && (
          <div className="cr-pk-empty">
            No cards match &ldquo;{query}&rdquo;. The catalog covers common US cards, not all of them.
          </div>
        )}
        {list.map((c, i) => (
          <CandidateRow
            key={c.product_id}
            candidate={c}
            top={!showAll && i === 0}
            busy={busy}
            onPick={() => void save(c.product_id)}
          />
        ))}

        {!showAll && (
          <button type="button" className="cr-pk-more" onClick={() => setShowAll(true)} disabled={busy}>
            None of these, show all cards
          </button>
        )}

        {/* Stored as an answer, not as a dismissal. `product_id: null` means "not
            in your catalog", which is different from never having been asked, so
            the member is not prompted again. */}
        <button type="button" className="cr-pk-none" onClick={() => void save(null)} disabled={busy}>
          My card is not listed
        </button>
      </div>

      {error && <div className="cr-pk-err">{error}</div>}

      <div className="cr-prov" style={{ marginTop: 14 }}>
        Juniper never guesses which card you hold. Your bank only tells it the account name, which is why
        this is worth asking rather than working out. Nothing here changes your account or your bank.
      </div>
    </ModalBackdrop>
  );
}

/**
 * The prompt on the Credit page for cards still waiting to be identified.
 *
 * Deliberately one prompt for the whole queue rather than one per card. A member
 * who has just linked four cards should see one thing to do, not four stacked
 * banners, and the dialog moves to the next card on its own.
 */
export function CardIdentifyPrompt({
  cards,
  catalog,
  onSaved,
}: {
  cards: UnidentifiedCard[];
  catalog: CardRewards["catalog"];
  onSaved: () => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!cards.length) return null;

  const first = cards[0];
  const more = cards.length - 1;

  return (
    <>
      <div className="cr-cc">
        <CardFace size="md" unknown label="Which card?" />
        <div className="cr-cc-b">
          <h3 className="cr-cc-h">
            {cards.length === 1
              ? `Which ${first.institution} card is ${first.mask ? `····${first.mask}` : "this"}?`
              : `Identify ${cards.length} of your cards`}
          </h3>
          <p className="cr-cc-d">
            Your bank tells Juniper the account name and not the product, so it cannot tell what these
            cards earn until you confirm them.
            {more > 0 && <> Starting with {first.institution}{first.mask ? ` ····${first.mask}` : ""}.</>}
          </p>
        </div>
        <div className="cr-cc-act">
          <button type="button" className="btn" onClick={() => setOpenIndex(0)}>
            Identify {cards.length === 1 ? "card" : "cards"}
          </button>
        </div>
      </div>

      {openIndex != null && cards[openIndex] && (
        <CardIdentifyDialog
          card={cards[openIndex]}
          catalog={catalog}
          onClose={() => setOpenIndex(null)}
          onSaved={() => {
            // Move straight to the next card in the queue rather than closing and
            // making them find the prompt again. `cards` is the list as it was
            // when the dialog opened, which is what makes walking it by index
            // safe even though the parent re-fetches underneath.
            setOpenIndex((i) => (i != null && i + 1 < cards.length ? i + 1 : null));
            onSaved();
          }}
        />
      )}
    </>
  );
}
