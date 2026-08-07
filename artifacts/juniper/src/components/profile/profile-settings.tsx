import { useState } from "react";
import { X, LogOut, RotateCcw, Moon } from "lucide-react";
import { UserProfile, saveProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { Switch } from "@/components/ui/switch";

// Theme-aware surface palette. These resolve against the CSS variables in
// index.css (:root for light, .dark for dark), so every surface below flips
// with the dark-mode toggle instead of being pinned to a light hex.
const sage = "hsl(var(--primary))";
const cream = "hsl(var(--card))";
const ink = "hsl(var(--foreground))";
const muted = "hsl(var(--muted-foreground))";
const border = "hsl(var(--border))";
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
  { key: "totalDebt",       label: "Total debt",                hint: "All loans and credit card balances combined. Enter 0 if none." },
];

export type SettingsTab = "account" | "financial";

type Props = {
  initialData?: UserProfile;
  initialName?: string;
  email?: string;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSave: (profile: UserProfile, name: string) => void;
  onSignOut: () => void;
  // Testing-only: wipe plans + preferences to preview the new-user experience.
  onResetForTesting?: () => void | Promise<void>;
};

export function ProfileSettings({
  initialData,
  initialName = "",
  email,
  initialTab = "account",
  onClose,
  onSave,
  onSignOut,
  onResetForTesting,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preferredName, setPreferredName] = useState(initialName);
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
    onSave(profile, preferredName.trim() || initialName);
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
          padding: "28px 32px 0", flexShrink: 0,
        }}>
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: muted, margin: "0 0 4px" }}>
                Your account
              </p>
              <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 400, color: ink, margin: 0, letterSpacing: "-0.01em" }}>
                Profile settings
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

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 20 }}>
            {([
              { id: "account", label: "Account" },
              { id: "financial", label: "Financial snapshot" },
            ] as { id: SettingsTab; label: string }[]).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: sans, fontSize: 14, fontWeight: active ? 600 : 500,
                    color: active ? ink : muted, padding: "8px 4px",
                    marginRight: 16, position: "relative",
                    borderBottom: `2px solid ${active ? sage : "transparent"}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ height: 1, background: border, margin: "0 -32px" }} />
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "24px 32px", flex: 1 }}>
          {tab === "account" ? (
            <>
              {/* Preferred name */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink, marginBottom: 4 }}>
                  What should we call you?
                </label>
                <p style={{ fontSize: 12, color: muted, margin: "0 0 8px", lineHeight: 1.5 }}>Your first name or nickname</p>
                <input
                  type="text"
                  placeholder="e.g. Asta"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  style={{
                    width: "100%", height: 46, boxSizing: "border-box",
                    padding: "0 14px", border: `1.5px solid ${border}`,
                    borderRadius: 8, background: "hsl(var(--background))", fontFamily: sans,
                    fontSize: 16, color: ink, outline: "none", transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = sage)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = border)}
                />
              </div>

              {/* Email (read-only) */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink, marginBottom: 4 }}>
                  Email
                </label>
                <p style={{ fontSize: 12, color: muted, margin: "0 0 8px", lineHeight: 1.5 }}>The address you signed in with</p>
                <div
                  style={{
                    width: "100%", minHeight: 46, boxSizing: "border-box",
                    padding: "12px 14px", border: `1.5px solid ${border}`,
                    borderRadius: 8, background: "hsl(var(--muted))",
                    fontSize: 15, color: muted, display: "flex", alignItems: "center",
                    wordBreak: "break-all",
                  }}
                >
                  {email || "Not available"}
                </div>
              </div>

              {/* Appearance */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink, marginBottom: 4 }}>
                  Appearance
                </label>
                <p style={{ fontSize: 12, color: muted, margin: "0 0 10px", lineHeight: 1.5 }}>
                  Switch between the light and dark theme
                </p>
                <label
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", border: `1.5px solid ${border}`,
                    borderRadius: 8, background: "hsl(var(--background))", cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: "hsl(var(--primary) / 0.12)", color: sage,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Moon size={17} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: ink, margin: 0 }}>Dark mode</p>
                    <p style={{ fontSize: 12, color: muted, margin: "1px 0 0" }}>
                      {theme === "dark" ? "On" : "Off"}
                    </p>
                  </div>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={toggleTheme}
                    aria-label="Toggle dark mode"
                  />
                </label>
              </div>

              {/* Sign out */}
              <button
                onClick={onSignOut}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  height: 44, padding: "0 18px",
                  background: "none", border: `1.5px solid ${border}`,
                  borderRadius: 8, fontFamily: sans, fontSize: 14, fontWeight: 500,
                  color: "hsl(var(--destructive))", cursor: "pointer", transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "hsl(var(--destructive))")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
              >
                <LogOut size={16} />
                Sign out
              </button>

              {/* Testing-only: reset to the new-user experience */}
              {onResetForTesting && (
                <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px dashed ${border}` }}>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: muted, margin: "0 0 4px" }}>
                    For testing
                  </p>
                  <p style={{ fontSize: 12, color: muted, margin: "0 0 12px", lineHeight: 1.5 }}>
                    Delete all your plans and preferences so the app looks the way it does for a
                    brand-new user. This cannot be undone.
                  </p>
                  {!resetConfirm ? (
                    <button
                      onClick={() => setResetConfirm(true)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        height: 44, padding: "0 18px",
                        background: "none", border: `1.5px solid ${border}`,
                        borderRadius: 8, fontFamily: sans, fontSize: 14, fontWeight: 500,
                        color: "hsl(var(--destructive))", cursor: "pointer", transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "hsl(var(--destructive))")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
                    >
                      <RotateCcw size={16} />
                      Reset plans &amp; preferences
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <p style={{ fontSize: 13, color: ink, margin: 0, fontWeight: 600 }}>
                        Delete everything and start fresh?
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          disabled={resetting}
                          onClick={async () => {
                            setResetting(true);
                            try {
                              await onResetForTesting();
                            } catch {
                              setResetting(false);
                              setResetConfirm(false);
                            }
                          }}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 8,
                            height: 44, padding: "0 18px",
                            background: "hsl(var(--destructive))", border: "none",
                            borderRadius: 8, fontFamily: sans, fontSize: 14, fontWeight: 600,
                            color: "#fff", cursor: resetting ? "default" : "pointer",
                            opacity: resetting ? 0.7 : 1,
                          }}
                        >
                          <RotateCcw size={16} />
                          {resetting ? "Resetting…" : "Yes, reset everything"}
                        </button>
                        <button
                          disabled={resetting}
                          onClick={() => setResetConfirm(false)}
                          style={{
                            height: 44, padding: "0 18px",
                            background: "none", border: `1.5px solid ${border}`,
                            borderRadius: 8, fontFamily: sans, fontSize: 14, fontWeight: 500,
                            color: muted, cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: muted, margin: "0 0 20px", lineHeight: 1.55 }}>
                Optional. Juniper picks up anything you leave blank while you plan, so you can fill
                this in now or just answer in conversation later.
              </p>

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
                          background: "hsl(var(--background))", fontFamily: sans, fontSize: 16,
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
                          background: selected ? "hsl(var(--primary) / 0.14)" : "hsl(var(--background))",
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
            </>
          )}
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
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
