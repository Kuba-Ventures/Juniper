import { useState } from "react";
import { X } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/profile";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
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

const FIELDS: Array<{
  key: keyof Pick<UserProfile, "monthlyIncome" | "monthlyExpenses" | "totalSavings" | "totalDebt">;
  label: string;
  hint: string;
}> = [
  { key: "monthlyIncome",   label: "Monthly take-home pay",     hint: "After taxes and deductions" },
  { key: "monthlyExpenses", label: "Monthly essential expenses", hint: "Rent, utilities, subscriptions, groceries, minimum debt payments" },
  { key: "totalSavings",    label: "Total savings",             hint: "Checking, savings, and investments combined" },
  { key: "totalDebt",       label: "Total debt",                hint: "All loans and credit card balances combined — enter 0 if none" },
];

type Props = {
  initialData?: UserProfile;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
};

export function ProfileQuestionnaire({ initialData, onClose, onSave }: Props) {
  const [values, setValues] = useState<Partial<Record<keyof UserProfile, string>>>(() => ({
    monthlyIncome:   initialData?.monthlyIncome   !== undefined ? String(initialData.monthlyIncome)   : "",
    monthlyExpenses: initialData?.monthlyExpenses !== undefined ? String(initialData.monthlyExpenses) : "",
    totalSavings:    initialData?.totalSavings    !== undefined ? String(initialData.totalSavings)    : "",
    totalDebt:       initialData?.totalDebt       !== undefined ? String(initialData.totalDebt)       : "",
  }));
  const [goals, setGoals] = useState<string[]>(initialData?.goals ?? []);

  function parseNum(val: string): number | undefined {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? undefined : n;
  }

  function handleSave() {
    const profile: UserProfile = {
      monthlyIncome:   parseNum(values.monthlyIncome   as string),
      monthlyExpenses: parseNum(values.monthlyExpenses as string),
      totalSavings:    parseNum(values.totalSavings    as string),
      totalDebt:       parseNum(values.totalDebt       as string),
      goals: goals.length > 0 ? goals : undefined,
    };
    saveProfile(profile);
    onSave(profile);
  }

  function toggleGoal(goal: string) {
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(42,42,42,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: cream, borderRadius: 20, width: "100%", maxWidth: 500,
          maxHeight: "90dvh", display: "flex", flexDirection: "column",
          fontFamily: sans, boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "28px 32px 20px", borderBottom: `1px solid ${border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: muted, margin: "0 0 4px" }}>
              Your profile
            </p>
            <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 400, color: ink, margin: 0, letterSpacing: "-0.01em" }}>
              Financial snapshot
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: muted, display: "flex", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "24px 32px", flex: 1 }}>

          {/* Numeric fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink, marginBottom: 4 }}>
                  {label}
                </label>
                <p style={{ fontSize: 12, color: muted, margin: "0 0 8px", lineHeight: 1.5 }}>{hint}</p>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                    fontSize: 15, color: muted, pointerEvents: "none",
                  }}>$</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{
                      width: "100%", height: 46, boxSizing: "border-box",
                      paddingLeft: 28, paddingRight: 14,
                      border: `1.5px solid ${border}`, borderRadius: 8,
                      background: "#fff", fontFamily: sans, fontSize: 16,
                      color: ink, outline: "none", transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = sage)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = border)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Goals */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink, marginBottom: 4 }}>
              What are you working toward?
            </label>
            <p style={{ fontSize: 12, color: muted, margin: "0 0 12px", lineHeight: 1.5 }}>
              Select everything that applies.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {GOALS.map((goal) => {
                const selected = goals.includes(goal);
                return (
                  <button
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    style={{
                      padding: "8px 14px", borderRadius: 100,
                      border: `1.5px solid ${selected ? sage : border}`,
                      background: selected ? "rgba(92,122,101,0.1)" : "#fff",
                      color: selected ? sage : ink, fontSize: 13,
                      fontFamily: sans, fontWeight: selected ? 500 : 400,
                      cursor: "pointer", transition: "all 0.12s",
                    }}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 32px 24px", borderTop: `1px solid ${border}`,
          display: "flex", gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              height: 46, paddingLeft: 20, paddingRight: 20,
              background: "none", border: `1.5px solid ${border}`,
              borderRadius: 8, fontFamily: sans, fontSize: 14, color: muted,
              cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = sage)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1, height: 46, background: sage, color: "#fff",
              border: "none", borderRadius: 8, fontFamily: sans,
              fontSize: 15, fontWeight: 500, cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Save profile
          </button>
        </div>
      </div>
    </div>
  );
}
