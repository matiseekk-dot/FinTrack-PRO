import { useState, useEffect } from "react";
import { X } from "lucide-react";

function MonthlySummary({ transactions, month, cycleDay = 1, onClose }) {
  const monthNames = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
                      "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

  const fmt = (n) => Math.abs(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

  // Get previous month transactions
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const prevKey   = `${prevYear}-${String(prevMonth+1).padStart(2,"0")}`;

  const prevTx  = transactions.filter(t => t.date.startsWith(prevKey) && t.cat !== "inne");
  const income  = prevTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
  const expense = prevTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const saved   = income - expense;

  // Top spending category
  const catMap = {};
  prevTx.filter(t => t.amount < 0).forEach(t => {
    catMap[t.cat] = (catMap[t.cat] || 0) + Math.abs(t.amount);
  });
  const topCat = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 20px", fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #0d1628, #0a1e3a)",
        border: "1px solid #1e3a5f", borderRadius: 24,
        padding: "28px 24px", width: "min(100%, 400px)",
        boxShadow: "0 0 80px #1e40af22",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Podsumowanie miesiąca
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", marginTop: 2 }}>
              {monthNames[prevMonth]} {prevYear}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#1a2744", border: "none", borderRadius: 10, padding: 8, cursor: "pointer", color: "#475569" }}>
            <X size={16}/>
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Przychody", val: fmt(income), color: "#10b981" },
            { label: "Wydatki",   val: fmt(expense), color: "#ef4444" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#060b14", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Balance */}
        <div style={{
          background: saved >= 0 ? "#052e16" : "#1a0808",
          border: `1px solid ${saved >= 0 ? "#16a34a33" : "#7f1d1d33"}`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
            {saved >= 0 ? "💚 Zaoszczędzono" : "🔴 Przekroczono budżet"}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 800,
            color: saved >= 0 ? "#10b981" : "#ef4444" }}>
            {saved >= 0 ? "+" : ""}{fmt(saved)}
          </span>
        </div>

        {/* Top category */}
        {topCat && (
          <div style={{ background: "#060b14", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
            <span style={{ fontSize: 12, color: "#475569" }}>Największy wydatek: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{topCat[0]}</span>
            <span style={{ fontSize: 12, color: "#475569" }}> · {fmt(topCat[1])}</span>
          </div>
        )}

        <button onClick={onClose} style={{
          width: "100%", background: "linear-gradient(135deg,#1e40af,#7c3aed)",
          border: "none", borderRadius: 14, padding: "14px 0",
          color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Nowy miesiąc 🚀
        </button>
      </div>
    </div>
  );
};

export { MonthlySummary };
