import { useState } from "react";
import { Flame, X } from "lucide-react";
import { todayLocal, dateToLocal } from "../utils.js";
import { t as i18n } from "../i18n.js";

function DailyReminder({ transactions, onAddTx }) {
  const today = todayLocal();
  const todayTxs = transactions.filter(t => t.date === today && t.cat !== "inne");
  const [dismissed, setDismissed] = useState(false);

  // Streak: consecutive days with at least one transaction
  const streak = (() => {
    let s = 0;
    const d = new Date();
    while (true) {
      const ds = dateToLocal(d);
      const has = transactions.some(t => t.date === ds && t.cat !== "inne");
      if (!has) break;
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
  })();

  const lastDate = transactions.filter(t => t.cat !== "inne").map(t => t.date).sort().reverse()[0];
  const daysSinceLast = lastDate ? Math.floor((new Date(today) - new Date(lastDate)) / 86400000) : 99;

  if (dismissed) return null;

  const hasToday = todayTxs.length > 0;
  const urgent = !hasToday && daysSinceLast >= 1;

  return (
    <div style={{
      background: "linear-gradient(135deg,#0d1628,#111827)",
      border: "1px solid #1e3a5f66",
      borderRadius: 20,
      padding: "16px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{
          background: streak >= 3 ? "#f9731622" : "#1e3a5f",
          border: `1px solid ${streak >= 3 ? "#f9731644" : "#334155"}`,
          borderRadius: 12, padding: 9, flexShrink: 0,
        }}>
          <Flame size={18} color={streak >= 3 ? "#f97316" : "#64748b"}/>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            {i18n("daily.streak", "Seria")}
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700,
            color: streak >= 3 ? "#f97316" : "#e2e8f0" }}>
            {streak} {streak === 1 ? i18n("daily.day", "dzień") : i18n("daily.days", "dni")}
            <span style={{ fontSize: 11, color: "#475569", marginLeft: 6, fontFamily: "'Space Grotesk', sans-serif" }}>
              {urgent ? "· " + i18n("daily.addToday", "dodaj dziś!") : hasToday ? "· " + i18n("daily.great", "świetnie!") : ""}
            </span>
          </div>
        </div>
      </div>

      {urgent && (
        <button onClick={onAddTx} style={{
          background: "linear-gradient(135deg,#1e40af,#7c3aed)",
          border: "none", borderRadius: 12,
          padding: "9px 14px", color: "white",
          fontWeight: 700, fontSize: 12, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          whiteSpace: "nowrap",
        }}>
          + Dodaj
        </button>
      )}

      <button onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#334155", padding: 4, flexShrink: 0 }}>
        <X size={14}/>
      </button>
    </div>
  );
};

export { DailyReminder };
