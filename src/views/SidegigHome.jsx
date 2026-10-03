import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Plus, Plane, Wallet, SlidersHorizontal, AlertCircle } from "lucide-react";
import { fmtDisplay, todayLocal, monthName } from "../utils.js";
import { MODULES, SIDE_MODULES, getModule, isCapitalFlow, moduleLabel } from "../lib/modules.js";
import { groupTrips, getTripSpending } from "../lib/trips.js";
import { txAmountForDisplay, amountForDisplay, getDisplayCurrency } from "../lib/fx.js";
import { bettingStats } from "../lib/betting.js";
import { daysBetween } from "../lib/reselling.js";
import { collectionStats } from "../lib/collections.js";
import { isOverdue } from "../lib/freelance.js";
import { positionValues } from "../lib/accountTypes.js";
import { t, getLang } from "../i18n.js";

const BRAND = "linear-gradient(135deg,#059669,#10b981)";

const ymKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const shiftMonth = ({ y, m }, delta) => {
  const d = new Date(y, m + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
};

/**
 * Sidegig home: one number (net side income for the month) and a row per enabled
 * side module. Personal spending and trips are shown as separate cards, outside the
 * side-income total, because they are not income streams.
 */
function SidegigHome({ transactions = [], hobbies = [], trips = [], portfolio = [], gigs = [], resaleItems = [], collectionItems = [], modules = [], onOpenModule, onAddTx, onOpenTrips, onOpenBudget, onManageModules }) {
  const lang = getLang();
  const now = new Date();
  const current = { y: now.getFullYear(), m: now.getMonth() };
  const [period, setPeriod] = useState(current);
  const isCurrent = period.y === current.y && period.m === current.m;

  const sideEnabled = SIDE_MODULES.filter(id => modules.includes(id));

  // Each transaction resolved once: module + YYYY-MM. Transfers (cat "inne") never count.
  const resolved = useMemo(() => transactions
    .filter(tx => tx && tx.date && tx.cat !== "inne")
    .map(tx => ({ tx, amt: txAmountForDisplay(tx), mod: getModule(tx, hobbies), ym: tx.date.slice(0, 7), capital: isCapitalFlow(tx) })),
  [transactions, hobbies, getDisplayCurrency()]);

  const netFor = (ym) => resolved.reduce((s, r) => (r.ym === ym && !r.capital && sideEnabled.includes(r.mod)) ? s + r.amt : s, 0);

  const ym = ymKey(period.y, period.m);
  const prevPeriod = shiftMonth(period, -1);
  const prevYm = ymKey(prevPeriod.y, prevPeriod.m);

  const stats = useMemo(() => {
    const perModule = {};
    for (const id of sideEnabled) perModule[id] = { net: 0, income: 0, expense: 0, count: 0, invested: 0 };
    let personalSpent = 0;
    for (const r of resolved) {
      if (r.ym !== ym) continue;
      if (perModule[r.mod]) {
        const p = perModule[r.mod];
        p.count += 1;
        if (r.capital) { p.invested -= r.amt; continue; } // wpłata/wypłata, nie wynik
        p.net += r.amt;
        if (r.amt > 0) p.income += r.amt; else p.expense += Math.abs(r.amt);
      } else if (r.mod === "personal" && r.amt < 0) {
        personalSpent += Math.abs(r.amt);
      }
    }
    const net = Object.values(perModule).reduce((s, p) => s + p.net, 0);
    return { perModule, net, personalSpent };
  }, [resolved, ym, sideEnabled.join(",")]);

  const prevNet = netFor(prevYm);
  const ytdNet = resolved.reduce((s, r) =>
    (r.ym.startsWith(String(period.y)) && r.ym <= ym && !r.capital && sideEnabled.includes(r.mod)) ? s + r.amt : s, 0);
  const everAnySide = resolved.some(r => sideEnabled.includes(r.mod));

  // Last 6 months of net side income for the mini chart
  const bars = Array.from({ length: 6 }, (_, i) => {
    const p = shiftMonth(period, i - 5);
    return { key: ymKey(p.y, p.m), label: monthName(p.m, "short").replace(".", ""), net: netFor(ymKey(p.y, p.m)) };
  });
  const maxAbs = Math.max(1, ...bars.map(b => Math.abs(b.net)));

  const trend = prevNet !== 0 ? ((stats.net - prevNet) / Math.abs(prevNet)) * 100 : null;

  // Rzeczy do zrobienia w modułach: zaległe faktury, otwarte kupony, długo leżący towar
  const today = todayLocal();
  const attention = useMemo(() => {
    const out = [];
    const sum = (list) => list.reduce((s, g) => s + amountForDisplay(g.amount, g.currency), 0);
    if (modules.includes("freelance")) {
      const unpaid = gigs.filter(g => g.status === "unpaid");
      const overdue = unpaid.filter(g => isOverdue(g, today));
      if (overdue.length) out.push({ id: "freelance", tone: "#f87171", text: t("home.att.overdue", "Faktury po terminie: {n} · {amount}").replace("{n}", overdue.length).replace("{amount}", fmtDisplay(sum(overdue))) });
      else if (unpaid.length) out.push({ id: "freelance", tone: "#fbbf24", text: t("home.att.unpaid", "Czeka na zapłatę: {n} · {amount}").replace("{n}", unpaid.length).replace("{amount}", fmtDisplay(sum(unpaid))) });
    }
    if (modules.includes("betting")) {
      const open = transactions.filter(tx => tx.bet && tx.bet.status === "pending");
      if (open.length) out.push({ id: "betting", tone: "#a78bfa", text: t("home.att.openBets", "Kupony do rozliczenia: {n}").replace("{n}", open.length) });
    }
    if (modules.includes("reselling")) {
      const stale = resaleItems.filter(r => r.status !== "sold" && (daysBetween(r.buyDate || r.createdAt, today) || 0) > 30);
      if (stale.length) out.push({ id: "reselling", tone: "#ec4899", text: t("home.att.stale", "Na stanie dłużej niż 30 dni: {n}").replace("{n}", stale.length) });
    }
    return out;
  }, [modules, gigs, transactions, resaleItems, today, getDisplayCurrency()]);

  // Dodatkowa informacja w wierszu modułu (ROI, stan magazynu, wartość kolekcji, zaległe)
  const extras = useMemo(() => {
    const x = {};
    const monthBets = resolved.filter(r => r.ym === ym && r.mod === "betting").map(r => r.tx);
    const bs = bettingStats(monthBets);
    if (bs.roi != null) x.betting = `ROI ${bs.roi > 0 ? "+" : ""}${(bs.roi * 100).toFixed(1)}%`;
    const stock = resaleItems.filter(r => r.status !== "sold").length;
    if (stock > 0) x.reselling = t("home.extra.stock", "{n} na stanie").replace("{n}", stock);
    const cs = collectionStats(collectionItems, resaleItems).total;
    if (cs.value > 0) x.collections = t("home.extra.collection", "kolekcja {amount}").replace("{amount}", fmtDisplay(cs.value));
    const unpaid = gigs.filter(g => g.status === "unpaid").reduce((s, g) => s + amountForDisplay(g.amount, g.currency), 0);
    if (unpaid > 0) x.freelance = t("home.extra.unpaid", "czeka {amount}").replace("{amount}", fmtDisplay(unpaid));
    return x;
  }, [resolved, ym, resaleItems, collectionItems, gigs]);

  // Trips card: active trip first, otherwise the next upcoming one
  const tripCard = useMemo(() => {
    if (!modules.includes("trips") || trips.length === 0) return null;
    const g = groupTrips(trips, todayLocal());
    const trip = g.active[0] || g.upcoming[0];
    if (!trip) return null;
    return { trip, active: !!g.active[0], spent: getTripSpending(transactions, trip.id).total };
  }, [modules, trips, transactions]);

  return (
    <div style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* HERO — net side income */}
      <div style={{
        background: "linear-gradient(135deg,#10b98114,#34d39908)",
        border: "1px solid #10b98147", borderRadius: 20, padding: "16px 18px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setPeriod(p => shiftMonth(p, -1))} aria-label={t("home.prevMonth", "Poprzedni miesiąc")} style={navBtn}><ChevronLeft size={14}/></button>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{monthName(period.m)} {period.y}</span>
          <button onClick={() => !isCurrent && setPeriod(p => shiftMonth(p, 1))} disabled={isCurrent} aria-label={t("home.nextMonth", "Następny miesiąc")} style={{ ...navBtn, opacity: isCurrent ? 0.3 : 1, cursor: isCurrent ? "default" : "pointer" }}><ChevronRight size={14}/></button>
        </div>
        <div style={lbl}>{t("home.netTitle", "Dochód poboczny netto")}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: stats.net >= 0 ? "#34d399" : "#f87171" }}>
            {fmtDisplay(stats.net, { showSign: true })}
          </span>
          {trend !== null && Math.abs(trend) >= 1 && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
              background: trend >= 0 ? "#10b98122" : "#ef444422", color: trend >= 0 ? "#34d399" : "#f87171" }}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))}%
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          {t("home.vsPrev", "Poprzedni miesiąc")} {fmtDisplay(prevNet, { showSign: true })} · {t("home.ytd", "Od początku roku")} {fmtDisplay(ytdNet, { showSign: true })}
        </div>

        {/* 6-month bars: positive above the baseline, negative below */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 6, height: 56, marginTop: 12 }}>
          {bars.map(b => {
            const h = Math.max(3, (Math.abs(b.net) / maxAbs) * 26);
            const isSel = b.key === ym;
            return (
              <div key={b.key} title={`${b.label}: ${fmtDisplay(b.net, { showSign: true })}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  {b.net > 0 && <div style={{ width: "100%", height: h, borderRadius: "3px 3px 0 0", background: "#10b981", opacity: isSel ? 1 : 0.4 }}/>}
                </div>
                <div style={{ width: "100%", height: 1, background: "#1e3a5f" }}/>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-start" }}>
                  {b.net < 0 && <div style={{ width: "100%", height: h, borderRadius: "0 0 3px 3px", background: "#ef4444", opacity: isSel ? 0.9 : 0.35 }}/>}
                </div>
                <span style={{ fontSize: 9, color: isSel ? "#cbd5e1" : "#475569", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* WYMAGA UWAGI */}
      {attention.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attention.map(a => (
            <button key={a.id + a.text} onClick={() => onOpenModule && onOpenModule(a.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, cursor: "pointer",
              background: a.tone + "12", border: `1px solid ${a.tone}44`, color: "#e2e8f0", fontFamily: "inherit", textAlign: "left",
            }}>
              <AlertCircle size={14} color={a.tone} style={{ flexShrink: 0 }}/>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{a.text}</span>
              <Arrow size={14} color="#475569"/>
            </button>
          ))}
        </div>
      )}

      {/* MODULE ROWS */}
      {sideEnabled.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 4px 0" }}>
          <span style={sectionLbl}>{t("home.modules", "Moduły")}</span>
          <button onClick={onManageModules} style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", padding: 4 }}>
            <SlidersHorizontal size={12}/> {t("home.manage", "Zarządzaj")}
          </button>
        </div>
      )}

      {sideEnabled.map(id => {
        const m = MODULES[id];
        const Icon = m.icon;
        const s = stats.perModule[id];
        let sub = s.count === 0
          ? t("home.noEntries", "Brak wpisów w tym miesiącu")
          : `${s.count} ${s.count === 1 ? t("home.entry", "wpis") : t("home.entries", "wpisy")} · ${[s.income > 0 && `+${fmtDisplay(s.income)}`, s.expense > 0 && `−${fmtDisplay(s.expense)}`].filter(Boolean).join(" / ")}`;
        // Inwestycje: wpłaty to nie strata. Pokazujemy je neutralnie, a po prawej wynik portfela.
        let right = s.count === 0 ? null : s.net;
        if (id === "investments") {
          const pnl = portfolio.reduce((sum, p) => sum + positionValues(p).pnlPLN, 0);
          const parts = [];
          if (s.invested > 0) parts.push(`${t("home.invested", "wpłacono")} ${fmtDisplay(s.invested)}`);
          else if (s.invested < 0) parts.push(`${t("home.withdrawn", "wypłacono")} ${fmtDisplay(-s.invested)}`);
          if (portfolio.length > 0) parts.push(t("home.portfolioResult", "wynik portfela"));
          if (parts.length) sub = parts.join(" · ");
          right = portfolio.length > 0 ? pnl : (s.net !== 0 ? s.net : null);
        }
        if (extras[id]) sub = s.count === 0 ? extras[id] : `${sub} · ${extras[id]}`;
        return (
          <button key={id} onClick={() => onOpenModule && onOpenModule(id)} style={rowBtn}>
            <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: m.color + "22", border: `1px solid ${m.color}55`, display: "grid", placeItems: "center" }}>
              <Icon size={17} color={m.color}/>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{moduleLabel(id, lang)}</span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, flexShrink: 0,
              color: right == null ? "#475569" : right >= 0 ? "#34d399" : "#f87171" }}>
              {right == null ? "—" : fmtDisplay(right, { showSign: true })}
            </span>
            <Arrow size={14} color="#334155"/>
          </button>
        );
      })}

      {/* EMPTY STATE — no side entries yet */}
      {!everAnySide && sideEnabled.length > 0 && (
        <div style={{ textAlign: "center", padding: "20px 16px", background: "#0a1120", border: "1px dashed #1a2744", borderRadius: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>{t("home.emptyTitle", "Zapisz pierwszy dochód poboczny")}</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55, marginBottom: 14 }}>
            {t("home.emptyDesc", "Sprzedaż na Vinted, zlecenie, wygrany kupon — dodaj wpis i wybierz moduł. Bilans policzy się sam.")}
          </div>
          <button onClick={onAddTx} style={{ background: BRAND, border: "none", borderRadius: 12, padding: "11px 20px", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={15}/> {t("home.addFirst", "Dodaj wpis")}
          </button>
        </div>
      )}

      {sideEnabled.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 16px", background: "#0a1120", border: "1px dashed #1a2744", borderRadius: 16, fontSize: 13, color: "#94a3b8", lineHeight: 1.55 }}>
          {t("home.noSideModules", "Nie masz włączonego żadnego modułu dochodu pobocznego.")}{" "}
          <button onClick={onManageModules} style={{ background: "none", border: "none", color: "#34d399", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 0 }}>
            {t("home.enableModules", "Włącz moduły")}
          </button>
        </div>
      )}

      {/* TRIPS — outside the side-income total */}
      {tripCard && (
        <>
          <div style={{ ...sectionLbl, margin: "10px 4px 0" }}>{t("home.trips", "Wyjazdy")}</div>
          <button onClick={onOpenTrips} style={rowBtn}>
            <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: (tripCard.trip.color || "#3b82f6") + "22", border: `1px solid ${(tripCard.trip.color || "#3b82f6")}55`, display: "grid", placeItems: "center" }}>
              <Plane size={17} color={tripCard.trip.color || "#3b82f6"}/>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tripCard.trip.name}</span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {tripCard.active ? t("home.tripActive", "Trwa teraz") : `${t("home.tripFrom", "Od")} ${tripCard.trip.dateFrom}`}
                {tripCard.trip.budget > 0 && ` · ${t("trips.budget", "Budżet")} ${fmtDisplay(tripCard.trip.budget)}`}
              </span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#cbd5e1", flexShrink: 0 }}>
              {fmtDisplay(tripCard.spent)}
            </span>
            <Arrow size={14} color="#334155"/>
          </button>
        </>
      )}

      {/* PERSONAL BUDGET — classic FinTrack, outside the side-income total */}
      {modules.includes("personal") && (
        <>
          <div style={{ ...sectionLbl, margin: "10px 4px 0" }}>{t("home.personal", "Wydatki osobiste")}</div>
          <button onClick={onOpenBudget} style={rowBtn}>
            <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "#64748b22", border: "1px solid #64748b55", display: "grid", placeItems: "center" }}>
              <Wallet size={17} color="#94a3b8"/>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{t("home.personalSpent", "Wydatki osobiste")}</span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{t("home.personalHint", "Nie wliczają się do dochodu pobocznego")}</span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#f87171", flexShrink: 0 }}>
              −{fmtDisplay(stats.personalSpent)}
            </span>
            <Arrow size={14} color="#334155"/>
          </button>
        </>
      )}
    </div>
  );
}

const lbl = { fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 };
const sectionLbl = { fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
const navBtn = { background: "#ffffff0a", border: "none", borderRadius: 7, padding: "4px 8px", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center" };
const rowBtn = {
  width: "100%", display: "flex", alignItems: "center", gap: 12,
  padding: "12px 14px", borderRadius: 14, cursor: "pointer",
  background: "#0d1628", border: "1px solid #1a2744",
  fontFamily: "'Space Grotesk', sans-serif", textAlign: "left",
};

export { SidegigHome };
