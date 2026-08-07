import { useEffect, useMemo, useState } from "react";
import type { Domain } from "@/components/dashboard/domain-tile-grid";
import { DomainTileGrid } from "@/components/dashboard/domain-tile-grid";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { fetchPlans, type Plan } from "@/lib/plans";

const ink = "#2A2A2A";
const muted = "#6B6B6B";
const serif = "'Fraunces', Georgia, serif";

type Props = {
  userName: string;
  onStartPlan: (domain: Domain) => void;
  plansVersion?: number;
};

export function Dashboard({ userName, onStartPlan, plansVersion }: Props) {
  const firstName = userName.split(" ")[0] || userName;
  const [plansByDomain, setPlansByDomain] = useState<Record<string, Plan>>({});

  useEffect(() => {
    let cancelled = false;
    fetchPlans().then((plans) => {
      if (cancelled) return;
      const map: Record<string, Plan> = {};
      for (const p of plans) map[p.domain] = p;
      setPlansByDomain(map);
    });
    return () => {
      cancelled = true;
    };
  }, [plansVersion]);

  const plans = useMemo(() => Object.values(plansByDomain), [plansByDomain]);

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

        <PortfolioSummary plans={plans} />

        <DomainTileGrid onStart={onStartPlan} plansByDomain={plansByDomain} />
      </div>
    </div>
  );
}
