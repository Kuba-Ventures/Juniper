import { Building2, TrendingUp, CreditCard, Home as HomeIcon, ClipboardList } from "lucide-react";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const CONNECTION_TYPES = [
  {
    icon: <Building2 size={22} color={sage} strokeWidth={1.6} />,
    label: "Checking & Savings",
    description: "See your balances and cash flow in one place.",
  },
  {
    icon: <TrendingUp size={22} color={sage} strokeWidth={1.6} />,
    label: "Investments & Brokerage",
    description: "Track your portfolio and net worth over time.",
  },
  {
    icon: <CreditCard size={22} color={sage} strokeWidth={1.6} />,
    label: "Credit Cards",
    description: "Monitor spending and manage payoff strategies.",
  },
  {
    icon: <HomeIcon size={22} color={sage} strokeWidth={1.6} />,
    label: "Mortgage & Loans",
    description: "Keep tabs on balances, rates, and payoff timelines.",
  },
  {
    icon: <ClipboardList size={22} color={sage} strokeWidth={1.6} />,
    label: "Budgeting Tools & Apps",
    description: "Sync data from YNAB, Mint, Copilot, and other budgeting apps.",
  },
];

export function ConnectionsView() {
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "52px 28px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <img
            src="/logo.png"
            alt="Juniper"
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 20px", display: "block" }}
          />
          <h1
            style={{
              fontFamily: serif,
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 400,
              color: ink,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Connect your accounts.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: muted,
              margin: "0 auto",
              lineHeight: 1.65,
              maxWidth: 440,
            }}
          >
            Linking your accounts gives Juniper a real-time picture of your finances, so the guidance
            you get is grounded in what's actually happening.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CONNECTION_TYPES.map((c) => (
            <div
              key={c.label}
              style={{
                background: "#fff",
                border: `1px solid ${border}`,
                borderRadius: 14,
                padding: "22px 24px",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "rgba(92,122,101,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {c.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: serif, fontSize: 16, color: ink, margin: "0 0 3px", fontWeight: 400 }}>
                  {c.label}
                </p>
                <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.5 }}>{c.description}</p>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  background: "rgba(92,122,101,0.08)",
                  border: `1px solid rgba(92,122,101,0.2)`,
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 12,
                  color: muted,
                  fontFamily: sans,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                Coming soon
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: muted, textAlign: "center", marginTop: 36, lineHeight: 1.6 }}>
          Account connections will use bank-grade encryption and read-only access. Your credentials are
          never stored.
        </p>
      </div>
    </div>
  );
}
