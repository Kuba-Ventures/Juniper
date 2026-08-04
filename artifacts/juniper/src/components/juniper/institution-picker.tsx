import { useMemo, useState } from "react";
import { Check, Plus, Search, PencilLine } from "lucide-react";
import { LOGOS } from "@/lib/mock-logos";
import type { LinkInstitution } from "@/lib/plaid";

// A searchable, sorted, multi-select institution gallery for the "connect an
// account" flow (account discovery, tier 2). Users can browse by category, type
// to filter, tick several institutions (or "Select all" a category), and connect
// them in one go, the caller links them sequentially via the Plaid Link queue.
// The per-category "Other" / global "Search all" path opens Plaid's full search
// for anything not in the gallery (small/regional banks like Carter Bank). The
// "Add manually" action hands off to the manual-entry form for accounts Plaid
// can't link at all.
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
      { name: "Bank of America" },
      { name: "Wells Fargo" },
      { name: "Capital One", logo: "capitalone" },
      { name: "Citibank" },
      { name: "US Bank" },
      { name: "PNC" },
      { name: "Ally", logo: "ally" },
      { name: "Marcus by Goldman Sachs" },
      { name: "SoFi", logo: "sofi" },
      { name: "Chime" },
      { name: "Truist" },
    ],
  },
  {
    category: "Investing & retirement",
    color: "--jnpr-c5",
    items: [
      { name: "Fidelity", logo: "fidelity" },
      { name: "Vanguard", logo: "vanguard" },
      { name: "Charles Schwab" },
      { name: "Robinhood" },
      { name: "Betterment", logo: "betterment" },
      { name: "Wealthfront", logo: "wealthfront" },
      { name: "E*TRADE" },
      { name: "Merrill" },
      { name: "Empower" },
      { name: "TIAA" },
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
      { name: "Discover" },
      { name: "Citi" },
      { name: "Bank of America" },
      { name: "Wells Fargo" },
    ],
  },
  {
    category: "Loans",
    color: "--jnpr-c2",
    items: [
      { name: "SoFi", logo: "sofi" },
      { name: "Earnest", logo: "earnest" },
      { name: "Sallie Mae" },
      { name: "Nelnet" },
      { name: "MOHELA" },
      { name: "Rocket Mortgage" },
    ],
  },
  {
    category: "Payment & cash",
    color: "--jnpr-c3",
    items: [
      { name: "PayPal" },
      { name: "Venmo" },
      { name: "Cash App" },
    ],
  },
];

// Sort items alphabetically within a category for a predictable, indexed browse.
const SORTED_CATALOG = CATALOG.map((c) => ({
  ...c,
  items: [...c.items].sort((a, b) => a.name.localeCompare(b.name)),
}));

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
}: {
  onConnect: (institutions: LinkInstitution[]) => void;
  onManual?: () => void;
  busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  // Selection keyed by "category:name" so the same brand in two categories stays
  // independent in the UI; we dedupe by name when connecting.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      SORTED_CATALOG.map((cat) => ({
        ...cat,
        items: q ? cat.items.filter((i) => i.name.toLowerCase().includes(q)) : cat.items,
      })).filter((cat) => cat.items.length > 0),
    [q],
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

  const allVisibleKeys = useMemo(
    () => filtered.flatMap((cat) => cat.items.map((i) => keyOf(cat.category, i.name))),
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
        {filtered.map((cat) => {
          const keys = cat.items.map((i) => keyOf(cat.category, i.name));
          const catAllOn = keys.every((k) => selected.has(k));
          return (
            <div className="inst-cat" key={cat.category}>
              <div className="inst-cat-row">
                <div className="inst-cat-h">{cat.category}</div>
                <button className="inst-cat-all" onClick={() => toggleCategory(cat.category, keys)} disabled={busy}>
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
                    >
                      <Mark inst={inst} color={cat.color} />
                      <span className="inst-name">{inst.name}</span>
                      <span className={`inst-check ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="inst-empty">
            No matches for "{query.trim()}". Tap <b>Search all institutions</b> below to find it in Plaid, or add it
            manually.
          </div>
        )}
      </div>

      <div className="inst-bar">
        <div className="inst-bar-left">
          <button className="inst-otherbtn" onClick={() => onConnect([{}])} disabled={busy}>
            <Plus size={15} /> Search all institutions
          </button>
          {onManual && (
            <button className="inst-otherbtn" onClick={onManual} disabled={busy}>
              <PencilLine size={15} /> Add manually
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
