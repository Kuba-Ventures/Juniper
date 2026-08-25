import { useMemo, useState } from "react";
import { Check, Plus, Search, PencilLine } from "lucide-react";
import { LOGOS } from "@/lib/mock-logos";
import { normInstitutionName, type LinkInstitution } from "@/lib/plaid";

// A searchable, sorted, multi-select institution gallery for the "connect an
// account" flow (account discovery, tier 2). Users can browse by category, type
// to filter, tick several institutions (or "Select all" a category), and connect
// them in one go, the caller links them sequentially via the Plaid Link queue.
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

  const q = query.trim().toLowerCase();

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
          placeholder="Search banks, cards, and investment providers"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search institutions"
        />
        <button className="inst-selall" onClick={toggleAllVisible} disabled={busy || allVisibleKeys.length === 0}>
          {allVisibleSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="inst-cats">
        {connectedFiltered.length > 0 && (
          <div className="inst-cat">
            <div className="inst-cat-row">
              <div className="inst-cat-h">Connected</div>
            </div>
            <div className="inst-grid">
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
            No matches for "{query.trim()}". Tap <b>Search all banks</b> below to find it in Plaid, or enter it by
            hand.
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
