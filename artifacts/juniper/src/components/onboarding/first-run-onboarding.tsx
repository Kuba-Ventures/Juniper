import { useState } from "react";
import type React from "react";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import type { UserProfile } from "@/lib/profile";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageFill = "rgba(92,122,101,0.08)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const GOALS = [
  "Buy a home",
  "Pay off debt",
  "Build an emergency fund",
  "Save for a family",
  "Invest for retirement",
  "Increase my income",
  "Plan a big purchase",
];

// Common money accounts/tools for the lightweight "accounts I use" step,
// grouped by type. Stored on the profile (local) to personalize
// recommendations. No data is linked.
const CONNECTION_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Banks & savings",
    items: ["Chase", "Bank of America", "Wells Fargo", "Citi", "Capital One", "Ally", "SoFi", "Marcus", "Discover"],
  },
  {
    label: "Investing",
    items: ["Fidelity", "Vanguard", "Schwab", "Robinhood", "E*Trade", "Betterment"],
  },
  {
    label: "Credit cards",
    items: ["Amex", "Chase Sapphire", "Apple Card", "Venmo / PayPal"],
  },
  {
    label: "Budgeting & tools",
    items: ["Monarch", "Mint", "YNAB", "Rocket Money", "Empower", "Credit Karma"],
  },
];

type MoneyKey = "monthlyIncome" | "monthlyExpenses" | "totalSavings" | "totalDebt";
type MultiGroup = { label: string; items: string[] };
type Step =
  | { kind: "name" }
  | { kind: "money"; key: MoneyKey; question: string; helper?: string; chips: number[] }
  | {
      kind: "multi";
      key: "goals" | "connections";
      question: string;
      helper?: string;
      options?: string[]; // flat list (goals)
      groups?: MultiGroup[]; // grouped by type (connections)
    };

const STEPS: Step[] = [
  { kind: "name" },
  { kind: "money", key: "monthlyIncome", question: "Your monthly take-home pay?", helper: "After taxes and deductions.", chips: [4000, 7000, 12000] },
  { kind: "money", key: "monthlyExpenses", question: "Monthly essential expenses?", helper: "Rent, utilities, groceries, minimum debt payments.", chips: [2500, 4000, 6000] },
  { kind: "money", key: "totalSavings", question: "Total savings?", helper: "Checking, savings, and investments combined.", chips: [10000, 50000, 100000] },
  { kind: "money", key: "totalDebt", question: "Total debt?", helper: "All loans and card balances. Enter 0 if none.", chips: [0, 15000, 40000] },
  { kind: "multi", key: "goals", question: "What are you working toward?", helper: "Pick everything that applies.", options: GOALS },
  { kind: "multi", key: "connections", question: "Which of these do you already use?", helper: "We'll tailor recommendations and skip suggesting what you already have.", groups: CONNECTION_GROUPS },
];

const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
};

export function FirstRunOnboarding({
  email,
  initialName,
  onComplete,
}: {
  email: string;
  initialName: string;
  onComplete: (profile: UserProfile, name: string) => void;
}) {
  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [money, setMoney] = useState<Partial<Record<MoneyKey, number>>>({});
  const [multi, setMulti] = useState<{ goals: string[]; connections: string[] }>({ goals: [], connections: [] });
  const [done, setDone] = useState(false);

  const step = STEPS[i];
  const total = STEPS.length;
  const left = total - i;

  function finish() {
    const profile: UserProfile = {
      monthlyIncome: money.monthlyIncome,
      monthlyExpenses: money.monthlyExpenses,
      totalSavings: money.totalSavings,
      totalDebt: money.totalDebt,
      goals: multi.goals.length ? multi.goals : undefined,
      connections: multi.connections.length ? multi.connections : undefined,
    };
    setDone(true);
    onComplete(profile, name.trim() || initialName);
  }

  function next() {
    if (i + 1 >= total) finish();
    else setI(i + 1);
  }
  function back() {
    if (i > 0) setI(i - 1);
  }

  return (
    <div style={{ minHeight: "100dvh", background: cream, fontFamily: sans, display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px clamp(16px, 5vw, 40px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="Juniper" style={{ width: 24, height: 24, objectFit: "contain" }} />
          <span style={{ fontFamily: serif, fontSize: 17, color: sage, fontWeight: 500 }}>Juniper</span>
        </div>
        {!done && (
          <button
            onClick={finish}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13, color: muted }}
          >
            Skip for now
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 clamp(16px, 5vw, 40px)", maxWidth: 560, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {done ? (
          <div>
            <div style={{ width: 48, height: 48, borderRadius: 999, background: sage, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Check size={24} color="#fff" strokeWidth={2.5} />
            </div>
            <h2 style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, color: ink, margin: "0 0 10px", lineHeight: 1.15 }}>
              You're all set{name.trim() ? `, ${name.trim()}` : ""}.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: muted, lineHeight: 1.6, margin: 0, maxWidth: 400 }}>
              Your plans will use this so you won't have to re-enter it. Opening your dashboard now.
            </p>
          </div>
        ) : (
          <>
            {/* progress */}
            <div style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, fontWeight: 600 }}>
                  Getting set up
                </span>
                <span style={{ fontFamily: sans, fontSize: 12, color: sage, fontWeight: 600 }}>
                  {left} {left === 1 ? "step" : "steps"} left
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 999, background: sageFill, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(i / total) * 100}%`, background: sage, borderRadius: 999, transition: "width 0.4s ease" }} />
              </div>
            </div>

            <h2 style={{ fontFamily: serif, fontSize: "clamp(24px, 4vw, 30px)", fontWeight: 400, color: ink, lineHeight: 1.15, margin: step.kind === "name" ? "0 0 6px" : "0 0 8px" }}>
              {step.kind === "name" ? "What should we call you?" : step.question}
            </h2>
            {step.kind === "name" ? (
              <p style={{ fontFamily: sans, fontSize: 14, color: muted, margin: "0 0 22px" }}>Your first name or a nickname.</p>
            ) : (
              step.helper && <p style={{ fontFamily: sans, fontSize: 14, color: muted, margin: "0 0 22px", maxWidth: 440 }}>{step.helper}</p>
            )}

            {step.kind === "name" && (
              <input
                type="text"
                value={name}
                autoFocus
                placeholder={initialName || "e.g. Asta"}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                style={{
                  width: "100%", boxSizing: "border-box", height: 52, padding: "0 16px",
                  border: `1.5px solid ${border}`, borderRadius: 10, background: "#fff",
                  fontFamily: sans, fontSize: 17, color: ink, outline: "none",
                }}
              />
            )}

            {step.kind === "money" && (
              <MoneyStep
                key={step.key}
                value={money[step.key]}
                chips={step.chips}
                onChange={(v) => setMoney((m) => ({ ...m, [step.key]: v }))}
              />
            )}

            {step.kind === "multi" && (() => {
              const key = step.key;
              const toggle = (opt: string) =>
                setMulti((m) => ({
                  ...m,
                  [key]: m[key].includes(opt) ? m[key].filter((x) => x !== opt) : [...m[key], opt],
                }));
              const chip = (opt: string) => {
                const selected = multi[key].includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    style={{
                      borderRadius: 999, padding: "9px 15px", cursor: "pointer",
                      fontFamily: sans, fontSize: 14, fontWeight: 500,
                      color: selected ? "#fff" : ink,
                      background: selected ? sage : sageFill,
                      border: `1px solid ${selected ? sage : border}`,
                    }}
                  >
                    {opt}
                  </button>
                );
              };
              // Grouped (connections) vs flat (goals).
              if (step.groups) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18, maxHeight: "48vh", overflowY: "auto" }}>
                    {step.groups.map((g) => (
                      <div key={g.label}>
                        <p style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted, fontWeight: 600, margin: "0 0 8px" }}>
                          {g.label}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{g.items.map(chip)}</div>
                      </div>
                    ))}
                  </div>
                );
              }
              return <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{(step.options ?? []).map(chip)}</div>;
            })()}

            {/* nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 36 }}>
              {i > 0 && (
                <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 500, color: muted, padding: "10px 4px" }}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <button
                onClick={next}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "12px 24px", cursor: "pointer", fontFamily: sans, fontSize: 15, fontWeight: 600, color: "#fff", background: sage, border: "none" }}
              >
                {i + 1 >= total ? "Finish" : "Continue"} <ArrowRight size={17} />
              </button>
              {step.kind !== "name" && (
                <button onClick={next} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13, color: muted }}>
                  Skip
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MoneyStep({
  value,
  chips,
  onChange,
}: {
  value: number | undefined;
  chips: number[];
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [editing, setEditing] = useState(false);
  const display = editing ? (text === "" ? "" : Number(text).toLocaleString("en-US")) : value != null ? Number(value).toLocaleString("en-US") : "";

  const set = (v: number | undefined) => {
    onChange(v);
    setText(v != null ? String(v) : "");
  };

  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "baseline", borderBottom: `2px solid ${editing ? sage : border}`, paddingBottom: 4 }}>
        <span style={{ fontFamily: serif, fontSize: 40, fontWeight: 500, color: ink, lineHeight: 1 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          placeholder="0"
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            setText(digits);
            onChange(digits === "" ? undefined : parseInt(digits, 10));
          }}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          aria-label="Amount"
          style={{ fontFamily: serif, fontSize: 40, fontWeight: 500, color: ink, lineHeight: 1, background: "transparent", border: "none", outline: "none", width: `${Math.max(3, display.length + 1)}ch` }}
        />
      </div>
      <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => set(c)}
            style={{
              borderRadius: 999, padding: "8px 16px", cursor: "pointer",
              fontFamily: sans, fontSize: 14, fontWeight: 500,
              color: value === c ? "#fff" : ink,
              background: value === c ? sage : sageFill,
              border: `1px solid ${value === c ? sage : border}`,
            }}
          >
            {fmtMoney(c)}
          </button>
        ))}
      </div>
    </div>
  );
}
