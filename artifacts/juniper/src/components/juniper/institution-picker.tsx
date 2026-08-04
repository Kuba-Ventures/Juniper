import { Plus } from "lucide-react";
import { LOGOS } from "@/lib/mock-logos";

// A categorized institution picker for the "connect an account" flow. Each tile
// launches Plaid Link — Plaid handles the actual institution selection/search,
// so the popular tiles are quick entry points and the per-category "Other" tile
// opens Plaid's full search (covering small/regional banks like Carter Bank &
// Trust or Atlantic Union Bank). onPick receives the tapped institution name
// (empty string for "Other") purely for UI/telemetry; Link opens the same way.

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
      { name: "Ally", logo: "ally" },
      { name: "SoFi", logo: "sofi" },
    ],
  },
  {
    category: "Investing",
    color: "--jnpr-c5",
    items: [
      { name: "Fidelity", logo: "fidelity" },
      { name: "Vanguard", logo: "vanguard" },
      { name: "Charles Schwab" },
      { name: "Robinhood" },
      { name: "Betterment", logo: "betterment" },
      { name: "Wealthfront", logo: "wealthfront" },
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
    ],
  },
  {
    category: "Insurance",
    color: "--jnpr-c3",
    items: [
      { name: "Policygenius", logo: "policygenius" },
      { name: "Lemonade" },
      { name: "State Farm" },
      { name: "Geico" },
    ],
  },
];

function Mark({ inst, color }: { inst: Inst; color: string }) {
  if (inst.logo && LOGOS[inst.logo]) return <img className="inst-logo" src={LOGOS[inst.logo]} alt="" />;
  return <span className="inst-mono" style={{ background: `var(${color})` }}>{inst.name.charAt(0)}</span>;
}

export function InstitutionPicker({ onPick, busy }: { onPick: (name: string) => void; busy?: boolean }) {
  return (
    <div className="inst-cats">
      {CATALOG.map((cat) => (
        <div className="inst-cat" key={cat.category}>
          <div className="inst-cat-h">{cat.category}</div>
          <div className="inst-grid">
            {cat.items.map((inst, i) => (
              <button key={`${inst.name}-${i}`} className="inst-tile" onClick={() => onPick(inst.name)} disabled={busy}>
                <Mark inst={inst} color={cat.color} />
                <span className="inst-name">{inst.name}</span>
              </button>
            ))}
            <button className="inst-tile other" onClick={() => onPick("")} disabled={busy} title="Search for any bank or provider">
              <span className="inst-other-ic"><Plus /></span>
              <span className="inst-name">Other</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
