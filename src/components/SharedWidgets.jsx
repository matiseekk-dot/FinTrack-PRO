import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { fmt, fmtShort, cycleTxs, dateToLocal } from "../utils.js";
import { MONTH_NAMES } from "../constants.js";

function RecurringReminder({ payments, paid = {}, transactions, setTransactions, accounts }) {
  const today     = new Date();
  const todayStr  = dateToLocal(today);
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

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

  const notYetAdded = dueToday.filter(p => {
    // Jeśli opłacono przez zakładkę Płatności — nie pokazuj
    if (paid[`${p.id}_${currentMonthKey}`]) return false;
    // Jeśli transakcja o tej nazwie istnieje w tym miesiącu — nie pokazuj
    const alreadyInTx = transactions.some(t =>
      t.desc === p.name &&
      t.date.startsWith(currentMonthKey) &&
      Math.abs(t.amount) === Math.abs(p.amount)
    );
    return !alreadyInTx;
  });

  if (notYetAdded.length === 0) return null;

  const addNow = (p) => {
    setTransactions(tx => [{
      id: Date.now(), date: todayStr,
      desc: p.name, amount: p.amount, cat: p.cat, acc: p.acc,
      linkedPaymentId: p.id,
      linkedMonth: todayStr.substring(0, 7),  // YYYY-MM
    }, ...tx]);
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

export { RecurringReminder };
