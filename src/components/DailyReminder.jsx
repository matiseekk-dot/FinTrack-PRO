import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft, ChevronRight,
  Home, List, PiggyBank, BarChart2, Settings, ArrowUpRight, ArrowDownLeft,
  CreditCard, Briefcase, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Eye, EyeOff, Edit2, Trash2, Check,
  Bell, BellOff, CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
  ClipboardList, RefreshCw, AlarmClock, Copy
} from "lucide-react";
import { Card } from "./ui/Card.jsx";

function DailyReminder({ transactions, onAddTx }) {
  const today = new Date().toISOString().split("T")[0];
  const todayTxs = transactions.filter(t => t.date === today && t.cat !== "inne");
  const [dismissed, setDismissed] = useState(false);

  // streak: consecutive days with at least one transaction
  const streak = (() => {
    let s = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().split("T")[0];
      const has = transactions.some(t => t.date === ds && t.cat !== "inne");
      if (!has) break;
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
  })();

  const lastDate = transactions
    .filter(t => t.cat !== "inne")
    .map(t => t.date)
    .sort()
    .reverse()[0];
  const daysSinceLast = lastDate
    ? Math.floor((new Date(today) - new Date(lastDate)) / 86400000)
    : 99;

  if (dismissed) return null;

  const hasToday = todayTxs.length > 0;
  const urgent = !hasToday && daysSinceLast >= 1;

  return (
    <div style={{
      marginBottom: 14,
      background: urgent
        ? "linear-gradient(135deg, #1a0a0a 0%, #2d1212 100%)"
        : "linear-gradient(135deg, #0a1a12 0%, #0d2318 100%)",
      border: `1px solid ${urgent ? "#7f1d1d" : "#14532d"}`,
      borderRadius: 16,
      padding: "14px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* subtle glow top */}
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%",
        background: urgent ? "#ef444422" : "#10b98122",
        filter: "blur(20px)",
        pointerEvents: "none",
      }}/>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          background: urgent ? "#ef444422" : "#10b98122",
          border: `1px solid ${urgent ? "#ef444444" : "#10b98144"}`,
          borderRadius: 12, padding: 9, flexShrink: 0,
        }}>
          {urgent ? <AlarmClock size={18} color="#ef4444"/> : <CheckCircle2 size={18} color="#10b981"/>}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: urgent ? "#fca5a5" : "#86efac" }}>
                {urgent
                  ? daysSinceLast === 1 ? "Nie dodałeś dziś transakcji!" : `Brak transakcji od ${daysSinceLast} dni!`
                  : `Dzisiaj: ${todayTxs.length} transakcj${todayTxs.length === 1 ? "a" : "e"}`
                }
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                {urgent
                  ? "Pamiętaj – każdy wydatek się liczy 💸"
                  : `Ostatnia: ${(todayTxs[0] ? todayTxs[0].desc : null) || "—"}`
                }
              </div>
            </div>
            <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#334155", padding: 2 }}>
              <X size={14}/>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            {/* Streak badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#1e2d45", borderRadius: 8, padding: "5px 10px" }}>
              <Flame size={12} color={streak >= 3 ? "#f97316" : "#475569"}/>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: streak >= 3 ? "#f97316" : "#64748b" }}>
                {streak} dzień z rzędu
              </span>
            </div>

            {/* Quick add button */}
            <button onClick={onAddTx} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: urgent ? "#7f1d1d" : "#14532d",
              border: `1px solid ${urgent ? "#ef444444" : "#22c55e44"}`,
              borderRadius: 8, padding: "5px 12px",
              cursor: "pointer", color: urgent ? "#fca5a5" : "#86efac",
              fontSize: 12, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              <PlusCircle size={12}/> Dodaj teraz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};




export { DailyReminder };
