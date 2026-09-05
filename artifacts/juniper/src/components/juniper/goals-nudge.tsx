import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { UserProfile } from "@/lib/profile";

const GOALS = [
  "Buy a home",
  "Pay off debt",
  "Build an emergency fund",
  "Save for a family",
  "Invest for retirement",
  "Increase my income",
  "Plan a big purchase",
];

function dismissKey(email: string): string {
  return `juniper_nudge_goals_dismissed_${email}`;
}
function isDismissed(email: string): boolean {
  try {
    return localStorage.getItem(dismissKey(email)) === "1";
  } catch {
    return false;
  }
}
function markDismissed(email: string): void {
  try {
    localStorage.setItem(dismissKey(email), "1");
  } catch {
    /* ignore */
  }
}

// Moved off the onboarding wizard onto the dashboard itself (issue #267): a
// values question before a member has seen a single number of their own read
// backwards, so it is a dismissible card now, asked once there is something
// real to plan against, and skippable with zero cost either way.
export function GoalsNudge({
  email,
  profile,
  onSave,
}: {
  email: string;
  profile: UserProfile | null;
  onSave: (goals: string[]) => void;
}) {
  const [dismissed, setDismissed] = useState(() => isDismissed(email));
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState("");

  // Already has goals, whether picked here or carried over from before this
  // nudge existed: nothing to ask.
  if (dismissed || (profile?.goals && profile.goals.length > 0)) return null;

  const addCustomGoal = () => {
    const g = customGoal.trim();
    if (!g) return;
    const exists = [...GOALS, ...customGoals].some((x) => x.toLowerCase() === g.toLowerCase());
    if (!exists) setCustomGoals((prev) => [...prev, g]);
    setGoals((prev) => (prev.some((x) => x.toLowerCase() === g.toLowerCase()) ? prev : [...prev, g]));
    setCustomGoal("");
  };

  const dismiss = () => {
    markDismissed(email);
    setDismissed(true);
  };

  const save = () => {
    if (!goals.length) return dismiss();
    onSave(goals);
    markDismissed(email); // answered, so this nudge is done either way
    setDismissed(true);
  };

  return (
    <div className="card pad-lg dash-nudge" style={{ marginBottom: 16 }}>
      <button className="dash-nudge-x" onClick={dismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
      <h3 style={{ margin: "0 0 6px" }}>What are you working toward?</h3>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--jnpr-ink-2)" }}>
        Pick everything that applies, or add your own. We&rsquo;ll shape your plans and recommendations around these.
      </p>
      <div className="ob-chips">
        {[...GOALS, ...customGoals].map((g) => {
          const on = goals.includes(g);
          return (
            <button
              key={g}
              type="button"
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
        <button type="button" className="btn ghost" onClick={addCustomGoal} disabled={!customGoal.trim()}>
          <Plus /> Add
        </button>
      </div>
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={save} disabled={!goals.length}>
          Save goals
        </button>
      </div>
    </div>
  );
}
