import { useState } from "react";
import type React from "react";
import { Plus, X } from "lucide-react";
import type { DebtItem } from "@/lib/plans";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 6px",
};

const inputStyle: React.CSSProperties = {
  border: `1px solid ${border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: sans,
  fontSize: 14,
  color: ink,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
  width: "100%",
};

const EMPTY: DebtItem = { name: "", balance: 0, apr: 0 };

// Debt-list builder for a completed Debt Paydown plan. Lets the user list each
// balance + APR; the values persist to current_state.debts and feed the payoff
// projection (summed balance + blended APR). Local state keeps typing smooth;
// onChange debounces the save upstream.
export function DebtListSection({
  debts,
  onChange,
}: {
  debts: DebtItem[];
  onChange: (debts: DebtItem[]) => void;
}) {
  const [rows, setRows] = useState<DebtItem[]>(debts);

  const commit = (next: DebtItem[]) => {
    setRows(next);
    onChange(next);
  };
  const setField = (i: number, field: keyof DebtItem, value: string) => {
    const next = rows.map((r, idx) => {
      if (idx !== i) return r;
      if (field === "name") return { ...r, name: value };
      const n = parseFloat(value.replace(/[^0-9.]/g, ""));
      return { ...r, [field]: Number.isNaN(n) ? 0 : n };
    });
    commit(next);
  };
  const addRow = () => commit([...rows, { ...EMPTY }]);
  const removeRow = (i: number) => commit(rows.filter((_, idx) => idx !== i));

  const total = rows.reduce((s, r) => s + (r.balance || 0), 0);
  const blended =
    total > 0 ? rows.reduce((s, r) => s + (r.balance || 0) * (r.apr || 0), 0) / total : 0;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Your debts</h2>
      <p style={{ fontFamily: sans, fontSize: 13, color: muted, margin: "0 0 14px", lineHeight: 1.5 }}>
        List each balance and its interest rate. The projection below uses your real total and blended
        rate, and this is the order your payoff strategy works through.
      </p>

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* header labels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 28px", gap: 8, padding: "0 2px" }}>
            {["Debt", "Balance", "APR %", ""].map((h, idx) => (
              <span
                key={idx}
                style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.08em", color: muted, fontWeight: 600, textTransform: "uppercase" }}
              >
                {h}
              </span>
            ))}
          </div>

          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 28px", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={r.name}
                placeholder="e.g. Visa"
                onChange={(e) => setField(i, "name", e.target.value)}
                style={inputStyle}
                aria-label="Debt name"
              />
              <input
                type="text"
                inputMode="numeric"
                value={r.balance ? r.balance.toLocaleString("en-US") : ""}
                placeholder="$0"
                onChange={(e) => setField(i, "balance", e.target.value)}
                style={{ ...inputStyle, textAlign: "right" }}
                aria-label="Balance"
              />
              <input
                type="text"
                inputMode="decimal"
                value={r.apr ? String(r.apr) : ""}
                placeholder="0"
                onChange={(e) => setField(i, "apr", e.target.value)}
                style={{ ...inputStyle, textAlign: "right" }}
                aria-label="APR percent"
              />
              <button
                onClick={() => removeRow(i)}
                aria-label="Remove debt"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: muted,
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {total > 0 && (
            <p style={{ fontFamily: sans, fontSize: 13, color: ink, margin: "6px 2px 0" }}>
              Total <strong>${Math.round(total).toLocaleString("en-US")}</strong>
              <span style={{ color: muted }}> · blended {blended.toFixed(1)}% APR</span>
            </p>
          )}
        </div>
      )}

      <button
        onClick={addRow}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: rows.length > 0 ? 12 : 0,
          padding: "9px 14px",
          borderRadius: 8,
          border: `1px solid ${border}`,
          background: "#fff",
          cursor: "pointer",
          fontFamily: sans,
          fontSize: 14,
          fontWeight: 500,
          color: sage,
        }}
      >
        <Plus size={15} strokeWidth={2.4} /> Add {rows.length > 0 ? "another debt" : "a debt"}
      </button>
    </section>
  );
}
