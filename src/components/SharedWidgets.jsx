import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { fmt, fmtShort, cycleTxs } from "../utils.js";
import { MONTH_NAMES } from "../constants.js";

function RecurringReminder({ payments, transactions, setTransactions, accounts }) {
  const today     = new Date();
  const todayStr  = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const dayOfMonth = today.getDate();
  const [dismissed, setDismissed] = useState({});

  const dueToday = payments.filter(p => {
    if (dismissed[p.id]) return false;
    if (p.freq === "daily") return true;
    if (p.freq === "weekly") return p.dayOfWeek === dayOfWeek;
    if (p.freq === "monthly" || p.freq === "bimonthly") return (p.dueDay || p.dayOfMonth || 1) === dayOfMonth;
    return false;
  });

  const notYetAdded = dueToday.filter(p =>
    !transactions.some(t => t.desc === p.name && t.date === todayStr && t.amount === p.amount)
  );

  if (notYetAdded.length === 0) return null;

  const addNow = (p) => {
    setTransactions(tx => [{ id: Date.now(), date: todayStr, desc: p.name, amount: p.amount, cat: p.cat, acc: p.acc }, ...tx]);
    setDismissed(d => ({ ...d, [p.id]: true }));
  };

  const dismiss = (id) => setDismissed(d => ({ ...d, [id]: true }));

  return (
    <div style={{ marginBottom: 14 }}>
      {notYetAdded.map(p => (
        <div key={p.id} style={{
          background: "linear-gradient(135deg,#1a1208,#221a08)",
          border: "1px solid #78350f",
          borderRadius: 14, padding: "12px 14px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ background: "#f59e0b22", borderRadius: 10, padding: 8, flexShrink: 0 }}>
            <RefreshCw size={15} color="#f59e0b"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fcd34d" }}>
              🔔 {p.name}
            </div>
            <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
              Dzisiejsza płatność · {fmt(Math.abs(p.amount))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => addNow(p)} style={{
              background: "#f59e0b", border: "none", borderRadius: 8,
              padding: "6px 12px", cursor: "pointer", color: "#1a0a00",
              fontSize: 12, fontWeight: 700 }}>+ Dodaj</button>
            <button onClick={() => dismiss(p.id)} style={{
              background: "none", border: "1px solid #78350f44", borderRadius: 8,
              padding: "6px 8px", cursor: "pointer", color: "#92400e",
              fontSize: 11 }}>Pomiń</button>
          </div>
        </div>
      ))}
    </div>
  );
};

function MiniComparison({ transactions, month, cycleDay }) {
  const prevMonth = month > 0 ? month - 1 : 11;
  const curTx  = cycleTxs(transactions, month, cycleDay);
  const prevTx = cycleTxs(transactions, prevMonth, cycleDay);

  const curExp  = curTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
  const prevExp = prevTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
  const curInc  = curTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
  const prevInc = prevTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);

  const expDiff = prevExp > 0 ? ((curExp - prevExp) / prevExp * 100) : 0;
  const incDiff = prevInc > 0 ? ((curInc - prevInc) / prevInc * 100) : 0;

  const rows = [
    { label: "Wydatki",   cur: curExp,  diff: expDiff,  bad: expDiff > 0 },
    { label: "Przychody", cur: curInc,  diff: incDiff,  bad: incDiff < 0 },
  ];

  return (
    <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12 }}>
        vs {MONTH_NAMES[prevMonth]}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map(({ label, cur, diff, bad }) => (
          <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{fmtShort(cur)} zł</div>
            {Math.abs(diff) > 0.5 && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3,
                color: bad ? "#ef4444" : "#10b981" }}>
                {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(0)}%
              </div>
            )}
            {Math.abs(diff) <= 0.5 && (
              <div style={{ fontSize: 11, color: "#334155", marginTop: 3 }}>bez zmian</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export { RecurringReminder, MiniComparison };
