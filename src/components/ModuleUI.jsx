import { ArrowLeft, Check, Plus } from "lucide-react";
import { t } from "../i18n.js";

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
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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

function PeriodChips({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {[["month", t("period.month", "Ten miesiąc")], ["year", t("period.year", "Ten rok")], ["all", t("period.all", "Wszystko")]].map(([id, label]) => (
        <Chip key={id} on={value === id} onClick={() => onChange(id)}>{label}</Chip>
      ))}
    </div>
  );
}

/** Czy data (YYYY-MM-DD) mieści się w okresie month | year | all względem dziś. */
function inPeriodFn(period, today) {
  return (date) => period === "all" || (date || "").startsWith(period === "year" ? today.slice(0, 4) : today.slice(0, 7));
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
  BRAND, card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, CheckRow, ModuleHeader, PeriodChips, EmptyCard, inPeriodFn, num,
};
