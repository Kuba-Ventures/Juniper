import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, PencilLine, Loader2, ArrowRight } from "lucide-react";
import { LOGOS } from "@/lib/mock-logos";
import {
  normInstitutionName,
  searchInstitutions,
  type LinkInstitution,
  type PlaidInstitutionMatch,
} from "@/lib/plaid";

// A searchable, sorted, multi-select institution gallery for the "connect an
// account" flow (account discovery, tier 2). Users can browse by category, type
// to filter, tick several institutions (or "Select all" a category), and connect
// them in one go, the caller links them sequentially via the Plaid Link queue.
//
// The search bar does two things at once. It filters the curated CATALOG tiles
// locally, and it queries Plaid's real institution list over
// /api/plaid/institutions-search, rendering those hits in a "From Plaid" section
// below the tiles. That second half is the point: the bar's placeholder promises
// "any bank", and before this it only matched ~60 hardcoded names, so typing a
// bank Plaid supports but we never listed (Carter Bank, most regional banks and
// credit unions) produced "No matches" and nudged people into the manual form,
// whose hand-typed balance never refreshes. Debounced and cached per query
// because it fires while someone is typing and Plaid rate-limits the endpoint.
// Each category ends with a dashed "Not listed" tile, and the bar carries a
// global "Search all banks"; both open Plaid's full search for anything outside
// the gallery (small/regional banks like Carter Bank, which Plaid does link, via
// OAuth). Only "Enter it by hand" goes to the manual form, for accounts Plaid
// can't reach at all. Keeping the manual path visibly last matters: a hand-typed
// balance is a static snapshot that never refreshes, so it should be the choice
// someone makes deliberately, not the first door they find.
//
// Tiles carry only a display name; the real institution id/name comes back from
// Plaid on success, so a tapped name is just a hint + label.

type Inst = { name: string; logo?: string }; // logo = key into LOGOS, else monogram

const CATALOG: { category: string; color: string; items: Inst[] }[] = [
  {
    category: "Banking",
    color: "--jnpr-c1",
    items: [
      { name: "Chase", logo: "chase" },
      { name: "Bank of America", logo: "bankofamerica" },
      { name: "Wells Fargo", logo: "wellsfargo" },
      { name: "Capital One", logo: "capitalone" },
      { name: "Citibank", logo: "citi" },
      { name: "US Bank", logo: "usbank" },
      { name: "PNC", logo: "pnc" },
      { name: "Ally", logo: "ally" },
      { name: "Marcus by Goldman Sachs", logo: "marcus" },
      { name: "SoFi", logo: "sofi" },
      { name: "Chime", logo: "chime" },
      { name: "Truist", logo: "truist" },
    ],
  },
  {
    category: "Investing & retirement",
    color: "--jnpr-c5",
    items: [
      { name: "Fidelity", logo: "fidelity" },
      { name: "Vanguard", logo: "vanguard" },
      { name: "Charles Schwab", logo: "schwab" },
      { name: "Robinhood", logo: "robinhood" },
      { name: "Betterment", logo: "betterment" },
      { name: "Wealthfront", logo: "wealthfront" },
      { name: "E*TRADE", logo: "etrade" },
      { name: "Merrill", logo: "merrill" },
      { name: "Empower", logo: "empower" },
      { name: "TIAA", logo: "tiaa" },
    ],
  },
  {
    category: "Credit cards",
    color: "--jnpr-c4",
    items: [
      { name: "American Express", logo: "amex" },
      { name: "Chase", logo: "chase" },
      { name: "Capital One", logo: "capitalone" },
      { name: "Apple Card", logo: "apple" },
      { name: "Discover", logo: "discover" },
      { name: "Citi", logo: "citi" },
      { name: "Bank of America", logo: "bankofamerica" },
      { name: "Wells Fargo", logo: "wellsfargo" },
    ],
  },
  {
    category: "Loans",
    color: "--jnpr-c2",
    items: [
      { name: "SoFi", logo: "sofi" },
      { name: "Earnest", logo: "earnest" },
      { name: "Sallie Mae", logo: "salliemae" },
      { name: "Nelnet", logo: "nelnet" },
      { name: "MOHELA", logo: "mohela" },
      { name: "Rocket Mortgage", logo: "rocketmortgage" },
    ],
  },
  {
    category: "Payment & cash",
    color: "--jnpr-c3",
    items: [
      { name: "PayPal", logo: "paypal" },
      { name: "Venmo", logo: "venmo" },
      { name: "Cash App", logo: "cashapp" },
    ],
  },
];

// Sort items alphabetically within a category for a predictable, indexed browse.
const SORTED_CATALOG = CATALOG.map((c) => ({
  ...c,
  items: [...c.items].sort((a, b) => a.name.localeCompare(b.name)),
}));

// Normalized catalog name to its logo + color, so a connected institution that
// does live in the gallery keeps its brand mark when hoisted into the Connected
// section instead of degrading to a monogram.
const CATALOG_BY_NAME = new Map<string, { logo?: string; color: string }>(
  CATALOG.flatMap((c) => c.items.map((i) => [i.name.trim().toLowerCase(), { logo: i.logo, color: c.color }] as const)),
);

function Mark({ inst, color }: { inst: Inst; color: string }) {
  if (inst.logo && LOGOS[inst.logo]) return <img className="inst-logo" src={LOGOS[inst.logo]} alt="" />;
  return (
    <span className="inst-mono" style={{ background: `var(${color})` }}>
      {inst.name.charAt(0)}
    </span>
  );
}

export function InstitutionPicker({
  onConnect,
  onManual,
  busy,
  connected,
}: {
  onConnect: (institutions: LinkInstitution[]) => void;
  onManual?: () => void;
  busy?: boolean;
  // Institutions already connected, keyed by normalized name so matching against
  // the catalog is case-insensitive, valued by the display name Plaid (or the
  // manual form) actually gave us. A Map rather than a Set because the value is
  // the only label we have for a connection that isn't in CATALOG: Carter Bank
  // and most regional banks are linkable but not in the gallery, and before this
  // they connected successfully and then appeared nowhere.
  connected?: Map<string, string>;
}) {
  const [query, setQuery] = useState("");
  // Selection keyed by "category:name" so the same brand in two categories stays
  // independent in the UI; we dedupe by name when connecting.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plaidHits, setPlaidHits] = useState<PlaidInstitutionMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();
  const trimmed = query.trim();

  // Results are cached for the life of the picker so backspacing through a word,
  // or retyping a bank someone already looked at, costs nothing. Keyed by the
  // normalized query, the same string the request sends.
  const cacheRef = useRef<Map<string, PlaidInstitutionMatch[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

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

  const isConnected = (name: string) => !!connected && connected.has(normInstitutionName(name));

  // Everything connected, hoisted into its own section at the top and removed from
  // the category grids below, so "what do I already have" is one glance instead of
  // a hunt through five categories. Catalog members keep their real logo; anything
  // outside the catalog falls back to a monogram tile.
  const connectedItems = useMemo(() => {
    if (!connected?.size) return [];
    return [...connected.entries()]
      .map(([norm, label]) => {
        const known = CATALOG_BY_NAME.get(norm);
        return {
          inst: { name: label, logo: known?.logo } as Inst,
          color: known?.color ?? "--jnpr-c1",
        };
      })
      .sort((a, b) => a.inst.name.localeCompare(b.inst.name));
  }, [connected]);

  const connectedFiltered = useMemo(
    () => (q ? connectedItems.filter((c) => c.inst.name.toLowerCase().includes(q)) : connectedItems),
    [connectedItems, q],
  );

  const filtered = useMemo(
    () =>
      SORTED_CATALOG.map((cat) => ({
        ...cat,
        items: cat.items
          .filter((i) => !isConnected(i.name))
          .filter((i) => (q ? i.name.toLowerCase().includes(q) : true)),
      })).filter((cat) => cat.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, connected],
  );

  const keyOf = (category: string, name: string) => `${category}:${name}`;

  const toggle = (category: string, name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(category, name);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // "Select all" / per-category "All" cover every visible tile. `filtered` is the
  // single place connected institutions get excluded, so nothing already linked
  // can be re-queued from here.
  const allVisibleKeys = useMemo(
    () => filtered.flatMap((cat) => cat.items.map((i) => keyOf(cat.category, i.name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered],
  );
  const allVisibleSelected = allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected.has(k));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) allVisibleKeys.forEach((k) => next.delete(k));
      else allVisibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const toggleCategory = (category: string, keys: string[]) => {
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  // Dedupe selection down to unique institution names for linking.
  const selectedNames = useMemo(() => {
    const names = new Set<string>();
    selected.forEach((k) => names.add(k.slice(k.indexOf(":") + 1)));
    return [...names];
  }, [selected]);

  // Plaid's hits minus anything the user already has, and minus names the curated
  // grid is already showing, so one bank never appears as two rows.
  const plaidVisible = useMemo(() => {
    const shown = new Set(filtered.flatMap((cat) => cat.items.map((i) => normInstitutionName(i.name))));
    return plaidHits.filter(
      (h) => !isConnected(h.name) && !shown.has(normInstitutionName(h.name)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plaidHits, filtered, connected]);

  const connectSelected = () => {
    onConnect(selectedNames.map((name) => ({ name })));
    setSelected(new Set());
  };

  return (
    <div className="inst-pick">
      <div className="inst-searchbar">
        <Search size={15} />
        <input
          className="inst-search"
          value={query}
          placeholder="Search any bank, card, or investment provider"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search institutions"
        />
        <button className="inst-selall" onClick={toggleAllVisible} disabled={busy || allVisibleKeys.length === 0}>
          {allVisibleSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      {connectedFiltered.length > 0 && (
        // Outside `.inst-cats` on purpose. That element is a 44vh scroll box, so
        // anything inside it slides out of view once you are browsing the lower
        // categories, which is exactly when you want to check what already took.
        // Its own grid is capped at two rows so a long list of connections can
        // never crowd out the gallery it sits above.
        <div className="inst-cat inst-cat-pinned">
          <div className="inst-cat-row">
            <div className="inst-cat-h">Connected</div>
          </div>
          <div className="inst-grid inst-grid-capped">
            {connectedFiltered.map(({ inst, color }) => (
              <div
                key={`connected-${inst.name}`}
                className="inst-tile connected"
                aria-label={`${inst.name}, already connected`}
                title="Already connected"
              >
                <Mark inst={inst} color={color} />
                <span className="inst-name">{inst.name}</span>
                <span className="inst-connected-tag">
                  <Check size={11} strokeWidth={3} /> Connected
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outside `.inst-cats` and directly under the bar, for the same reason the
          Connected section is: this is the answer to what the person just typed,
          so it must not sit at the bottom of a 44vh scroller. A row here is a
          single tap that starts Link for that one bank, rather than a checkbox,
          because someone who typed an exact name is done choosing. */}
      {(searching || plaidVisible.length > 0) && (
        <div className="inst-cat inst-cat-pinned">
          <div className="inst-cat-row">
            <div className="inst-cat-h">From Plaid</div>
            {searching && (
              <span className="inst-searching">
                <Loader2 size={12} className="inst-spin" /> Searching
              </span>
            )}
          </div>
          {plaidVisible.length > 0 && (
            <div className="inst-plaid-list">
              {plaidVisible.map((hit) => (
                <button
                  key={hit.institution_id}
                  className="inst-plaid-row"
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
                  <span className="inst-mono" style={{ background: "var(--jnpr-c3)" }}>
                    {hit.name.charAt(0)}
                  </span>
                  <span className="inst-name">{hit.name}</span>
                  <ArrowRight size={14} className="inst-plaid-go" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="inst-cats">
        {filtered.map((cat) => {
          // `filtered` already dropped connected institutions into the Connected
          // section above, so every tile here is selectable.
          const keys = cat.items.map((i) => keyOf(cat.category, i.name));
          const catAllOn = keys.length > 0 && keys.every((k) => selected.has(k));
          return (
            <div className="inst-cat" key={cat.category}>
              <div className="inst-cat-row">
                <div className="inst-cat-h">{cat.category}</div>
                <button
                  className="inst-cat-all"
                  onClick={() => toggleCategory(cat.category, keys)}
                  disabled={busy || keys.length === 0}
                >
                  {catAllOn ? "Clear" : "All"}
                </button>
              </div>
              <div className="inst-grid">
                {cat.items.map((inst) => {
                  const on = selected.has(keyOf(cat.category, inst.name));
                  return (
                    <button
                      key={`${cat.category}-${inst.name}`}
                      className={`inst-tile ${on ? "on" : ""}`}
                      onClick={() => toggle(cat.category, inst.name)}
                      disabled={busy}
                      aria-pressed={on}
                      aria-label={inst.name}
                    >
                      <Mark inst={inst} color={cat.color} />
                      <span className="inst-name">{inst.name}</span>
                      <span className={`inst-check ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
                {/* Per-category escape hatch. The failure it fixes is a scanning
                    failure: someone looks for their bank, doesn't see it, and has
                    no idea what to do next. So the way out sits in the grid being
                    scanned, not only in the bar at the bottom of the page. Routes
                    to Plaid's own search (not the manual form) because most
                    "missing" banks are reachable, just not in the top-12 gallery. */}
                <button
                  className="inst-tile other"
                  onClick={() => onConnect([{}])}
                  disabled={busy}
                  aria-label={`My ${cat.category.toLowerCase()} provider isn't listed, search all of Plaid`}
                >
                  <span className="inst-other-ic">
                    <Search />
                  </span>
                  <span className="inst-name">Not listed</span>
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && connectedFiltered.length === 0 && (
          <div className="inst-empty">
            {searching ? (
              <>Looking for "{trimmed}" in Plaid.</>
            ) : plaidVisible.length > 0 ? (
              <>Nothing in the shortlist matches "{trimmed}". Plaid's matches are above.</>
            ) : q.length < 2 ? (
              <>Keep typing to search Plaid.</>
            ) : (
              <>
                No bank matching "{trimmed}", in the shortlist or in Plaid. Check the spelling, or enter it by hand
                below.
              </>
            )}
          </div>
        )}
      </div>

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
        <button className="btn" onClick={connectSelected} disabled={busy || selectedNames.length === 0}>
          {selectedNames.length > 0 ? `Connect ${selectedNames.length} selected` : "Connect"}
        </button>
      </div>
    </div>
  );
}
