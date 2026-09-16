import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Check, Loader2, PencilLine, Plus, Search } from "lucide-react";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import { GALLERY_GROUPS } from "@/lib/institution-gallery";
import type { ManualCategory } from "@/lib/manual-accounts";
import {
  normInstitutionName,
  searchInstitutions,
  type InstitutionBrand,
  type LinkInstitution,
  type PlaidInstitutionMatch,
} from "@/lib/plaid";

// Whether `name` (a search hit or a gallery's plain display name, e.g. "Venmo")
// is already on file. `connected` is keyed by the exact institution name Plaid
// or the manual form gave us, which for a payment app's account variant is
// "<Name> - Personal" / "<Name> - Business" rather than the plain name, so an
// exact-match lookup alone leaves an already-connected Venmo still offered as a
// fresh gallery tile forever. Treat any connected name that starts with
// "<name> - " as the same institution.
function isConnected(name: string, connected?: Map<string, string>): boolean {
  if (!connected?.size) return false;
  const norm = normInstitutionName(name);
  if (connected.has(norm)) return true;
  const prefix = `${norm} - `;
  for (const key of connected.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

// The "connect an account" surface (account discovery, tier 2). In order:
//
//   1. Search Plaid's real institution list. One tap on a result links that
//      institution, carrying its institution_id and routing_number through so
//      Link opens on the right bank instead of its own front page.
//   2. A gallery of common institutions below the search bar (issue #418), for
//      the recall problem search alone doesn't solve: someone with 5-10
//      accounts often doesn't remember all of them until a logo jogs their
//      memory ("oh right, I have a Chase card too"). Tick several, then one
//      "Connect N selected" queues them through Plaid Link sequentially, the
//      same use-link-queue.ts mechanism Search all banks and a single search
//      tap already use (Link still authenticates one institution per session;
//      the queue just opens it again for the next tick, same as it already
//      does on an OAuth-bank return). Each section also ends in its own
//      "Add account" tile, opening the manual form (tier 3) pre-scoped to that
//      section's category, for the institution that will never be in any
//      gallery, common or not, and doesn't need a full trip to the bottom bar
//      to say so.
//   3. "Search all banks", which opens Plaid Link with no preselection, for
//      someone who would rather browse Plaid directly.
//   4. "Enter it by hand (no live balance)", last on purpose: a hand-typed
//      balance is a static snapshot that never refreshes, so it should be a
//      deliberate choice for accounts Plaid cannot reach at all, not the first
//      door someone finds.
//
// A curated gallery used to live here and was deleted on 2026-08-26: roughly
// 60 hardcoded institutions, each carrying its own institution_id, which had
// to be right for both Sandbox and Production and went stale as Plaid's own
// ids changed. This gallery does not repeat that mistake. GALLERY_GROUPS
// (institution-gallery.ts) holds plain display names, grouped into labeled
// sections (Banking, Credit cards, Investing, Payments) the way the old
// gallery was, purely for scanability; resolveGalleryPick below turns a
// selected name into a real institution the same way a typed search already
// does, one Plaid lookup per name, at connect time rather than baked into the
// list. So the gallery can go stale in only one way, a bank falling out of
// fashion, never in the way that broke last time. Unlike the old gallery,
// there is no per-group "select all": selection is one flat set across every
// group, since sixteen names is too few for a select-all to earn its keep.
//
// Search results stay rows, because a row is a result: someone who typed a
// name is done choosing and wants one tap, not a checkbox and a submit button.
// Gallery entries are tiles with a checkmark, because picking several before
// connecting is the whole point of a memory-jogging grid.

// One row's brand mark, resolved through lib/institution-brand so a row here
// looks like the same institution does in the Connections list: Plaid's own
// logo, then our bundled art, then a monogram tinted with the bank's brand
// color, then the building glyph.
//
// `brand` carries the logo and primary_color that /api/plaid/institutions-search
// now returns with each hit, so a searched bank shows its real mark before it is
// linked. A Connected row passes none: those are institutions already on file
// and the section is capped status, so it stays on the bundled art rather than
// holding a second copy of the same base64 payload the list above already has.
function RowMark({ name, brand }: { name: string; brand?: InstitutionBrand | null }) {
  const mark = resolveInstitutionMark(name, brand);
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
  // Optional `ManualCategory` argument: the bottom bar's "Enter it by hand" calls
  // this with nothing, since it isn't scoped to any one kind of account, while
  // each gallery section's own "Add account" tile passes its section's category
  // (see GALLERY_GROUPS in institution-gallery.ts), so the manual form opens
  // already set to Credit cards / Investing / etc. rather than the generic
  // default.
  onManual?: (category?: ManualCategory) => void;
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

  // Gallery selection (issue #418). Ticked names, not yet resolved to a real
  // Plaid institution: that lookup only happens once "Connect" is pressed, so
  // ticking a few tiles to compare costs nothing.
  const [gallerySelected, setGallerySelected] = useState<Set<string>>(new Set());
  const [resolvingGallery, setResolvingGallery] = useState(false);

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
    if (grew) {
      setQuery("");
      setGallerySelected(new Set());
    }
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
    () => plaidHits.filter((h) => !isConnected(h.name, connected)),
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

  // Each group's list minus anything already on file, same rule as the search
  // results above: nobody is offered a tile for a bank they've already linked.
  // Groups that end up empty (every name in them already connected) are
  // dropped entirely rather than rendered as a bare, tile-less heading.
  const galleryGroups = useMemo(
    () =>
      GALLERY_GROUPS.map((group) => ({
        label: group.label,
        manualCategory: group.manualCategory,
        institutions: group.institutions.filter((name) => !isConnected(name, connected)),
      })).filter((group) => group.institutions.length > 0),
    [connected],
  );
  const galleryVisible = useMemo(() => galleryGroups.flatMap((g) => g.institutions), [galleryGroups]);

  function toggleGallery(name: string) {
    setGallerySelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Turn one ticked gallery name into a real Plaid institution, the same way a
  // typed search result already carries its institution_id and routing_number
  // through to Link. Prefers an exact (case-insensitive) name match over
  // Plaid's top relevance hit, since "Citi" should resolve to Citibank itself
  // rather than whichever Citi-branded card product search ranks first. Falls
  // back to the bare name, with no institution_id, when Plaid's search turns up
  // nothing at all: that still opens Link for that queue slot (same shape as
  // "Search all banks"), rather than silently dropping the tile from what was
  // promised as "Connect N selected".
  async function resolveGalleryPick(name: string): Promise<LinkInstitution> {
    const hits = await searchInstitutions(name);
    const exact = hits.find((h) => normInstitutionName(h.name) === normInstitutionName(name));
    const hit = exact ?? hits[0];
    return hit
      ? { institution_id: hit.institution_id, name: hit.name, routing_number: hit.routing_number }
      : { name };
  }

  async function handleGalleryConnect() {
    if (gallerySelected.size === 0 || resolvingGallery) return;
    setResolvingGallery(true);
    try {
      const institutions = await Promise.all([...gallerySelected].map(resolveGalleryPick));
      onConnect(institutions);
    } finally {
      setResolvingGallery(false);
    }
  }

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
              <RowMark
                name={hit.name}
                brand={{ name: hit.name, logo: hit.logo, primary_color: hit.primary_color }}
              />
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

      {/* Hidden once someone starts typing: a query already answers the recall
          question for that one bank, and showing 16 tiles under a results list
          just adds scroll. Reappears the moment the box is empty, at rest or
          after a search is cleared. */}
      {!trimmed && galleryVisible.length > 0 && (
        <div className="inst-gallery">
          <div className="inst-divider">or pick a few common ones</div>
          {galleryGroups.map((group) => (
            <div className="inst-gal-group" key={group.label}>
              <div className="inst-cat-h">{group.label}</div>
              <div className="inst-gal-grid">
                {group.institutions.map((name) => {
                  const on = gallerySelected.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`inst-gal-tile${on ? " on" : ""}`}
                      onClick={() => toggleGallery(name)}
                      disabled={busy || resolvingGallery}
                      aria-pressed={on}
                      aria-label={`${on ? "Deselect" : "Select"} ${name}`}
                    >
                      <span className="inst-gal-check">
                        <Check size={10} strokeWidth={3} />
                      </span>
                      <RowMark name={name} />
                      <span className="inst-gal-name">{name}</span>
                    </button>
                  );
                })}
                {/* The section's own quick-add: not in the gallery at all, so
                    scoped straight to this section's category rather than the
                    manual form's generic default. Sits at the end of the grid
                    like one more tile, since that's exactly what it is standing
                    in for. */}
                {onManual && (
                  <button
                    type="button"
                    className="inst-gal-tile inst-gal-add"
                    onClick={() => onManual(group.manualCategory)}
                    disabled={busy || resolvingGallery}
                    aria-label={`Add a ${group.label.toLowerCase()} account by hand`}
                  >
                    <span className="inst-gal-add-icon">
                      <Plus size={14} strokeWidth={2.5} />
                    </span>
                    <span className="inst-gal-name">Add account</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          {gallerySelected.size > 0 && (
            <button
              className="btn inst-gal-connect"
              onClick={() => void handleGalleryConnect()}
              disabled={busy || resolvingGallery}
            >
              {resolvingGallery ? (
                <>
                  <Loader2 size={15} className="inst-spin" /> Finding your banks…
                </>
              ) : (
                `Connect ${gallerySelected.size} selected`
              )}
            </button>
          )}
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
            // Called with no category, unlike a section's own quick-add tile
            // above: this button isn't scoped to any one kind of account, so the
            // form opens on its generic default. Wrapped in an arrow rather than
            // passed directly, since onManual now takes an optional category and
            // a bare onClick={onManual} would hand it the click event instead.
            <button className="inst-otherbtn" onClick={() => onManual()} disabled={busy}>
              <PencilLine size={15} /> Enter it by hand (no live balance)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
