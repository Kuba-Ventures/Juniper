import type { Domain } from "@/components/dashboard/domain-tile-grid";
import { DomainTileGrid } from "@/components/dashboard/domain-tile-grid";

const ink = "#2A2A2A";
const muted = "#6B6B6B";
const serif = "'Fraunces', Georgia, serif";

type Props = {
  userName: string;
  onStartPlan: (domain: Domain) => void;
};

export function Dashboard({ userName, onStartPlan }: Props) {
  const firstName = userName.split(" ")[0] || userName;
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 28px 80px" }}>
        <header style={{ marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: serif,
              fontSize: "clamp(28px, 4vw, 38px)",
              fontWeight: 400,
              color: ink,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Welcome, {firstName}.
          </h1>
          <p style={{ fontSize: 15.5, color: muted, margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
            Pick a life moment to start planning. Each one walks you through a focused conversation
            and ends with a plan you can return to and update over time.
          </p>
        </header>

        <DomainTileGrid onStart={onStartPlan} />
      </div>
    </div>
  );
}
