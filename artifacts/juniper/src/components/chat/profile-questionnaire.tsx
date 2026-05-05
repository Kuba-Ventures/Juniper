import { useState } from "react";
import { X, ArrowLeft } from "lucide-react";
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

type Step = "income" | "expenses" | "savings" | "debt" | "goals";
const STEPS: Step[] = ["income", "expenses", "savings", "debt", "goals"];

const STEP_CONFIG: Record<
  Exclude<Step, "done">,
  { question: string; sub: string; field: keyof UserProfile; isGoals?: boolean; prefix?: string }
> = {
  income: {
    question: "What's your monthly take-home pay?",
    sub: "The amount that actually lands in your account after taxes and deductions.",
    field: "monthlyIncome",
    prefix: "$",
  },
  expenses: {
    question: "What are your monthly essential expenses?",
    sub: "Rent or mortgage, utilities, subscriptions, groceries, and minimum debt payments.",
    field: "monthlyExpenses",
    prefix: "$",
  },
  savings: {
    question: "How much do you have saved?",
    sub: "Checking, savings accounts, and any investments combined.",
    field: "totalSavings",
    prefix: "$",
  },
  debt: {
    question: "What's your total debt?",
    sub: "All loans and credit card balances combined. Enter 0 if you have none.",
    field: "totalDebt",
    prefix: "$",
  },
  goals: {
    question: "What are you working toward?",
    sub: "Pick everything that applies. This helps Juniper focus on what matters to you.",
    field: "goals",
    isGoals: true,
  },
};

type Props = {
  initialData?: UserProfile;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
};

export function ProfileQuestionnaire({ initialData, onClose, onSave }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<UserProfile>(initialData ?? {});
  const [inputValue, setInputValue] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    initialData?.goals ?? [],
  );

  const step = STEPS[stepIndex];
  const config = STEP_CONFIG[step];
  const isLast = stepIndex === STEPS.length - 1;
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  function parseAmount(val: string): number | null {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  function handleNext() {
    if (config.isGoals) {
      const updated = { ...data, goals: selectedGoals };
      setData(updated);
      saveProfile(updated);
      onSave(updated);
      return;
    }
    const num = parseAmount(inputValue);
    const updated = num !== null ? { ...data, [config.field]: num } : data;
    setData(updated);
    if (isLast) {
      saveProfile(updated);
      onSave(updated);
    } else {
      const nextStep = STEPS[stepIndex + 1];
      const nextField = STEP_CONFIG[nextStep].field as keyof UserProfile;
      const existing = updated[nextField];
      setInputValue(
        existing !== undefined && !STEP_CONFIG[nextStep].isGoals
          ? String(existing)
          : "",
      );
      setStepIndex(stepIndex + 1);
    }
  }

  function handleBack() {
    if (stepIndex === 0) { onClose(); return; }
    const prevStep = STEPS[stepIndex - 1];
    const prevField = STEP_CONFIG[prevStep].field as keyof UserProfile;
    const existing = data[prevField];
    setInputValue(existing !== undefined ? String(existing) : "");
    setStepIndex(stepIndex - 1);
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  }

  const canContinue = config.isGoals
    ? selectedGoals.length > 0
    : inputValue.trim() !== "";

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
          background: cream, borderRadius: 20, width: "100%", maxWidth: 520,
          padding: "40px 44px 44px", position: "relative", fontFamily: sans,
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 20, right: 20, background: "none",
            border: "none", cursor: "pointer", color: muted, display: "flex",
          }}
        >
          <X size={18} />
        </button>

        {/* Progress bar */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: muted, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Your profile
            </span>
            <span style={{ fontSize: 11, color: muted }}>{stepIndex + 1} of {STEPS.length}</span>
          </div>
          <div style={{ height: 3, background: border, borderRadius: 2 }}>
            <div
              style={{
                height: "100%", background: sage, borderRadius: 2,
                width: `${progress}%`, transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Question */}
        <h2 style={{
          fontFamily: serif, fontSize: 24, fontWeight: 400, color: ink,
          margin: "0 0 10px", lineHeight: 1.3, letterSpacing: "-0.02em",
        }}>
          {config.question}
        </h2>
        <p style={{ fontSize: 14, color: muted, margin: "0 0 32px", lineHeight: 1.6 }}>
          {config.sub}
        </p>

        {/* Input */}
        {config.isGoals ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 36 }}>
            {GOALS.map((goal) => {
              const selected = selectedGoals.includes(goal);
              return (
                <button
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                  style={{
                    padding: "9px 16px", borderRadius: 100,
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
        ) : (
          <div style={{ position: "relative", marginBottom: 36 }}>
            {config.prefix && (
              <span style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                fontSize: 18, color: muted, fontFamily: sans, pointerEvents: "none",
              }}>
                {config.prefix}
              </span>
            )}
            <input
              type="number"
              min="0"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canContinue) handleNext(); }}
              autoFocus
              placeholder="0"
              style={{
                width: "100%", height: 56, boxSizing: "border-box",
                paddingLeft: config.prefix ? 32 : 16, paddingRight: 16,
                border: `1.5px solid ${border}`, borderRadius: 10,
                background: "#fff", fontFamily: sans, fontSize: 20,
                color: ink, outline: "none", transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = sage)}
              onBlur={(e) => (e.currentTarget.style.borderColor = border)}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleBack}
            style={{
              height: 48, paddingLeft: 16, paddingRight: 16,
              background: "none", border: `1.5px solid ${border}`,
              borderRadius: 10, cursor: "pointer", display: "flex",
              alignItems: "center", gap: 6, color: muted, fontSize: 14,
              fontFamily: sans, transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = sage)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
          >
            <ArrowLeft size={15} />
          </button>

          <button
            onClick={handleNext}
            disabled={!canContinue}
            style={{
              flex: 1, height: 48, background: canContinue ? sage : "rgba(92,122,101,0.3)",
              color: "#fff", border: "none", borderRadius: 10,
              fontFamily: sans, fontSize: 15, fontWeight: 500,
              cursor: canContinue ? "pointer" : "default",
              transition: "background 0.15s",
            }}
          >
            {isLast ? "Save profile" : "Continue"}
          </button>

          <button
            onClick={() => {
              if (isLast) { saveProfile(data); onSave(data); }
              else {
                const nextStep = STEPS[stepIndex + 1];
                const existing = data[STEP_CONFIG[nextStep].field as keyof UserProfile];
                setInputValue(existing !== undefined ? String(existing) : "");
                setStepIndex(stepIndex + 1);
              }
            }}
            style={{
              height: 48, paddingLeft: 14, paddingRight: 14,
              background: "none", border: "none",
              color: muted, fontSize: 13, fontFamily: sans,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
