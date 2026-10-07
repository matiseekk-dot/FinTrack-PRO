import { useState, useMemo } from "react";
import {
  Heart, Plus, ChevronRight, ChevronLeft, Edit2, Trash2,
  Sparkles, AlertCircle, TrendingUp,
} from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Stat, MiniStat, iconBtn, YoYBars, ColorPicker } from "../components/PlansShared.jsx";
import { fmtDisplay as fmt, fmtShort, cycleTxs } from "../utils.js"; // v2.2.0: kwoty w walucie głównej
import {
  pickHobbyColor, DEFAULT_HOBBY_COLORS, getAllHobbyTransactions, getHobbyStats
} from "../lib/hobby.js";
import { t } from "../i18n.js";

// Szczegóły wydatków kolekcji (zakładka „Wydatki” w ekranie Kolekcji) i formularz kolekcji.
// Lista hobby z dawnych Planów została zastąpiona ekranem Kolekcji (v2.2.0).

// embedded: osadzone w ekranie Kolekcji (v2.2.0) — bez własnego „Wstecz” i przycisków edycji
function HobbyDetails({ hobby, transactions, cyclePool, periodLabel = null, allCats, onBack, onEdit, onDelete, embedded = false }) {
  const stats = useMemo(() => getHobbyStats(transactions, hobby, { cycleTxs: cyclePool }),
    [transactions, hobby, cyclePool]);
  // v1.3.2: zamiast samych wydatków, pokazujemy mieszane (wydatki + przychody)
  // sortowane po dacie. Lista uwzględnia sprzedaż winyli/gier/książek.
  const txs = useMemo(() => getAllHobbyTransactions(transactions, hobby), [transactions, hobby]);

  // Czy hobby ma jakąkolwiek sprzedaż - decyduje czy pokazujemy income KPI/sekcje
  const hasIncome = stats.incomeAllTime > 0 || stats.incomeCount > 0;

  return (
    <div style={{ padding: embedded ? 0 : "0 16px 100px" }}>
      {!embedded && <button onClick={onBack} style={{
        background: "none", border: "none", color: "#a855f7", fontSize: 13,
        cursor: "pointer", padding: "0 0 12px 0", display: "flex", alignItems: "center", gap: 4,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <ChevronLeft size={14}/> {t("hobby.back", "Wstecz")}
      </button>}

      {/* Header card */}
      <Card style={{ padding: "18px 20px", marginBottom: 14, borderColor: hobby.color + "66" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: hobby.color + "22", border: `1px solid ${hobby.color}66`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Sparkles size={18} color={hobby.color}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#e2e8f0" }}>
                {hobby.name}
              </div>
            </div>
          </div>
          {!embedded && <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onEdit} title={t("common.edit", "Edytuj")} style={iconBtn}><Edit2 size={14}/></button>
            <button onClick={onDelete} title={t("common.delete", "Usuń")} style={{...iconBtn, color: "#ef4444"}}><Trash2 size={14}/></button>
          </div>}
        </div>

        {/* Wydatki — bez zmian */}
        <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 6 }}>
          {t("hobby.expensesLabel", "Wydatki")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Stat label={periodLabel || t("hobby.thisMonth", "Ten miesiąc")} value={fmt(periodLabel ? stats.thisCycle : stats.thisMonth)} color="#f43f5e"/>
          <Stat label={t("hobby.thisYearShort", "Ten rok")} value={fmt(stats.thisYear)} color="#8b5cf6"/>
          <Stat label={t("hobby.total", "Łącznie")}          value={fmt(stats.allTime)}     color="#64748b"/>
        </div>

        {/* v1.3.2: Przychody — pokazujemy tylko gdy hobby coś sprzedaje */}
        {hasIncome && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#10b981", textTransform: "uppercase",
              letterSpacing: "0.08em", marginTop: 14, marginBottom: 6 }}>
              💰 {t("hobby.incomeLabel", "Sprzedaż / przychody")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <Stat label={periodLabel || t("hobby.thisMonth", "Ten miesiąc")} value={fmt(periodLabel ? stats.incomeThisCycle : stats.incomeThisMonth)} color="#10b981"/>
              <Stat label={t("hobby.thisYearShort", "Ten rok")} value={fmt(stats.incomeThisYear)} color="#10b981"/>
              <Stat label={t("hobby.total", "Łącznie")}      value={fmt(stats.incomeAllTime)} color="#10b981"/>
            </div>

            {/* Netto: czy hobby kosztuje czy zarabia */}
            <div style={{
              marginTop: 8, padding: "10px 12px",
              background: stats.nettoAllTime >= 0 ? "#0a2818" : "#1a0808",
              border: stats.nettoAllTime >= 0 ? "1px solid #10b98144" : "1px solid #7f1d1d44",
              borderRadius: 10,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: stats.nettoAllTime >= 0 ? "#10b981" : "#ef4444" }}>
                  {t("hobby.netto", "Bilans netto (lifetime)")}
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>
                  {stats.nettoAllTime >= 0
                    ? t("hobby.nettoPositive", "Hobby się samofinansuje — sprzedaż pokrywa wydatki.")
                    : t("hobby.nettoNegative", "Realny koszt pasji po odliczeniu sprzedaży.")
                  }
                </div>
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 800,
                color: stats.nettoAllTime >= 0 ? "#10b981" : "#ef4444", flexShrink: 0,
              }}>
                {stats.nettoAllTime >= 0 ? "+" : ""}{fmt(stats.nettoAllTime)}
              </div>
            </div>
          </>
        )}

        {hobby.yearlyTarget > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {t("hobby.yearlyLimit", "Roczny limit")}: {fmt(hobby.yearlyTarget)}
              </span>
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                color: stats.thisYear > hobby.yearlyTarget ? "#ef4444" : "#10b981" }}>
                {Math.min(100, (stats.thisYear / hobby.yearlyTarget) * 100).toFixed(0)}% {t("hobby.used", "wykorzystane")}
              </span>
            </div>
            <div style={{ background: "#060b14", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{
                width: Math.min(100, (stats.thisYear / hobby.yearlyTarget) * 100) + "%",
                height: "100%",
                background: stats.thisYear > hobby.yearlyTarget ? "#ef4444" : hobby.color,
              }}/>
            </div>
          </div>
        )}
      </Card>

      {/* YoY trend */}
      {stats.yoyTrend.length >= 2 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp size={11}/> {t("hobby.yoy", "Rok-do-roku (wydatki)")}
          </div>
          <YoYBars data={stats.yoyTrend} color={hobby.color} showValues/>
        </Card>
      )}

      {/* v1.3.2: Top kupujący / źródła sprzedaży */}
      {hasIncome && Object.keys(stats.byIncomeMerchant).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            💰 {t("hobby.topBuyers", "Top kupujący / źródła sprzedaży")}
          </div>
          {Object.entries(stats.byIncomeMerchant)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([m, val]) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0",
                borderBottom: "1px solid #0d1628", fontSize: 12 }}>
                <span style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 10 }}>
                  {m}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#10b981", flexShrink: 0 }}>
                  +{fmt(val)}
                </span>
              </div>
            ))
          }
        </Card>
      )}

      {/* Top merchants */}
      {Object.keys(stats.byMerchant).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            {t("hobby.topMerchants", "Top sklepy / źródła (lifetime)")}
          </div>
          {Object.entries(stats.byMerchant)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([m, val]) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0",
                borderBottom: "1px solid #0d1628", fontSize: 12 }}>
                <span style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 10 }}>
                  {m}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: hobby.color, flexShrink: 0 }}>
                  {fmt(val)}
                </span>
              </div>
            ))
          }
        </Card>
      )}

      {/* Lista transakcji - v1.3.2 mieszane (wydatki + przychody, kolor wg znaku) */}
      {txs.length > 0 ? (
        <Card style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            display: "flex", justifyContent: "space-between" }}>
            <span>{t("hobby.txList", "Wpisy")}</span>
            <span style={{ color: "#475569" }}>{txs.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {txs.slice(0, 30).map(tx => {
              const isIncome = tx.amount > 0;
              return (
                <div key={tx.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "#060b14", borderRadius: 8,
                  borderLeft: isIncome ? "2px solid #10b98166" : "2px solid transparent",
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.desc || "—"}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                      {tx.date}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                    color: isIncome ? "#10b981" : "#ef4444", flexShrink: 0 }}>
                    {isIncome ? "+" : "−"}{fmt(Math.abs(tx.amount))}
                  </span>
                </div>
              );
            })}
            {txs.length > 30 && (
              <div style={{ fontSize: 11, color: "#475569", textAlign: "center", padding: "6px 0" }}>
                + {txs.length - 30} {t("hobby.olderTx", "starszych transakcji")}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#64748b", fontSize: 12,
          background: "#0a1120", borderRadius: 14, border: "1px dashed #1a2744" }}>
          {t("hobby.noMatch")}
          <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>
            {t("hobby.noMatchHint", "Sprawdź czy wybrałeś właściwe kategorie albo dodaj słowa kluczowe.")}
          </div>
        </div>
      )}
    </div>
  );
}

function HobbyModal({ hobby, setHobby, allCats, onClose, onSave }) {
  const keywordsStr = Array.isArray(hobby.keywords) ? hobby.keywords.join(", ") : "";

  return (
    <Modal open={true} onClose={onClose} title={hobby.id ? t("coll.editCollection", "Edytuj kolekcję") : t("coll.newCollection", "Nowa kolekcja")}>
      <Input
        label={t("hobby.name")}
        value={hobby.name}
        onChange={e => setHobby({ ...hobby, name: e.target.value })}
        placeholder={t("coll.namePh", "np. Winyle, Książki, Gry")}
      />

      {/* Color picker */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Kolor
        </div>
        <ColorPicker
          colors={DEFAULT_HOBBY_COLORS}
          value={hobby.color}
          onChange={c => setHobby({ ...hobby, color: c })}
        />
      </div>

      {/* Keywords */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          {t("hobby.keywords")}
        </div>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
          {t("hobby.keywordsHelp")}
        </div>
        <input
          type="text"
          value={keywordsStr}
          onChange={e => setHobby({ ...hobby,
            keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
          })}
          placeholder={t("coll.keywordsPh", "np. winyl, płyta, LP")}
          style={{
            width: "100%", padding: "10px 12px",
            background: "#060b14", border: "1px solid #1e3a5f",
            borderRadius: 10, color: "#e2e8f0", fontSize: 13,
            fontFamily: "'Space Grotesk', sans-serif", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Yearly target */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          {t("hobby.target")}
        </div>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
          {t("hobby.targetHelp")}
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={hobby.yearlyTarget}
          onChange={e => setHobby({ ...hobby, yearlyTarget: e.target.value })}
          placeholder="4000"
          style={{
            width: "100%", padding: "10px 12px",
            background: "#060b14", border: "1px solid #1e3a5f",
            borderRadius: 10, color: "#e2e8f0", fontSize: 13,
            fontFamily: "'DM Mono', monospace", boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onClose} style={{
          flex: 1, padding: 12, background: "#0a1120", border: "1px solid #1a2744",
          borderRadius: 10, color: "#94a3b8", fontWeight: 600, fontSize: 13, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {t("common.cancel")}
        </button>
        <button onClick={onSave} disabled={!hobby.name.trim()} style={{
          flex: 2, padding: 12,
          background: hobby.name.trim() ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "#1e3a5f",
          border: "none", borderRadius: 10, color: "white",
          fontWeight: 700, fontSize: 13,
          cursor: hobby.name.trim() ? "pointer" : "not-allowed",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

export { HobbyDetails, HobbyModal };
