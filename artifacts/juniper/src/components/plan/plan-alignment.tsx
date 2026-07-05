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
      field: "target_home_price",
      label: "Target home price",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "A meaningful gap suggests different views on what's affordable. Compare the underlying assumptions, not just the numbers.",
    },
    {
      field: "target_date",
      label: "Target move-in",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "A 6 to 12 month difference in timing can change the math significantly. Surface what's driving each timeline.",
    },
    {
      field: "total_savings",
      label: "Saved so far",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "A gap here usually means you're each counting different accounts. Line up what actually goes toward the down payment.",
    },
    {
      field: "annual_income",
      label: "Household income",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}/yr` : "-"),
      divergedNote:
        "If your income figures differ, one of you may be including bonuses or variable pay the other left out. Align on the number you'll actually plan around.",
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
  "baby-planning": [
    {
      field: "stage",
      label: "Current stage",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Different views on where you are today often mean different urgency. Talk through what each of you actually feels ready for.",
    },
    {
      field: "target_year",
      label: "Target year",
      format: (v) => (typeof v === "number" ? String(v) : "-"),
      divergedNote:
        "Even a year's gap in timing changes savings urgency. Worth surfacing what's driving each timeline.",
    },
    {
      field: "primary_leave_months",
      label: "Primary parent leave (months)",
      format: (v) => (typeof v === "number" ? `${v} months` : "-"),
      divergedNote:
        "Leave length usually reflects different views on career risk, finances, and time with the baby. Often resolves by mapping what each month looks like financially.",
    },
    {
      field: "partner_leave_months",
      label: "Partner leave (months)",
      format: (v) => (typeof v === "number" ? `${v} months` : "-"),
      divergedNote:
        "Partner leave is often constrained more by employer than by preference. Compare what each of you can actually take vs. what you'd ideally take.",
    },
    {
      field: "childcare_preference",
      label: "Childcare preference",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Daycare vs. nanny vs. stay-home parent isn't just a money question. It's also about who you want to spend the day with you. Worth a real conversation here.",
    },
    {
      field: "monthly_cost_estimate",
      label: "Monthly cost estimate ($)",
      format: (v) => (typeof v === "number" ? `$${v.toLocaleString()}` : "-"),
      divergedNote:
        "Cost estimates often reveal different baseline assumptions about location, childcare type, and lifestyle. Walk through what each of you was picturing.",
    },
    {
      field: "college_fund_start",
      label: "College fund start",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "One of you wants the early time-value win; the other wants to fund retirement first. Both reasonable. Decide the split.",
    },
  ],
  "prenup": [
    {
      field: "property_treatment",
      label: "Property treatment",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Community vs. separate vs. hybrid is one of the prenup's biggest levers. Often reflects different views on what marriage means financially. This is the one to talk through deeply, with an attorney.",
    },
    {
      field: "inheritance_treatment",
      label: "Inheritance treatment",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Inheritances often carry family weight beyond money. Discuss what feels respectful to each family of origin.",
    },
    {
      field: "support_stance",
      label: "Spousal support stance",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Support terms are the most emotionally loaded prenup question. There's no right answer; the goal is alignment, and ideally with each of you having had separate counsel.",
    },
    {
      field: "carveouts",
      label: "Carveouts",
      format: (v) => (typeof v === "string" && v ? v : "-"),
      divergedNote:
        "Different carveouts reflect different views on which assets feel personal vs. shared. Walk through the specifics together before bringing to an attorney.",
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
