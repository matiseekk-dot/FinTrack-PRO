import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { generateInsights } from "../lib/insights.js";

function InsightsCard({ transactions, budgets, accounts }) {
  const insights = useMemo(
    () => generateInsights(transactions, budgets, accounts),
    [transactions, budgets, accounts]
  );

  if (insights.length === 0) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg,#0d1628,#111827)",
      border: "1px solid #1e3a5f66",
      borderRadius: 20,
      padding: "18px 20px",
    }}>
      <div style={{
        fontSize: 10, color: "#475569", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 14, display: "flex", alignItems: "center", gap: 6,
      }}>
        <Sparkles size={11}/> Insighty
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {insights.map((ins, i) => (
          <div key={ins.type + i} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            padding: i < insights.length - 1 ? "0 0 12px 0" : "0",
            borderBottom: i < insights.length - 1 ? "1px solid #0f1a2e" : "none",
          }}>
            <div style={{
              background: ins.color + "22",
              border: `1px solid ${ins.color}33`,
              borderRadius: 10, padding: "6px 8px",
              flexShrink: 0, fontSize: 16, minWidth: 34, textAlign: "center",
            }}>
              {ins.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                lineHeight: 1.35, marginBottom: 3,
              }}>
                {ins.title}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
                {ins.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { InsightsCard };
