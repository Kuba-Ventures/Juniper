import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Check, Loader2, PencilLine, Plus, Search } from "lucide-react";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import {
  normInstitutionName,
  searchInstitutions,
  type LinkInstitution,
  type PlaidInstitutionMatch,
} from "@/lib/plaid";

// The "connect an account" surface (account discovery, tier 2). Three paths, in
// the order they are offered:
//
//   1. Search Plaid's real institution list. One tap on a result links that
//      institution, carrying its institution_id and routing_number through so
//      Link opens on the right bank instead of its own front page.
//   2. "Search all banks", which opens Plaid Link with no preselection, for
//      someone who would rather browse Plaid directly.
//   3. "Enter it by hand (no live balance)", last on purpose: a hand-typed
//      balance is a static snapshot that never refreshes, so it should be a
//      deliberate choice for accounts Plaid cannot reach at all, not the first
//      door someone finds.
//
// This used to be a curated gallery: roughly 60 hardcoded institutions in five
// categories, tick several, "Connect N selected". It is gone, and it should not
// come back, because Plaid Link authenticates exactly one institution per
// session and there is no API to hand it a list. So multi-select promised
// something Plaid cannot deliver: tick two banks, hit connect, and Link makes
// you choose again, one at a time, from its own search. The gallery also carried
// its own maintenance debt (60 names and logos going stale) and its own dead end
// (a bank Plaid supports but we never listed read as "not supported"). Plaid's
// list is the real one, live, and already searchable, so it is now the primary
// path rather than a supplement to a shortlist.
//
// Results are rows and not tiles because a row is a result: someone who typed a
// name is done choosing and wants one tap, not a checkbox and a submit button.

// One row's brand mark, resolved through lib/institution-brand so a row here
// looks like the same institution does in the Connections list.
//
// No Plaid brand payload is passed, and that is a server-side rule rather than
// an omission: /api/plaid/institution-logos only ever serves institutions the
// caller has already linked (ids come from their own plaid_items rows, never the
// request), so nothing can fetch artwork for an arbitrary search hit. Search
// rows therefore resolve through the bundled art for household names and take
// the building glyph otherwise, which is the same last resort Connections uses.
// The monogram arm is unreachable until someone threads a brand through; it is
// handled anyway so that change is a one-line prop rather than a bug.
function RowMark({ name }: { name: string }) {
  const mark = resolveInstitutionMark(name);
  if (mark.kind === "logo") return <img className="inst-logo" src={mark.src} alt="" />;
  if (mark.kind === "monogram") {
    return (
      <span className="inst-mono" style={{ background: mark.background, color: mark.color }}>
        {mark.letter}
      </span>
    );
  }
  return (
    <span className="inst-glyph">
      <Building2 />
    </span>
  );
}

export function InstitutionPicker({
  onConnect,
  onManual,
  busy,
  connected,
  showConnected = true,
}: {
  onConnect: (institutions: LinkInstitution[]) => void;
  onManual?: () => void;
  busy?: boolean;
  // Institutions already connected, keyed by normalized name so matching is
  // case-insensitive, valued by the display name Plaid (or the manual form)
  // actually gave us. Used for two things: dropping an already-linked bank out
  // of the search results, so nobody is invited to link Chase twice, and
  // labelling the Connected section below.
  connected?: Map<string, string>;
  // Whether to render the Connected section. Defaults on, because a surface with
  // no other list of connections must confirm that a link took: in onboarding a
  // member who links two banks has no other way to see that both landed. The
  // Connections page passes false, since its own linked-items list sits directly
  // above this component and would say the same thing twice.
  showConnected?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [plaidHits, setPlaidHits] = useState<PlaidInstitutionMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();
  const trimmed = query.trim();

  // Results are cached for the life of the picker so backspacing through a word,
  // or retyping a bank someone already looked at, costs nothing. Keyed by the
  // normalized query, the same string the request sends.
  const cacheRef = useRef<Map<string, PlaidInstitutionMatch[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  // After a link lands, clear the box. Plaid takes one institution per session,
  // so connecting is always followed by either finishing or searching for the
  // next bank, and both start from an empty box: leaving the old query in place
  // leaves someone staring at results for the bank they just linked, now all
  // filtered out as connected. Keyed on the connected count growing, so it fires
  // for a search row, a "search all banks" link, or a manual add, and never on an
  // unrelated re-render.
  const prevConnectedRef = useRef(connected?.size ?? 0);
  useEffect(() => {
    const size = connected?.size ?? 0;
    const grew = size > prevConnectedRef.current;
    prevConnectedRef.current = size;
    if (grew) setQuery("");
  }, [connected]);

  useEffect(() => {
    abortRef.current?.abort();
    // Under two characters matches too much to be useful and still costs a call.
    if (q.length < 2) {
      setPlaidHits([]);
      setSearching(false);
      return;
    }
    const cached = cacheRef.current.get(q);
    if (cached) {
      setPlaidHits(cached);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // Debounced because it fires while someone is typing and Plaid rate-limits
    // the endpoint.
    const timer = setTimeout(() => {
      void searchInstitutions(q, controller.signal).then((hits) => {
        if (controller.signal.aborted) return;
        cacheRef.current.set(q, hits);
        setPlaidHits(hits);
        setSearching(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Deliberately not filtered by the query. This is a status list ("did both of
  // my banks take?"), not an index to search, and hiding a just-linked bank
  // because the member has started typing the next one removes the reassurance
  // it exists to give.
  const connectedNames = useMemo(
    () => (connected?.size ? [...connected.values()].sort((a, b) => a.localeCompare(b)) : []),
    [connected],
  );

  // Plaid's hits minus anything already on file, so a linked bank is never
  // offered as a fresh connection.
  const plaidVisible = useMemo(
    () => plaidHits.filter((h) => !connected?.has(normInstitutionName(h.name))),
    [plaidHits, connected],
  );

  // One line under the box whenever there is nothing to tap, so the state of the
  // search is never a blank space. The "already connected" case is real and
  // otherwise indistinguishable from a failed search: search "chase" with Chase
  // linked and every hit is filtered out above.
  const status = searching
    ? `Looking for "${trimmed}" in Plaid's institution list.`
    : q.length < 2
      ? "Type a bank, card, or investment provider to search everything Plaid supports."
      : plaidHits.length > 0
        ? `Everything matching "${trimmed}" is already connected.`
        : `No institution matching "${trimmed}". Check the spelling, search all banks below, or enter it by hand.`;

  return (
    <div className="inst-pick">
      {showConnected && connectedNames.length > 0 && (
        <div className="inst-sec">
          <div className="inst-cat-h">Connected</div>
          <div className="inst-rows inst-rows-scroll">
            {connectedNames.map((name) => (
              <div
                key={`connected-${name}`}
                className="inst-row done"
                aria-label={`${name}, already connected`}
              >
                <RowMark name={name} />
                <span className="inst-name">{name}</span>
                <span className="inst-connected-tag">
                  <Check size={11} strokeWidth={3} /> Connected
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inst-searchbar">
        <Search size={15} />
        <input
          className="inst-search"
          value={query}
          placeholder="Search any bank, card, or investment provider"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search institutions"
        />
        {searching && <Loader2 size={15} className="inst-spin" />}
      </div>

      {plaidVisible.length > 0 ? (
        <div className="inst-rows inst-rows-scroll">
          {plaidVisible.map((hit) => (
            <button
              key={hit.institution_id}
              className="inst-row"
              onClick={() =>
                onConnect([
                  {
                    institution_id: hit.institution_id,
                    name: hit.name,
                    routing_number: hit.routing_number,
                  },
                ])
              }
              disabled={busy}
              aria-label={`Connect ${hit.name} through Plaid`}
            >
              <RowMark name={hit.name} />
              <span className="inst-name">{hit.name}</span>
              <ArrowRight size={14} className="inst-row-go" />
            </button>
          ))}
        </div>
      ) : (
        <div className="inst-empty" aria-live="polite">
          {status}
        </div>
      )}

      <div className="inst-bar">
        <div className="inst-bar-left">
          <button className="inst-otherbtn" onClick={() => onConnect([{}])} disabled={busy}>
            <Plus size={15} /> Search all banks
          </button>
          {onManual && (
            // The label states the tradeoff inline. "Add manually" read as the
            // obvious choice to someone who couldn't find their bank, so people
            // hand-typed a static balance for institutions Plaid links live.
            <button className="inst-otherbtn" onClick={onManual} disabled={busy}>
              <PencilLine size={15} /> Enter it by hand (no live balance)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
