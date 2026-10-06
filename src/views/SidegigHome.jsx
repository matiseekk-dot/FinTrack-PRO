import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Plus, Plane, SlidersHorizontal, AlertCircle } from "lucide-react";
import { fmtDisplay, fmtCurrency, todayLocal, monthName } from "../utils.js";
import { MODULES, SIDE_MODULES, getModule, isCapitalFlow, moduleLabel } from "../lib/modules.js";
import { groupTrips, tripCost, tripBudget } from "../lib/trips.js";
import { txAmountForDisplay, amountForDisplay, getDisplayCurrency } from "../lib/fx.js";
import { bettingStats } from "../lib/betting.js";
import { daysBetween, resellingStats } from "../lib/reselling.js";
import { collectionStats } from "../lib/collections.js";
import { isOverdue, freelanceStats } from "../lib/freelance.js";
import { moneyForDisplay } from "../lib/prefs.js";
import { subscriptionState, monthlyCost, daysUntil } from "../lib/subscriptions.js";
import { AmountModal } from "../components/AmountModal.jsx";
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
function SidegigHome({ transactions = [], hobbies = [], trips = [], portfolio = [], gigs = [], resaleItems = [], collectionItems = [], modules = [], prefs = {}, onPrefChange, subscriptions = [], month = null, onMonthChange, onEnableModule, onOpenModule, onAddTx, onOpenTrips, onManageModules }) {
  const lang = getLang();
  const now = new Date();
  const current = { y: now.getFullYear(), m: now.getMonth() };
  // Wybrany miesiąc trzyma App — zostaje po wejściu w moduł i powrocie, a moduły pokazują ten sam miesiąc
  const period = useMemo(() => {
    const [y, mm] = (month || ymKey(current.y, current.m)).split("-").map(Number);
    return { y, m: mm - 1 };
  }, [month]);
  const setPeriod = (next) => {
    const p = typeof next === "function" ? next(period) : next;
    if (onMonthChange) onMonthChange(ymKey(p.y, p.m));
  };
  const isCurrent = period.y === current.y && period.m === current.m;
  const [goalOpen, setGoalOpen] = useState(false);
  // Nowy moduł, którego użytkownik jeszcze nie włączył — jednorazowa karta „Nowość”
  const [promoHidden, setPromoHidden] = useState(() => { try { return localStorage.getItem("ft_promo_hobby") === "1"; } catch { return false; } });
  const showPromo = !promoHidden && !modules.includes("hobby") && !!onEnableModule;
  const hidePromo = () => { setPromoHidden(true); try { localStorage.setItem("ft_promo_hobby", "1"); } catch { /* bez pamięci */ } };

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
    for (const r of resolved) {
      if (r.ym !== ym) continue;
      if (perModule[r.mod]) {
        const p = perModule[r.mod];
        p.count += 1;
        if (r.capital) { p.invested -= r.amt; continue; } // wpłata/wypłata, nie wynik
        p.net += r.amt;
        if (r.amt > 0) p.income += r.amt; else p.expense += Math.abs(r.amt);
      }
    }
    const net = Object.values(perModule).reduce((s, p) => s + p.net, 0);
    return { perModule, net };
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
    if (modules.includes("betting") && prefs.betLossLimit) {
      const cur = today.slice(0, 7);
      const loss = Math.max(0, -resolved.filter(r => r.mod === "betting" && r.ym === cur).reduce((s, r) => s + r.amt, 0));
      const limit = moneyForDisplay(prefs.betLossLimit);
      if (limit > 0 && loss >= limit) out.push({ id: "betting", tone: "#f87171", text: t("home.att.limitOver", "Limit strat w Zakładach przekroczony: {loss} z {limit}").replace("{loss}", fmtDisplay(loss)).replace("{limit}", fmtDisplay(limit)) });
      else if (limit > 0 && loss >= limit * 0.8) out.push({ id: "betting", tone: "#fbbf24", text: t("home.att.limitNear", "Blisko limitu strat w Zakładach: {loss} z {limit}").replace("{loss}", fmtDisplay(loss)).replace("{limit}", fmtDisplay(limit)) });
    }
    if (modules.includes("betting")) {
      const open = transactions.filter(tx => tx.bet && tx.bet.status === "pending");
      if (open.length) out.push({ id: "betting", tone: "#a78bfa", text: t("home.att.openBets", "Kupony do rozliczenia: {n}").replace("{n}", open.length) });
    }
    if (modules.includes("hobby")) {
      for (const sub of subscriptions) {
        const st = subscriptionState(sub, today);
        const price = fmtCurrency(sub.amount, sub.currency || "PLN");
        if (st === "due") out.push({ id: "hobby", tone: "#f97316", text: t("home.att.subDue", "Do potwierdzenia: {name} {price}").replace("{name}", sub.name).replace("{price}", price) });
        else if (st === "soon" && sub.trial) {
          const d = daysUntil(sub.nextDate, today);
          out.push({ id: "hobby", tone: "#fbbf24", text: t("home.att.trialEnds", "{name}: okres próbny kończy się za {n} dni — anuluj, jeśli nie chcesz płacić").replace("{name}", sub.name).replace("{n}", d) });
        }
      }
    }
    if (modules.includes("reselling")) {
      const stale = resaleItems.filter(r => r.status !== "sold" && (daysBetween(r.buyDate || r.createdAt, today) || 0) > 30);
      if (stale.length) out.push({ id: "reselling", tone: "#ec4899", text: t("home.att.stale", "Na stanie dłużej niż 30 dni: {n}").replace("{n}", stale.length) });
    }
    return out;
  }, [modules, gigs, transactions, resaleItems, today, resolved, prefs.betLossLimit, subscriptions, getDisplayCurrency()]);

  // Dodatkowa informacja w wierszu modułu (ROI, stan magazynu, wartość kolekcji, zaległe)
  const extras = useMemo(() => {
    const x = {};
    const monthBets = resolved.filter(r => r.ym === ym && r.mod === "betting").map(r => r.tx);
    const bs = bettingStats(monthBets);
    if (bs.roi != null) x.betting = `ROI ${bs.roi > 0 ? "+" : ""}${(bs.roi * 100).toFixed(1)}%`;
    const inMonth = (d) => (d || "").startsWith(ym);
    const perHour = (v) => t("home.extra.perHour", "{amount}/h").replace("{amount}", fmtDisplay(v));
    const stock = resaleItems.filter(r => r.status !== "sold").length;
    const resaleHourly = resellingStats(resaleItems, [], inMonth).hourly;
    const resaleParts = [stock > 0 ? t("home.extra.stock", "{n} na stanie").replace("{n}", stock) : null, resaleHourly != null ? perHour(resaleHourly) : null].filter(Boolean);
    if (resaleParts.length) x.reselling = resaleParts.join(" · ");
    const cs = collectionStats(collectionItems, resaleItems).total;
    if (cs.value > 0) x.collections = t("home.extra.collection", "kolekcja {amount}").replace("{amount}", fmtDisplay(cs.value));
    const unpaid = gigs.filter(g => g.status === "unpaid").reduce((s, g) => s + amountForDisplay(g.amount, g.currency), 0);
    const gigHourly = freelanceStats(gigs, [], inMonth, today).hourly;
    const gigParts = [unpaid > 0 ? t("home.extra.unpaid", "czeka {amount}").replace("{amount}", fmtDisplay(unpaid)) : null, gigHourly != null ? perHour(gigHourly) : null].filter(Boolean);
    if (gigParts.length) x.freelance = gigParts.join(" · ");
    return x;
  }, [resolved, ym, resaleItems, collectionItems, gigs, today]);

  // Hobby i subskrypcje: wydane w wybranym miesiącu + koszt subskrypcji na miesiąc
  const hobbyCard = useMemo(() => {
    if (!modules.includes("hobby")) return null;
    const spent = resolved.reduce((s, r) => (r.ym === ym && r.mod === "hobby" && r.amt < 0) ? s - r.amt : s, 0);
    const perMonth = subscriptions.filter(x => x.active).reduce((s, x) => s + monthlyCost(x), 0);
    return { spent, perMonth };
  }, [modules, resolved, ym, subscriptions]);

  // Trips card: active trip first, otherwise the next upcoming one
  const tripCard = useMemo(() => {
    if (!modules.includes("trips") || trips.length === 0) return null;
    const g = groupTrips(trips, todayLocal());
    const trip = g.active[0] || g.upcoming[0];
    if (!trip) return null;
    return { trip, active: !!g.active[0], spent: tripCost(trip, transactions).myCost };
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
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{monthName(period.m)} {period.y}</span>
            {!isCurrent && (
              <button onClick={() => setPeriod(current)} style={{ background: "#10b98122", border: "1px solid #10b98155", borderRadius: 6, padding: "1px 7px", color: "#34d399", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {t("home.backToNow", "Dziś")}
              </button>
            )}
          </span>
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

        {/* Cel miesiąca */}
        {prefs.monthlyGoal ? (() => {
          const goal = moneyForDisplay(prefs.monthlyGoal);
          const done = Math.max(0, stats.net);
          const ratio = goal > 0 ? done / goal : 0;
          const reached = ratio >= 1;
          const daysLeft = new Date(period.y, period.m + 1, 0).getDate() - now.getDate();
          return (
            <button onClick={() => setGoalOpen(true)} aria-label={t("home.goal.edit", "Zmień cel miesiąca")} style={{ all: "unset", boxSizing: "border-box", display: "block", width: "100%", cursor: "pointer", marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{t("home.goal.label", "Cel miesiąca")}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: reached ? "#34d399" : "#e2e8f0" }}>
                  {fmtDisplay(done)} / {fmtDisplay(goal)}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "#060b14", marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", borderRadius: 4, background: BRAND, transition: "width 0.4s ease" }}/>
              </div>
              <div style={{ fontSize: 11, color: reached ? "#34d399" : "#64748b", marginTop: 5 }}>
                {reached
                  ? t("home.goal.reached", "Cel osiągnięty — brawo!")
                  : isCurrent && daysLeft > 0
                    ? t("home.goal.leftDays", "Brakuje {amount} · {days} dni do końca miesiąca").replace("{amount}", fmtDisplay(goal - done)).replace("{days}", daysLeft)
                    : t("home.goal.left", "Brakuje {amount}").replace("{amount}", fmtDisplay(goal - done))}
              </div>
            </button>
          );
        })() : isCurrent && (
          <button onClick={() => setGoalOpen(true)} style={{ width: "100%", marginTop: 12, background: "none", border: "1px dashed #10b98155", borderRadius: 10, padding: 8, color: "#34d399", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            + {t("home.goal.set", "Ustaw cel na miesiąc")}
          </button>
        )}

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

      {/* NOWOŚĆ: moduł Hobby i subskrypcje */}
      {showPromo && (
        <div style={{ background: MODULES.hobby.color + "12", border: `1px solid ${MODULES.hobby.color}55`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: MODULES.hobby.color + "22", display: "grid", placeItems: "center" }}>
              <MODULES.hobby.icon size={16} color={MODULES.hobby.color}/>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: MODULES.hobby.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("home.promo.new", "Nowość")}</span>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginTop: 1 }}>{moduleLabel("hobby", lang)}</span>
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: "8px 0 12px" }}>
            {t("home.promo.hobby", "Netflix, Spotify, AI, siłownia, koncerty — przypomnimy o płatnościach i końcu okresu próbnego. Osobno od dochodu pobocznego.")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { hidePromo(); onEnableModule("hobby"); }} style={{ flex: 1, background: BRAND, border: "none", borderRadius: 10, padding: "9px 0", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {t("home.promo.enable", "Włącz")}
            </button>
            <button onClick={hidePromo} style={{ flex: 1, background: "none", border: "1px solid #1a2744", borderRadius: 10, padding: "9px 0", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {t("home.promo.later", "Nie teraz")}
            </button>
          </div>
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
      {hobbyCard && (
        <>
          <div style={{ ...sectionLbl, margin: "10px 4px 0" }}>{moduleLabel("hobby", lang)}</div>
          <button onClick={() => onOpenModule && onOpenModule("hobby")} style={rowBtn}>
            <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: MODULES.hobby.color + "22", border: `1px solid ${MODULES.hobby.color}55`, display: "grid", placeItems: "center" }}>
              <MODULES.hobby.icon size={17} color={MODULES.hobby.color}/>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{t("home.hobbySpent", "Wydane na hobby")}</span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {t("home.hobbySubs", "subskrypcje {amount}/mies. · nie wlicza się do dochodu").replace("{amount}", fmtDisplay(hobbyCard.perMonth))}
              </span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#f87171", flexShrink: 0 }}>
              −{fmtDisplay(hobbyCard.spent)}
            </span>
            <Arrow size={14} color="#334155"/>
          </button>
        </>
      )}

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
                {tripBudget(tripCard.trip) > 0 && ` · ${t("trips.budget", "Budżet")} ${fmtDisplay(tripBudget(tripCard.trip))}`}
              </span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#cbd5e1", flexShrink: 0 }}>
              {fmtDisplay(tripCard.spent)}
            </span>
            <Arrow size={14} color="#334155"/>
          </button>
        </>
      )}

      {goalOpen && (
        <AmountModal title={t("home.goal.modalTitle", "Cel na miesiąc")}
          desc={t("home.goal.desc", "Ile chcesz zarabiać na boku co miesiąc? Na Starcie zobaczysz, ile już masz i ile brakuje.")}
          label={t("home.goal.amount", "Dochód netto na miesiąc")} value={prefs.monthlyGoal || null}
          onSave={(m) => onPrefChange && onPrefChange("monthlyGoal", m)} onClear={() => onPrefChange && onPrefChange("monthlyGoal", null)}
          onClose={() => setGoalOpen(false)}/>
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
