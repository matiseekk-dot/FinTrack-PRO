import { ArrowLeft, Check, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { t, getLang } from "../i18n.js";
import { monthName, todayLocal } from "../utils.js";

// Wspólne klocki ekranów modułów (Zakłady, Sprzedaż, Kolekcje, Freelance).

const BRAND = "linear-gradient(135deg,#059669,#10b981)";
const card = { background: "#0d1628", border: "1px solid #1a2744", borderRadius: 16 };
const heroCard = { ...card, padding: 16, background: "linear-gradient(135deg,#0d1628,#111827)" };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", margin: "22px 0 10px" };
const fieldLabel = { fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" };
const heroLabel = { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" };
const primaryBtn = { width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" };
const dangerBtn = { width: "100%", marginTop: 8, background: "none", border: "1px solid #7f1d1d", borderRadius: 12, padding: 12, color: "#f87171", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };

function heroValue(positive) {
  return { fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 800, color: positive ? "#34d399" : "#f87171", marginTop: 4, letterSpacing: "-0.02em" };
}

function actionBtn(color) {
  return {
    flex: 1, background: color + "18", border: `1px solid ${color}55`, color,
    borderRadius: 9, padding: "7px 2px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  };
}

function Chip({ on, color = "#10b981", onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: on ? color + "22" : "#0d1628", border: `1px solid ${on ? color : "#1a2744"}`,
      color: on ? color : "#64748b", borderRadius: 8, padding: "6px 10px", cursor: "pointer",
      fontSize: 12, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Stat({ label, value, color = "#e2e8f0" }) {
  // Duże kwoty („152 608,35 zł”) mieszczą się mniejszą czcionką zamiast urwać się wielokropkiem
  const len = String(value ?? "").length;
  const size = len > 15 ? 10.5 : len > 12 ? 11.5 : 13;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: size, fontWeight: 700, color, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

/** Własny checkbox — globalne style apki ukrywają natywny input[type=checkbox]. */
function CheckRow({ checked, onChange, children, style }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} style={{
      width: "100%", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, padding: "10px 12px",
      background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, cursor: "pointer", textAlign: "left",
      color: "#cbd5e1", fontSize: 12, lineHeight: 1.45, fontFamily: "inherit", ...style,
    }}>
      <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${checked ? "#10b981" : "#475569"}`, background: checked ? "#10b981" : "transparent", display: "grid", placeItems: "center" }}>
        {checked && <Check size={12} color="white" strokeWidth={3}/>}
      </span>
      <span>{children}</span>
    </button>
  );
}

/** Nagłówek ekranu modułu: wstecz · ikona · tytuł · przycisk dodawania. */
function ModuleHeader({ Icon, color, title, onBack, addLabel, onAdd, extra }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
      <button onClick={onBack} aria-label={t("common.back", "Wstecz")} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: 7, cursor: "pointer", color: "#94a3b8", display: "grid", placeItems: "center" }}>
        <ArrowLeft size={16}/>
      </button>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: color + "22", border: `1px solid ${color}55`, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon size={15} color={color}/>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
      {extra}
      {onAdd && (
        <button onClick={onAdd} style={{ background: BRAND, border: "none", borderRadius: 10, padding: "8px 12px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", flexShrink: 0 }}>
          <Plus size={14}/> {addLabel}
        </button>
      )}
    </div>
  );
}

/** "2026-10" przesunięte o delta miesięcy. */
function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Okres ekranu modułu: wybrany miesiąc (ten sam co na Starcie, ze strzałkami), jego rok
 * albo wszystko. month = "YYYY-MM"; bez onMonthChange — zawsze bieżący miesiąc.
 * monthOnly: tylko miesiąc ze strzałkami (bez roku i „Wszystko”).
 */
function PeriodChips({ value, onChange, month, onMonthChange, monthOnly = false }) {
  const cur = todayLocal().slice(0, 7);
  const ym = month || cur;
  const [y, m] = ym.split("-").map(Number);
  const arrow = (dir, disabled) => (
    <button type="button" disabled={disabled} onClick={() => onMonthChange && onMonthChange(shiftYm(ym, dir))}
      aria-label={dir < 0 ? t("home.prevMonth", "Poprzedni miesiąc") : t("home.nextMonth", "Następny miesiąc")}
      style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8, padding: "5px 6px", cursor: disabled ? "default" : "pointer", color: "#94a3b8", display: "grid", placeItems: "center", opacity: disabled ? 0.3 : 1 }}>
      {dir < 0 ? <ChevronLeft size={13}/> : <ChevronRight size={13}/>}
    </button>
  );
  const monthLabel = ym === cur ? t("period.month", "Ten miesiąc") : `${monthName(m - 1)} ${y}`;
  const yearLabel = String(y) === cur.slice(0, 4) ? t("period.year", "Ten rok") : String(y);
  const showArrows = !!onMonthChange && (monthOnly || value === "month");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
      {showArrows && arrow(-1, false)}
      <Chip on={monthOnly || value === "month"} onClick={() => onChange && onChange("month")}>{monthLabel}</Chip>
      {showArrows && arrow(1, ym >= cur)}
      {!monthOnly && <>
        <Chip on={value === "year"} onClick={() => onChange("year")}>{yearLabel}</Chip>
        <Chip on={value === "all"} onClick={() => onChange("all")}>{t("period.all", "Wszystko")}</Chip>
      </>}
    </div>
  );
}

/** Nazwa miesiąca w środku zdania: „październik 2026” (po angielsku i niemiecku z wielkiej litery). */
function monthInSentence(ym) {
  const [y, m] = ym.split("-").map(Number);
  const name = `${monthName(m - 1)} ${y}`;
  return ["en", "de"].includes(getLang()) ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

/** Wybrany miesiąc w środku zdania: „ten miesiąc” albo „październik 2026”. */
function periodInSentence(ym) {
  if (ym === todayLocal().slice(0, 7)) {
    const s = t("period.month", "Ten miesiąc");
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  return monthInSentence(ym);
}

/** Czy data (YYYY-MM-DD) mieści się w okresie month | year | all; ref = data albo "YYYY-MM". */
function inPeriodFn(period, ref) {
  return (date) => period === "all" || (date || "").startsWith(period === "year" ? ref.slice(0, 4) : ref.slice(0, 7));
}

function EmptyCard({ title, desc, cta, onCta }) {
  return (
    <div style={{ ...card, padding: "28px 20px", textAlign: "center", marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
      {cta && (
        <button onClick={onCta} style={{ marginTop: 16, background: BRAND, border: "none", borderRadius: 12, padding: "11px 18px", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + {cta}
        </button>
      )}
    </div>
  );
}

const num = (v) => parseFloat(String(v ?? "").replace(",", "."));

export {
  monthInSentence, periodInSentence,
  BRAND, card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, CheckRow, ModuleHeader, PeriodChips, EmptyCard, inPeriodFn, num,
};
