import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft, ChevronRight,
  Home, List, PiggyBank, BarChart2, Settings, ArrowUpRight, ArrowDownLeft,
  CreditCard, Briefcase, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Eye, EyeOff, Edit2, Trash2, Check,
  Bell, BellOff, CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
  ClipboardList, RefreshCw, AlarmClock, Copy
} from "lucide-react";
import { Card, Badge } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel, buildHistData } from "../utils.js";
import { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats, INITIAL_TEMPLATES } from "../constants.js";
function MonthComparison({ transactions, month }) {
  const [cmpMonth, setCmpMonth] = useState(month > 0 ? month - 1 : 0);

  const cmpKey = `${new Date().getFullYear()}-${String(cmpMonth+1).padStart(2,"0")}`;
  const curKey = `${new Date().getFullYear()}-${String(month+1).padStart(2,"0")}`;

  const cmpTx  = transactions.filter(t => t.date.startsWith(cmpKey) && t.cat !== "inne");
  const curTx  = transactions.filter(t => t.date.startsWith(curKey) && t.cat !== "inne");

  const cmpExp = cmpTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const curExp = curTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const cmpInc = cmpTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
  const curInc = curTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);

  const catMap = {};
  [...cmpTx, ...curTx].filter(t => t.amount < 0).forEach(t => {
    if (!catMap[t.cat]) catMap[t.cat] = { cmp: 0, cur: 0 };
    if (t.date.startsWith(cmpKey)) catMap[t.cat].cmp += Math.abs(t.amount);
    else catMap[t.cat].cur += Math.abs(t.amount);
  });
  const catRows = Object.entries(catMap)
    .map(([cat, d]) => ({ cat, ...d, diff: d.cur - d.cmp }))
    .filter(r => r.cur > 0 || r.cmp > 0)
    .sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
        📊 Porównanie miesięcy
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: "#475569", flexShrink: 0 }}>Porównaj z:</span>
        <select value={cmpMonth} onChange={e => setCmpMonth(parseInt(e.target.value))}
          style={{ flex: 1, background: "#060b14", border: "1px solid #1a2744", borderRadius: 8,
            padding: "8px 12px", color: "#e2e8f0", fontSize: 14, outline: "none" }}>
          {MONTH_NAMES.map((m, i) => i !== month && (
            <option key={i} value={i}>{m} {new Date().getFullYear()}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Wydatki",   cur: curExp, cmp: cmpExp, isExp: true },
          { label: "Przychody", cur: curInc, cmp: cmpInc, isExp: false },
        ].map(({ label, cur, cmp, isExp }) => {
          const diff = cur - cmp;
          const good = isExp ? diff < 0 : diff > 0;
          return (
            <div key={label} style={{ background: "#060b14", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{fmt(cur)}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{MONTHS[cmpMonth]}: {fmt(cmp)}</div>
              {diff !== 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: good ? "#10b981" : "#ef4444" }}>
                  {diff > 0 ? "▲" : "▼"} {fmt(Math.abs(diff))} {good ? "" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {catRows.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Zmiany per kategoria</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {catRows.slice(0, 8).map(row => {
              const cat  = getCat(row.cat);
              const Icon = cat.icon;
              return (
                <div key={row.cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: cat.color+"22", borderRadius: 8, padding: 6, flexShrink: 0 }}>
                    <Icon size={12} color={cat.color}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{cat.label}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>
                      {MONTHS[cmpMonth]}: {fmt(row.cmp)} → {MONTHS[month]}: {fmt(row.cur)}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                    color: row.diff > 0 ? "#ef4444" : "#10b981", flexShrink: 0 }}>
                    {row.diff > 0 ? "+" : ""}{fmt(row.diff)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
};

function TrendKategorii({ transactions, month, cycleDay }) {
  const [trendCat, setTrendCat] = useState("jedzenie");
  const trendCats = ["jedzenie","transport","zakupy","rozrywka","rachunki","bukmacher"];

  const cats6 = [-5,-4,-3,-2,-1,0].map(offset => {
    const m = ((month + 12 + offset) % 12);
    const tx = cycleTxs(transactions, m, cycleDay);
    const val = tx.filter(t => t.cat === trendCat && t.amount < 0)
                  .reduce((s,t) => s + Math.abs(t.amount), 0);
    return { m: MONTHS[m], val };
  });
  const maxVal = Math.max(...cats6.map(d => d.val), 1);

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 10 }}>Trend kategorii · 6 miesiecy</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14,
        scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {trendCats.map(c => {
          const cat = getCat(c);
          return (
            <button key={c} onClick={() => setTrendCat(c)} style={{
              padding: "5px 10px", borderRadius: 16, cursor: "pointer",
              background: trendCat === c ? cat.color + "33" : "#060b14",
              border: "1px solid " + (trendCat === c ? cat.color : "#1a2744"),
              color: trendCat === c ? cat.color : "#475569",
              fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
            }}>{cat.label}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
        {cats6.map(({ m, val }, i) => {
          const pct = (val / maxVal) * 100;
          const isLast = i === cats6.length - 1;
          const color = getCat(trendCat).color;
          return (
            <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 9, color: isLast ? color : "#334155",
                fontFamily: "'DM Mono', monospace", fontWeight: isLast ? 700 : 400 }}>
                {val > 0 ? fmtShort(val) : ""}
              </div>
              <div style={{ width: "100%", borderRadius: "4px 4px 0 0",
                height: Math.max(pct * 0.6 + 4, val > 0 ? 8 : 2) + "px",
                background: isLast ? color : color + "55",
                transition: "height 0.4s ease" }}/>
              <div style={{ fontSize: 9, color: isLast ? "#e2e8f0" : "#475569" }}>{m}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

function AnalyticsView({ transactions, payments, paid, month, cycleDay = 1, partnerName = "Partner" }) {
  if (transactions.length === 0) return (
    <div style={{ padding: "0 16px 100px", textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>Brak danych do analizy</div>
      <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
        Dodaj kilka transakcji żeby zobaczyć wykresy, rankingi i trendy wydatków.
      </div>
    </div>
  );
  const [activeView, setActiveView] = useState("month"); // "month" | "period"
  const [period, setPeriod]         = useState("month"); // month|quarter|half|year
  const [groupBy, setGroupBy]       = useState("cat");   // cat | place
  const [sortBy, setSortBy]         = useState("total"); // total | count | avg

  //    Period filter                                                          
  const getPeriodTx = () => {
    const now   = new Date();
    const year  = now.getFullYear();
    const mo    = now.getMonth(); // 0-based
    let from, to;
    if (period === "month") {
      from = `${year}-${String(mo+1).padStart(2,"0")}-01`;
      to   = `${year}-${String(mo+1).padStart(2,"0")}-31`;
    } else if (period === "quarter") {
      const q = Math.floor(mo / 3);
      from = `${year}-${String(q*3+1).padStart(2,"0")}-01`;
      to   = `${year}-${String(Math.min(q*3+3,12)).padStart(2,"0")}-31`;
    } else if (period === "half") {
      from = mo < 6 ? `${year}-01-01` : `${year}-07-01`;
      to   = mo < 6 ? `${year}-06-30` : `${year}-12-31`;
    } else {
      from = `${year}-01-01`;
      to   = `${year}-12-31`;
    }
    return transactions.filter(t => t.date >= from && t.date <= to && t.cat !== "inne");
  };

  const periodTx      = useMemo(getPeriodTx, [transactions, period]);
  const periodExp     = periodTx.filter(t => t.amount < 0);
  const periodInc     = periodTx.filter(t => t.amount > 0);
  const periodTotal   = periodExp.reduce((s,t) => s + Math.abs(t.amount), 0);
  const periodIncTotal= periodInc.reduce((s,t) => s + t.amount, 0);

  // Group by category or place (desc)
  const groupedData = useMemo(() => {
    const map = {};
    periodExp.forEach(t => {
      const key = groupBy === "cat" ? t.cat : t.desc.trim();
      if (!map[key]) map[key] = { total: 0, count: 0, cat: t.cat };
      map[key].total += Math.abs(t.amount);
      map[key].count += 1;
    });
    return Object.entries(map).map(([key, d]) => ({
      key,
      total: d.total,
      count: d.count,
      avg:   d.total / d.count,
      cat:   d.cat,
    })).sort((a,b) => {
      if (sortBy === "count") return b.count - a.count;
      if (sortBy === "avg")   return b.avg - a.avg;
      return b.total - a.total;
    });
  }, [periodExp, groupBy, sortBy]);

  const PERIOD_LABELS = { month: "Miesiąc", quarter: "Kwartał", half: "Półrocze", year: "Rok" };
  const maxVal = (groupedData[0] ? groupedData[0].total : null) || 1;

  const monthTx = cycleTxs(transactions, month, cycleDay);
  const expense = monthTx.filter(t => t.amount < 0 && t.cat !== "inne");
  const income  = monthTx.filter(t => t.amount > 0 && t.cat !== "inne");

  const catData = useMemo(() => {
    const map = {};
    expense.forEach(t => { map[t.cat] = (map[t.cat] || 0) + Math.abs(t.amount); });
    return Object.entries(map).map(([cat, val]) => ({ cat, val, ...getCat(cat) })).sort((a,b) => b.val - a.val);
  }, [expense]);

  const totalExp = expense.reduce((s,t) => s + Math.abs(t.amount), 0);
  const totalInc = income.reduce((s,t) => s + t.amount, 0);
  const savingsRate = totalInc > 0 ? ((totalInc - totalExp) / totalInc * 100) : 0;

  const dayData = useMemo(() => {
    const map = {};
    expense.forEach(t => {
      const d = t.date.split("-")[2];
      map[d] = (map[d] || 0) + Math.abs(t.amount);
    });
    return Object.entries(map).map(([d, v]) => ({ d, v })).sort((a,b) => parseInt(a.d)-parseInt(b.d));
  }, [expense]);

  return (
    <div style={{ padding: "0 16px 100px" }}>

      {/* View switcher */}
      <div style={{ display: "flex", gap: 8, paddingTop: 8, paddingBottom: 14 }}>
        {[["month","Biezacy"],["period","Okresy"]].map(([v,l]) => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
            fontWeight: 700, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
            background: activeView === v ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#0f1825",
            border: activeView === v ? "1px solid #2563eb" : "1px solid #1a2744",
            color: activeView === v ? "white" : "#475569",
          }}>{l}</button>
        ))}
      </div>

      {/* Okresy view */}
      {activeView === "period" && (
        <div>
          {/* Period selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[["month","Miesiac"],["quarter","Kwartal"],["half","Polrocze"],["year","Rok"]].map(([v,l]) => (
              <button key={v} onClick={() => setPeriod(v)} style={{
                flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
                fontWeight: 700, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif",
                background: period === v ? "#1e3a5f" : "#060b14",
                border: period === v ? "1px solid #2563eb" : "1px solid #1a2744",
                color: period === v ? "#60a5fa" : "#475569",
              }}>{l}</button>
            ))}
          </div>

          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[
              { label: "Wydatki",   val: periodTotal,                color: "#ef4444" },
              { label: "Wplywy",    val: periodIncTotal,             color: "#10b981" },
              { label: "Bilans",    val: periodIncTotal-periodTotal, color: periodIncTotal-periodTotal >= 0 ? "#10b981" : "#ef4444" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "#0f1825", border: "1px solid #1a2744",
                borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700,
                  textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                  fontWeight: 700, color }}>{val >= 0 ? "" : "-"}{fmt(Math.abs(val))}</div>
              </div>
            ))}
          </div>

          {/* Group + sort */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Grupuj po</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["cat","Kategorii"],["place","Miejscu"]].map(([v,l]) => (
                  <button key={v} onClick={() => setGroupBy(v)} style={{
                    flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer",
                    fontSize: 11, fontWeight: 700,
                    background: groupBy === v ? "#1e3a5f" : "#060b14",
                    border: groupBy === v ? "1px solid #2563eb" : "1px solid #1a2744",
                    color: groupBy === v ? "#60a5fa" : "#475569",
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Sortuj</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["total","Kwota"],["count","Ilosc"],["avg","Sr."]].map(([v,l]) => (
                  <button key={v} onClick={() => setSortBy(v)} style={{
                    flex: 1, padding: "7px 2px", borderRadius: 8, cursor: "pointer",
                    fontSize: 10, fontWeight: 700,
                    background: sortBy === v ? "#1e3a5f" : "#060b14",
                    border: sortBy === v ? "1px solid #2563eb" : "1px solid #1a2744",
                    color: sortBy === v ? "#60a5fa" : "#475569",
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Ranked list */}
          <Card>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              {groupBy === "cat" ? "Kategorie" : "Miejsca"}
              <span style={{ color: "#334155", fontWeight: 400, marginLeft: 6 }}>({groupedData.length})</span>
            </div>
            {groupedData.length === 0 && (
              <div style={{ fontSize: 13, color: "#334155", textAlign: "center", padding: 16 }}>
                Brak danych dla wybranego okresu
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groupedData.slice(0, 20).map((row, i) => {
                const cat  = getCat(row.cat);
                const Icon = cat.icon;
                const pct  = (row.total / maxVal) * 100;
                return (
                  <div key={row.key}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: "#334155", fontFamily: "'DM Mono', monospace",
                          width: 16, flexShrink: 0 }}>{i+1}</span>
                        {groupBy === "cat" && (
                          <div style={{ background: cat.color+"22", borderRadius: 7, padding: 5, flexShrink: 0 }}>
                            <Icon size={12} color={cat.color}/>
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {groupBy === "cat" ? cat.label : row.key}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569" }}>
                            {row.count}x · sr. {fmt(row.avg)}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14,
                          fontWeight: 700, color: groupBy === "cat" ? cat.color : "#e2e8f0" }}>
                          {fmt(row.total)}
                        </div>
                        <div style={{ fontSize: 10, color: "#334155" }}>
                          {(row.total / periodTotal * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    <div style={{ background: "#0f1825", borderRadius: 4, height: 4 }}>
                      <div style={{ width: pct + "%", height: "100%", borderRadius: 4,
                        background: groupBy === "cat" ? cat.color : "#3b82f6",
                        opacity: 0.8 }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Biezacy miesiac view */}
      {activeView === "month" && <div>

      <div style={{ paddingTop: 8, paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Analityka · {cycleDay > 1 ? fmtCycleLabel(month, cycleDay) : MONTH_NAMES[month]}</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Przychody", val: fmt(totalInc), color: "#10b981" },
          { label: "Wydatki",   val: fmt(totalExp), color: "#ef4444" },
          { label: "Bilans",    val: fmt(totalInc - totalExp, true), color: totalInc >= totalExp ? "#10b981" : "#ef4444" },
          { label: "Stopa oszcz.", val: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? "#10b981" : "#f59e0b" },
        ].map(({ label, val, color }) => (
          <Card key={label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, color, marginTop: 6 }}>{val}</div>
          </Card>
        ))}
      </div>

      {/* Daily spending */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Wydatki dzienne</div>
          <div style={{ fontSize: 11, color: "#334155" }}>
            <span style={{ color: "#10b981" }}>&#9632;</span> ok  <span style={{ color: "#f59e0b" }}>&#9632;</span> duzo  <span style={{ color: "#ef4444" }}>&#9632;</span> bardzo duzo
          </div>
        </div>
        {(() => {
          const avgDaily = dayData.length > 0 ? dayData.reduce((s,d) => s+d.v, 0) / dayData.length : 0;
          const maxVal   = dayData.length > 0 ? Math.max(...dayData.map(d => d.v)) : 1;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {dayData.map(({ d, v }) => {
                const pct   = (v / maxVal) * 100;
                const color = v > avgDaily * 2 ? "#ef4444" : v > avgDaily * 1.3 ? "#f59e0b" : "#10b981";
                return (
                  <div key={d} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "#475569", fontFamily: "'DM Mono', monospace", width: 20, flexShrink: 0, textAlign: "right" }}>{d}</div>
                    <div style={{ flex: 1, background: "#060b14", borderRadius: 4, height: 20, overflow: "hidden" }}>
                      <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 4,
                        display: "flex", alignItems: "center", paddingLeft: 6, minWidth: v > 0 ? 2 : 0,
                        transition: "width 0.4s ease" }}>
                        {pct > 25 && <span style={{ fontSize: 10, color: "white", fontFamily: "'DM Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(v)}</span>}
                      </div>
                    </div>
                    {pct <= 25 && v > 0 && <div style={{ fontSize: 10, color, fontFamily: "'DM Mono', monospace", width: 70, flexShrink: 0 }}>{fmt(v)}</div>}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {/* Category list with percentages */}
      <Card>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Ranking wydatków</div>
        {catData.map(({ cat, val, label, color, icon: Icon }, i) => {
          const pct = totalExp > 0 ? (val / totalExp * 100) : 0;
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < catData.length-1 ? "1px solid #0f1a2e" : "none" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#334155", width: 20, textAlign: "center" }}>#{i+1}</div>
              <div style={{ background: color + "1a", borderRadius: 8, padding: 7 }}><Icon size={13} color={color}/></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ background: "#060b14", borderRadius: 3, height: 4 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }}/>
                </div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#94a3b8", width: 90, textAlign: "right" }}>{fmt(val)}</div>
            </div>
          );
        })}
      </Card>

      {/* Per-sklep / per-miejsce */}
      {(() => {
        const shopMap = {};
        const skipCats = ["inne", "inwestycje", "przychód", "sprzedaż", "dodatkowe", "bukmacherka"];
        transactions
          .filter(t => t.amount < 0 && !skipCats.includes(t.cat))
          .forEach(t => {
            const key = t.desc.trim();
            if (!shopMap[key]) shopMap[key] = { count: 0, total: 0, cat: t.cat };
            shopMap[key].count++;
            shopMap[key].total += Math.abs(t.amount);
          });
        const shops = Object.entries(shopMap)
          .filter(([,d]) => d.count >= 1)
          .sort((a,b) => b[1].total - a[1].total)
          .slice(0, 15);
        if (shops.length === 0) return null;
        const maxVal = shops[0][1].total;
        return (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>🏪 Wydatki per miejsce</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shops.map(([name, data]) => {
                const cat   = getCat(data.cat);
                const Icon  = cat.icon;
                const pct   = (data.total / maxVal) * 100;
                return (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div style={{ background: cat.color+"22", borderRadius: 8, padding: 5, flexShrink: 0 }}>
                          <Icon size={12} color={cat.color}/>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        <span style={{ fontSize: 10, color: "#334155", flexShrink: 0 }}>×{data.count}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: cat.color, flexShrink: 0, marginLeft: 8 }}>{fmt(data.total)}</span>
                    </div>
                    <div style={{ background: "#0f1825", borderRadius: 3, height: 3 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: cat.color, borderRadius: 3, opacity: 0.7 }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* Por wnanie miesi cy */}
      <TrendKategorii transactions={transactions} month={month} cycleDay={cycleDay}/>

      <MonthComparison transactions={transactions} month={month}/>

      {/* Rozliczenie z King  */}
      {(() => {
        const monthKey    = `${new Date().getFullYear()}-${String(month+1).padStart(2,"0")}`;
        const sharedItems = (payments||[]).filter(p => {
          if (!p.shared) return false;
          if (p.freq === "weekly" || p.freq === "daily") return false;
          if (p.freq === "bimonthly") {
            const startM = p.startMonth || new Date().getMonth();
            if (Math.abs(month - startM) % 2 !== 0) return false;
          }
          return true;
        });
        if (sharedItems.length === 0) return (
          <Card style={{ marginTop: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{`👫 Rozliczenie z ${partnerName}`}</div>
            <div style={{ fontSize: 13, color: "#334155", textAlign: "center", padding: "12px 0" }}>
              {`Brak wspólnych rachunków — zaznacz „Wspólne z ${partnerName}" w Płatnościach`}
            </div>
          </Card>
        );

        const totalShared = sharedItems.reduce((s, x) => s + Math.abs(x.amount), 0);
        const halfTotal   = totalShared / 2;
        const paidAmt     = sharedItems
          .filter(item => !!(paid||{})[`${item.id}_${monthKey}`])
          .reduce((s, x) => s + Math.abs(x.amount), 0);

        return (
          <Card style={{ marginTop: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              {`👫 Rozliczenie z ${partnerName} · ${MONTH_NAMES[month]}`}
            </div>

            {/* Shared items list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {sharedItems.map(item => {
                const isPd = !!(paid||{})[`${item.id}_${monthKey}`];
                return (
                  <div key={item.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 12px",
                    background: isPd ? "#0a1410" : "#060b14",
                    borderRadius: 10, border: `1px solid ${isPd ? "#16a34a33" : "#1a2744"}`,
                  }}>
                    <div>
                      <span style={{ fontSize: 13, color: isPd ? "#475569" : "#e2e8f0",
                        textDecoration: isPd ? "line-through" : "none" }}>{item.name}</span>
                      {isPd && <span style={{ fontSize: 10, color: "#10b981", marginLeft: 8 }}></span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                        color: isPd ? "#334155" : "#e2e8f0" }}>{fmt(Math.abs(item.amount))}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>
                        po {fmt(Math.abs(item.amount) / 2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 1, background: "#1a2744", marginBottom: 14 }}/>

            {/* Summary grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: paidAmt > 0 ? 10 : 0 }}>
              {[
                { label: "Razem", val: totalShared, color: "#e2e8f0" },
                { label: "Twoja połowa", val: halfTotal, color: "#60a5fa" },
                { label: `Połowa ${partnerName}`, val: halfTotal, color: "#f59e0b" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: "#060b14", borderRadius: 10,
                  padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14,
                    fontWeight: 700, color }}>{fmt(val)}</div>
                </div>
              ))}
            </div>

            {paidAmt > 0 && (
              <div style={{ padding: "10px 12px", background: "#0a1e12",
                border: "1px solid #16a34a22", borderRadius: 8,
                display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#475569" }}>Zapłacono: <span style={{ color: "#10b981",
                  fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(paidAmt)}</span></span>
                <span style={{ color: "#475569" }}>Zostało: <span style={{ color: "#f59e0b",
                  fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(totalShared - paidAmt)}</span></span>
              </div>
            )}
          </Card>
        );
      })()}

      </div>}

    </div>
  );
};

//    MAIN APP                                                                  

export { AnalyticsView };
