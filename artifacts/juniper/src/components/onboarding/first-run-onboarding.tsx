import { useCallback, useState } from "react";
import { ArrowRight, ArrowLeft, Check, Plus, ShieldCheck, Building2 } from "lucide-react";
import type { UserProfile } from "@/lib/profile";
import { syncFinances, layerEnabled } from "@/lib/plaid";
import { useLinkQueue } from "@/lib/use-link-queue";
import { InstitutionPicker } from "@/components/juniper/institution-picker";
import { ManualAccountForm } from "@/components/juniper/manual-account-form";
import { LayerDiscovery } from "@/components/juniper/layer-discovery";
import "@/styles/juniper.css";

const GOALS = [
  "Buy a home",
  "Pay off debt",
  "Build an emergency fund",
  "Save for a family",
  "Invest for retirement",
  "Increase my income",
  "Plan a big purchase",
];

type StepKind = "welcome" | "income" | "connect" | "goals";
const STEPS: StepKind[] = ["welcome", "income", "connect", "goals"];

const fmtMoney = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function FirstRunOnboarding({
  email: _email,
  initialName,
  onComplete,
}: {
  email: string;
  initialName: string;
  onComplete: (profile: UserProfile, name: string) => void;
}) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [household, setHousehold] = useState<"solo" | "partner" | undefined>();
  const [income, setIncome] = useState<number | undefined>();
  const [expenses, setExpenses] = useState<number | undefined>();
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState("");
  const [linked, setLinked] = useState(false);

  const addCustomGoal = () => {
    const g = customGoal.trim();
    if (!g) return;
    const exists = [...GOALS, ...customGoals].some((x) => x.toLowerCase() === g.toLowerCase());
    if (!exists) setCustomGoals((prev) => [...prev, g]);
    setGoals((prev) => (prev.some((x) => x.toLowerCase() === g.toLowerCase()) ? prev : [...prev, g]));
    setCustomGoal("");
  };

  const step = STEPS[i];
  const total = STEPS.length;

  // Accounts + balances now come from linking a bank (Plaid), so onboarding only
  // captures the snapshot (income/expenses), goals, and household. Net worth and
  // the score fill in from live data once an account is connected.
  const buildProfile = useCallback((): UserProfile => ({
    monthlyIncome: income,
    monthlyExpenses: expenses,
    goals: goals.length ? goals : undefined,
    household,
  }), [income, expenses, goals, household]);

  const finish = useCallback(() => {
    setDone(true);
    const profile = buildProfile();
    const finalName = name.trim() || initialName;
    // Brief "you're all set" beat, then hand off to the dashboard.
    setTimeout(() => onComplete(profile, finalName), 900);
  }, [buildProfile, name, initialName, onComplete]);

  const next = () => (i + 1 >= total ? finish() : setI(i + 1));
  const back = () => i > 0 && setI(i - 1);

  return (
    <div className="jnpr onboard">
      <div className="ob-top">
        <div className="brand">
          <img src="/logo.png" alt="Juniper" />
          Juniper
        </div>
        {!done && (
          <button className="ob-skip" onClick={finish}>
            Skip for now
          </button>
        )}
      </div>

      <div className="ob-body">
        {done ? (
          <div className="ob-done">
            <div className="ob-check">
              <Check strokeWidth={2.5} />
            </div>
            <h2>You're all set{name.trim() ? `, ${name.trim()}` : ""}.</h2>
            <p className="ob-help">Building your dashboard from what you shared…</p>
          </div>
        ) : (
          <>
            <div className="ob-prog">
              <div className="pr-lbl">
                <span className="l">Getting set up</span>
                <span className="r">
                  {total - i} {total - i === 1 ? "step" : "steps"} left
                </span>
              </div>
              <div className="track">
                <i style={{ width: `${(i / total) * 100}%` }} />
              </div>
            </div>

            {step === "welcome" && (
              <>
                <h2>Welcome to Juniper. What should we call you?</h2>
                <p className="ob-help">Your first name or a nickname, we'll use it around the app.</p>
                <input
                  className="ob-input"
                  autoFocus
                  value={name}
                  placeholder={initialName || "e.g. Asta"}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                />
                <div style={{ marginTop: 22 }}>
                  <p className="ob-help" style={{ margin: "0 0 10px" }}>Who are you planning for?</p>
                  <div className="ob-seg">
                    <button className={household === "solo" ? "on" : undefined} onClick={() => setHousehold("solo")}>
                      Just me<small>Solo, you can invite a partner later</small>
                    </button>
                    <button className={household === "partner" ? "on" : undefined} onClick={() => setHousehold("partner")}>
                      Me & my partner<small>Plan and align together</small>
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === "income" && (
              <>
                <h2>Let's get a quick money snapshot.</h2>
                <p className="ob-help">Rough numbers are fine, you can refine them anytime, and they power your Juniper Score.</p>
                <div className="ob-fieldgroup">
                  <MoneyField label="Monthly take-home pay" hint="After taxes and deductions" value={income} chips={[4000, 7000, 12000]} onChange={setIncome} autoFocus />
                  <MoneyField label="Monthly essential expenses" hint="Rent, utilities, groceries, minimum payments" value={expenses} chips={[2500, 4000, 6000]} onChange={setExpenses} />
                </div>
              </>
            )}

            {step === "goals" && (
              <>
                <h2>What are you working toward?</h2>
                <p className="ob-help">Pick everything that applies, or add your own. We'll shape your plans and recommendations around these.</p>
                <div className="ob-chips">
                  {[...GOALS, ...customGoals].map((g) => {
                    const on = goals.includes(g);
                    return (
                      <button
                        key={g}
                        className={`ob-chip ${on ? "on" : ""}`}
                        onClick={() => setGoals((prev) => (on ? prev.filter((x) => x !== g) : [...prev, g]))}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                <div className="ob-other">
                  <input
                    value={customGoal}
                    placeholder="Other: add your own goal"
                    onChange={(e) => setCustomGoal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomGoal();
                      }
                    }}
                    aria-label="Add a custom goal"
                  />
                  <button className="btn ghost" onClick={addCustomGoal} disabled={!customGoal.trim()}>
                    <Plus /> Add
                  </button>
                </div>
              </>
            )}

            {step === "connect" && (
              <ConnectStep linked={linked} onLinked={() => setLinked(true)} />
            )}

            <div className="ob-nav">
              {i > 0 && (
                <button className="ob-back" onClick={back}>
                  <ArrowLeft /> Back
                </button>
              )}
              <button className="btn" onClick={next}>
                {i + 1 >= total ? "Finish" : "Continue"} <ArrowRight />
              </button>
              {(step === "income" || step === "goals") && (
                <button className="ob-ghostskip" onClick={next}>
                  Skip
                </button>
              )}
              {step === "connect" && !linked && (
                <button className="ob-ghostskip" onClick={next}>
                  I'll do this later
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MoneyField({
  label,
  hint,
  value,
  chips,
  onChange,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  chips: number[];
  onChange: (v: number | undefined) => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const display = value != null ? Number(value).toLocaleString("en-US") : "";
  return (
    <div>
      <p className="ob-help" style={{ margin: "0 0 4px", fontWeight: 650, color: "var(--jnpr-ink-2)" }}>{label}</p>
      {hint && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--jnpr-ink-3)" }}>{hint}</p>}
      <div className={`ob-money ${focused ? "on" : ""}`}>
        <span>$</span>
        <input
          inputMode="numeric"
          autoFocus={autoFocus}
          value={display}
          placeholder="0"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            onChange(digits === "" ? undefined : parseInt(digits, 10));
          }}
          style={{ width: `${Math.max(4, display.length + 1)}ch` }}
          aria-label={label}
        />
      </div>
      <div className="ob-chips">
        {chips.map((c) => (
          <button key={c} className={`ob-chip ${value === c ? "on" : ""}`} onClick={() => onChange(c)}>
            {fmtMoney(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectStep({ linked, onLinked }: { linked: boolean; onLinked: () => void }) {
  const [manual, setManual] = useState(false);

  const { start, busy, progress, notice, setNotice } = useLinkQueue({
    onItemLinked: onLinked,
    onDone: ({ linked: count }) => {
      if (count > 0) void syncFinances();
    },
  });

  const connect = useCallback(
    (institutions: Parameters<typeof start>[0]) => {
      setNotice(null);
      void start(institutions);
    },
    [start, setNotice],
  );

  return (
    <>
      <h2>Connect your accounts for live balances.</h2>
      <p className="ob-help">
        Optional, but it's the magic: pick every bank, card, or investment provider you use, then connect them
        in one pass and Juniper keeps your net worth, spending, and score up to date automatically. Don't see
        yours? Use <b>Search all institutions</b>, or <b>Add manually</b> for anything Plaid can't reach. You can
        always do this later.
      </p>

      {linked && (
        <div className="ob-connected">
          <Check size={18} strokeWidth={2.5} /> Account added. Pick more below, or continue.
        </div>
      )}
      {notice && <div className="form-error" style={{ marginBottom: 12 }}>{notice}</div>}
      {busy && (
        <div className="ob-connected" style={{ color: "var(--jnpr-accent)", background: "var(--jnpr-accent-soft)" }}>
          <Building2 size={16} />{" "}
          {progress.total > 1
            ? `Connecting account ${progress.index + 1} of ${progress.total}…`
            : "Opening secure link…"}
        </div>
      )}

      {layerEnabled() && !manual && <LayerDiscovery onLinked={onLinked} />}

      {manual ? (
        <ManualAccountForm
          onSaved={() => {
            setManual(false);
            onLinked();
          }}
          onCancel={() => setManual(false)}
        />
      ) : (
        <InstitutionPicker onConnect={connect} onManual={() => setManual(true)} busy={busy} />
      )}

      <p className="ob-secure">
        <ShieldCheck />
        Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank credentials
        are entered with Plaid and never touch Juniper's servers.
      </p>
    </>
  );
}
