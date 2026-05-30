import type { Plan } from "@/lib/plans";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const aligned = "#5C7A65"; // sage
const diverged = "#C19A39"; // amber

type ComparisonField = {
  field: string;
  label: string;
  format: (v: unknown) => string;
  divergedNote: string;
  isArray?: boolean;
};

const FIELDS_BY_DOMAIN: Record<string, ComparisonField[]> = {
  "home-buying": [
    {
      field: "home_type",
      label: "Home type",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "House vs. condo vs. multi-family often reflects different priorities (yard, walkability, appreciation potential). Worth a few minutes on what each of you actually wants from the space.",
    },
    {
      field: "target_date",
      label: "Target move-in",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "A 6 to 12 month difference in timing can change the math significantly. Surface what's driving each timeline.",
    },
    {
      field: "rough_price_band",
      label: "Rough price band",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Different price expectations usually reflect different assumptions about location and size. Compare what each of you was picturing.",
    },
    {
      field: "target_home_price",
      label: "Target home price",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "A meaningful gap suggests different views on what's affordable. Compare the underlying assumptions, not just the numbers.",
    },
    {
      field: "target_dp_pct",
      label: "Target down payment %",
      format: (v) => (typeof v === "number" ? `${v}%` : "-"),
      divergedNote:
        "Down payment % reflects different appetites for PMI, liquidity, and risk. Talk through which matters more for your household.",
    },
    {
      field: "prioritize_debt",
      label: "Pay down debt first?",
      format: (v) => (v === true ? "Yes" : v === false ? "No" : "-"),
      divergedNote:
        "One of you wants a cleaner balance sheet, the other wants to keep saving. Both reasonable. Find the middle on amount and timing.",
    },
    {
      field: "strategies_considered",
      label: "Strategies on the table",
      isArray: true,
      format: (v) => (Array.isArray(v) && v.length > 0 ? (v as string[]).join(", ") : "none"),
      divergedNote:
        "The strategies you both kept are your natural starting point. The ones only one of you flagged are worth a quick conversation about why.",
    },
  ],
  "debt-paydown": [
    {
      field: "payoff_method",
      label: "Payoff method",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Avalanche is mathematically optimal; snowball is psychologically easier. The right method is the one you'll actually stick with. If you each picked differently, the question is which is more likely to keep you both going.",
    },
    {
      field: "monthly_target",
      label: "Monthly paydown target ($)",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "Different monthly targets often reflect different views on lifestyle vs. urgency. Pick a number you can both commit to even on a tough month.",
    },
    {
      field: "prioritize_high_interest",
      label: "High-interest first?",
      format: (v) => (v === true ? "Yes" : v === false ? "No" : "-"),
      divergedNote:
        "One of you wants the math win, the other wants the morale win. Both work. Pick the method that survives a bad month.",
    },
    {
      field: "consider_consolidation",
      label: "Consolidation/refi approach",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Consolidation feels clean but only helps if you actually use the savings to pay down faster. If you disagree on whether to consolidate, walk through what each path looks like in numbers.",
    },
    {
      field: "target_payoff_date",
      label: "Target payoff date",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "A timeline difference usually means different views on tradeoffs. Either tighten the monthly target or extend the date, both honest moves.",
    },
  ],
  "combining-finances": [
    {
      field: "accounts_approach",
      label: "Account architecture",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Joint, separate, and hybrid each carry their own emotional weight. The right answer is the one you can both stick with for years, not the one in a finance blog.",
    },
    {
      field: "bills_split_method",
      label: "How bills are split",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Equal vs. income-proportional often reflects different views on fairness vs. simplicity. Worth surfacing what feels right to each of you.",
    },
    {
      field: "emergency_fund_months",
      label: "Emergency fund target (months)",
      format: (v) => (typeof v === "number" ? `${v} months` : "-"),
      divergedNote:
        "Different runway targets usually mean different risk tolerance. Talk about what would make each of you feel safe.",
    },
    {
      field: "investment_priority",
      label: "Investment priority",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Retirement-first vs. brokerage-first reflects different time horizons and tax preferences. Both can be right; align on the proportion.",
    },
    {
      field: "solo_spend_limit",
      label: "Solo spend limit ($)",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "Different solo-spend limits often reflect different ideas of autonomy. The number matters less than agreeing on one.",
    },
    {
      field: "big_purchase_threshold",
      label: "Discuss-first threshold ($)",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "Above this number, you talk before buying. Differences here are easy to resolve, just pick the lower of the two.",
    },
  ],
};

function arraysEqualAsSets(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((x) => JSON.stringify(x)));
  for (const x of b) {
    if (!sa.has(JSON.stringify(x))) return false;
  }
  return true;
}

type AlignmentState = "aligned" | "diverged" | "missing";

function compareValues(a: unknown, b: unknown, isArray = false): AlignmentState {
  if (a == null || b == null) return "missing";
  if (isArray && Array.isArray(a) && Array.isArray(b)) {
    return arraysEqualAsSets(a, b) ? "aligned" : "diverged";
  }
  return a === b ? "aligned" : "diverged";
}

type Props = {
  plan: Plan;
  // 'youAreInviter' true if the current user is the inviter; affects label sides
  youAreInviter: boolean;
  inviterFirstName?: string | null;
};

export function PlanAlignment({ plan, youAreInviter, inviterFirstName }: Props) {
  const inviterCollected = (plan.current_state?.collected ?? {}) as Record<string, unknown>;
  const partnerCollected = plan.partner_collected ?? {};
  const partnerLabel = plan.partner_first_name?.trim() || "Your partner";
  const inviterLabel = inviterFirstName?.trim() || "The inviter";

  const yourLabel = youAreInviter ? "You" : "You";
  const themLabel = youAreInviter ? partnerLabel : inviterLabel;
  const yourCollected = youAreInviter ? inviterCollected : partnerCollected;
  const theirCollected = youAreInviter ? partnerCollected : inviterCollected;

  const fields = FIELDS_BY_DOMAIN[plan.domain] ?? [];
  const rows = fields.map((f) => ({
    ...f,
    yourValue: yourCollected[f.field],
    theirValue: theirCollected[f.field],
    state: compareValues(
      yourCollected[f.field],
      theirCollected[f.field],
      f.isArray ?? false,
    ),
  }));

  const alignedCount = rows.filter((r) => r.state === "aligned").length;
  const divergedCount = rows.filter((r) => r.state === "diverged").length;
  const meaningfulRows = rows.filter((r) => r.state !== "missing");

  if (meaningfulRows.length === 0) {
    return (
      <section style={{ marginTop: 36, borderTop: `1px solid ${border}`, paddingTop: 28 }}>
        <h2 style={{ fontFamily: serif, fontSize: 18, fontWeight: 400, color: ink, margin: "0 0 6px" }}>
          Alignment with {themLabel}
        </h2>
        <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.55 }}>
          Not enough captured yet to compare. Once {themLabel} finishes their plan, this section will
          surface where you align and where there's a conversation to have.
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 36, borderTop: `1px solid ${border}`, paddingTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 6px" }}>
        <h2 style={{ fontFamily: serif, fontSize: 18, fontWeight: 400, color: ink, margin: 0 }}>
          Alignment with {themLabel}
        </h2>
        <span style={{ fontSize: 12, color: muted, fontFamily: sans }}>
          {alignedCount} aligned · {divergedCount} to talk through
        </span>
      </div>
      <p style={{ fontSize: 13, color: muted, margin: "0 0 18px", lineHeight: 1.55 }}>
        Differences aren't disagreements. They're starting points.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {meaningfulRows.map((row) => (
          <AlignmentRow
            key={row.field}
            label={row.label}
            yourLabel={yourLabel}
            themLabel={themLabel}
            yourValue={row.format(row.yourValue)}
            theirValue={row.format(row.theirValue)}
            state={row.state}
            divergedNote={row.divergedNote}
          />
        ))}
      </div>
    </section>
  );
}

function AlignmentRow({
  label,
  yourLabel,
  themLabel,
  yourValue,
  theirValue,
  state,
  divergedNote,
}: {
  label: string;
  yourLabel: string;
  themLabel: string;
  yourValue: string;
  theirValue: string;
  state: AlignmentState;
  divergedNote: string;
}) {
  const isAligned = state === "aligned";
  const accent = isAligned ? aligned : diverged;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, color: muted, fontFamily: sans, fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent,
            fontFamily: sans,
          }}
        >
          {isAligned ? "Aligned" : "Talk through"}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 14.5,
          color: ink,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 0", minWidth: 120 }}>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 2px", letterSpacing: "0.04em" }}>
            {yourLabel}
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{yourValue}</p>
        </div>
        <div style={{ flex: "1 1 0", minWidth: 120 }}>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 2px", letterSpacing: "0.04em" }}>
            {themLabel}
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{theirValue}</p>
        </div>
      </div>
      {!isAligned && (
        <p
          style={{
            fontSize: 13,
            color: muted,
            lineHeight: 1.55,
            margin: "10px 0 0",
            paddingTop: 8,
            borderTop: `1px dashed ${border}`,
          }}
        >
          {divergedNote}
        </p>
      )}
    </div>
  );
}
