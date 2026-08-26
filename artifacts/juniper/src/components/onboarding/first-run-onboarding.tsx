import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, Check, Plus, ShieldCheck, Building2 } from "lucide-react";
import type { UserProfile } from "@/lib/profile";
import { syncFinancesUntilTransactions, layerEnabled, pollCashflowEstimate, normInstitutionName } from "@/lib/plaid";
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

// Order matters. We lead with goals (low-friction, sets motivation), then ask to
// connect accounts, then capture the money snapshot last — so once a member has
// linked, income/spending can be pre-filled from their live data and the snapshot
// becomes a quick confirm instead of typing from scratch. No SSN is collected
// here: KYC-grade identity is gathered just-in-time when a flow actually needs it.
type StepKind = "welcome" | "goals" | "connect" | "income";
const STEPS: StepKind[] = ["welcome", "goals", "connect", "income"];

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
              <IncomeStep
                linked={linked}
                income={income}
                expenses={expenses}
                setIncome={setIncome}
                setExpenses={setExpenses}
              />
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
              {step === "goals" && (
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

// The money snapshot, shown last so it can lean on a live connection. When the
// member linked an account, we try to pull their real monthly income/spending
// and pre-fill the fields, turning "type it in" into "confirm what we found".
// Falls back to plain manual entry when nothing is linked (or the sync hasn't
// landed yet). Only empty, un-edited fields are pre-filled, so a member who
// starts typing is never overwritten by a late-arriving estimate.
function IncomeStep({
  linked,
  income,
  expenses,
  setIncome,
  setExpenses,
}: {
  linked: boolean;
  income: number | undefined;
  expenses: number | undefined;
  setIncome: (v: number | undefined) => void;
  setExpenses: (v: number | undefined) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "estimated" | "none">(
    linked ? "loading" : "idle",
  );
  // Per-field so editing one field doesn't block a late estimate for the other.
  const touchedIncome = useRef(false);
  const touchedExpenses = useRef(false);

  useEffect(() => {
    if (!linked) return;
    const cancel = { aborted: false };
    // Poll for a few seconds: the sync fired at link time is async, so the
    // estimate usually isn't ready on the first read.
    pollCashflowEstimate({ signal: cancel })
      .then((est) => {
        if (cancel.aborted) return;
        if (est) {
          if (!touchedIncome.current && income == null && est.income > 0) setIncome(est.income);
          if (!touchedExpenses.current && expenses == null && est.spent > 0) setExpenses(est.spent);
          setStatus("estimated");
        } else {
          setStatus("none");
        }
      })
      .catch(() => {
        if (!cancel.aborted) setStatus("none");
      });
    return () => {
      cancel.aborted = true;
    };
    // Runs once when the step mounts; `linked` is stable by the time we're here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  const onIncome = (v: number | undefined) => {
    touchedIncome.current = true;
    setIncome(v);
  };
  const onExpenses = (v: number | undefined) => {
    touchedExpenses.current = true;
    setExpenses(v);
  };

  const estimated = status === "estimated";

  return (
    <>
      <h2>{estimated ? "Here's your monthly snapshot." : "Let's get a quick money snapshot."}</h2>
      <p className="ob-help">
        {estimated
          ? "We estimated these from your connected accounts. Adjust anything that looks off, they power your Juniper Score."
          : linked
            ? "Rough numbers are fine, you can refine them anytime, and they power your Juniper Score."
            : "Rough numbers are fine, you can refine them anytime. You skipped connecting, so these are what power your Juniper Score for now."}
      </p>
      {status === "loading" && (
        <div className="ob-connected" style={{ color: "var(--jnpr-accent)", background: "var(--jnpr-accent-soft)" }}>
          <Building2 size={16} /> Estimating from your connected accounts…
        </div>
      )}
      <div className="ob-fieldgroup">
        <MoneyField
          label="Monthly take-home pay"
          hint={estimated ? "Estimated from recent deposits" : "After taxes and deductions"}
          value={income}
          chips={[4000, 7000, 12000]}
          onChange={onIncome}
          autoFocus
        />
        <MoneyField
          label="Monthly essential expenses"
          hint={estimated ? "Estimated from recent spending" : "Rent, utilities, groceries, minimum payments"}
          value={expenses}
          chips={[2500, 4000, 6000]}
          onChange={onExpenses}
        />
      </div>
    </>
  );
}

function ConnectStep({ linked, onLinked }: { linked: boolean; onLinked: () => void }) {
  const [manual, setManual] = useState(false);
  // Institutions connected this session (via instant discovery, the gallery link
  // queue, or manual add), normalized for matching. Passed to the gallery so
  // those tiles read as already-connected instead of still-to-do — otherwise a
  // member who imported, say, Marcus via the phone-first flow sees Marcus sitting
  // unchecked below and assumes it didn't take.
  const [connected, setConnected] = useState<Map<string, string>>(new Map());

  const markConnected = useCallback(
    (institutions?: string[]) => {
      if (institutions?.length) {
        setConnected((prev) => {
          const next = new Map(prev);
          for (const n of institutions) if (n) next.set(normInstitutionName(n), n);
          return next;
        });
      }
      onLinked();
    },
    [onLinked],
  );

  const { start, busy, progress, notice, setNotice } = useLinkQueue({
    onItemLinked: (institution) => markConnected(institution ? [institution] : undefined),
    onDone: ({ linked: count }) => {
      // Bounded background retry, not a single shot: the first pull is usually
      // not ready yet, and the very next step of onboarding polls the same data
      // to pre-fill the member's income and spending.
      if (count > 0) void syncFinancesUntilTransactions();
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
        yours? Tap <b>Not listed</b> in any section to search every bank Plaid supports, or <b>enter it by hand</b>{" "}
        for anything Plaid can't reach. You can always do this later.
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

      {layerEnabled() && !manual && <LayerDiscovery onLinked={markConnected} />}

      {manual ? (
        <ManualAccountForm
          onSaved={() => {
            setManual(false);
            onLinked();
          }}
          onCancel={() => setManual(false)}
        />
      ) : (
        <InstitutionPicker onConnect={connect} onManual={() => setManual(true)} busy={busy} connected={connected} />
      )}

      <p className="ob-secure">
        <ShieldCheck />
        Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank credentials
        are entered with Plaid and never touch Juniper's servers.
      </p>
    </>
  );
}
