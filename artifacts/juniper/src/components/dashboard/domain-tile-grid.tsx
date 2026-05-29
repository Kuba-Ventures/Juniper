import { Home, Heart, CreditCard, Baby, Scale } from "lucide-react";
import { DomainTile } from "./domain-tile";
import type { Plan } from "@/lib/plans";

const ICON_PROPS = { size: 22, strokeWidth: 1.6 };

export type Domain =
  | "home-buying"
  | "combining-finances"
  | "debt-paydown"
  | "baby-planning"
  | "prenup";

export const DOMAINS: Array<{
  id: Domain;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "home-buying",
    title: "Home Buying",
    description: "Map out affordability, down payment, and timing — together.",
    icon: <Home {...ICON_PROPS} />,
  },
  {
    id: "combining-finances",
    title: "Combining Finances",
    description: "Decide what's shared, what stays separate, and how to handle it month to month.",
    icon: <Heart {...ICON_PROPS} />,
  },
  {
    id: "debt-paydown",
    title: "Debt Paydown",
    description: "Build a payoff strategy you both agree on, with a clear finish line.",
    icon: <CreditCard {...ICON_PROPS} />,
  },
  {
    id: "baby-planning",
    title: "Baby Planning",
    description: "Plan for parental leave, childcare, and the new monthly math.",
    icon: <Baby {...ICON_PROPS} />,
  },
  {
    id: "prenup",
    title: "Prenup & Legal",
    description: "Talk through legal and financial agreements before the wedding.",
    icon: <Scale {...ICON_PROPS} />,
  },
];

type Props = {
  onStart: (domain: Domain) => void;
  plansByDomain?: Record<string, Plan>;
};

export function DomainTileGrid({ onStart, plansByDomain }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 18,
      }}
    >
      {DOMAINS.map((d) => {
        const plan = plansByDomain?.[d.id];
        const state: "empty" | "in_progress" | "completed" =
          plan?.status === "completed"
            ? "completed"
            : plan?.status === "in_progress"
              ? "in_progress"
              : "empty";
        return (
          <DomainTile
            key={d.id}
            title={d.title}
            description={d.description}
            icon={d.icon}
            onStart={() => onStart(d.id)}
            state={state}
            goalHeadline={plan?.goal?.headline ?? null}
          />
        );
      })}
    </div>
  );
}
