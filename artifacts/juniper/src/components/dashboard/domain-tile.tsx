import { useState, type ReactNode } from "react";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type Props = {
  title: string;
  description: string;
  icon: ReactNode;
  onStart: () => void;
  state?: "empty" | "in_progress" | "completed";
  goalHeadline?: string | null;
};

export function DomainTile({
  title,
  description,
  icon,
  onStart,
  state = "empty",
  goalHeadline,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const buttonLabel =
    state === "in_progress"
      ? "Continue plan"
      : state === "completed"
        ? "View plan"
        : "Start this plan";

  const subhead = state !== "empty" && goalHeadline ? goalHeadline : description;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: "28px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: hovered ? "0 4px 24px rgba(0,0,0,0.06)" : "none",
        borderColor: hovered ? "rgba(92,122,101,0.35)" : border,
        position: "relative",
      }}
    >
      {state !== "empty" && (
        <span
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: state === "completed" ? sage : muted,
            fontFamily: sans,
          }}
        >
          {state === "completed" ? "Active" : "In progress"}
        </span>
      )}

      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(92,122,101,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: sage,
        }}
      >
        {icon}
      </div>

      <div>
        <p style={{ fontFamily: serif, fontSize: 19, color: ink, margin: "0 0 6px", fontWeight: 400 }}>
          {title}
        </p>
        <p
          style={{
            fontSize: 13.5,
            color: state === "empty" ? muted : ink,
            margin: 0,
            lineHeight: 1.55,
            fontWeight: state === "empty" ? 400 : 500,
          }}
        >
          {subhead}
        </p>
      </div>

      <button
        onClick={onStart}
        style={{
          marginTop: "auto",
          alignSelf: "flex-start",
          background: "transparent",
          color: sage,
          border: `1.5px solid ${sage}`,
          borderRadius: 8,
          padding: "9px 18px",
          fontFamily: sans,
          fontSize: 13.5,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(92,122,101,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
