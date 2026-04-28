import { useState, useMemo } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { fmt, cycleTxs } from "../utils.js";
import { CATEGORIES, getCat, MONTH_NAMES } from "../constants.js";
import { t } from "../i18n.js";

/**
 * LimitsView - limity miesięczne dla kategorii. Wyciągnięte z GoalsView w v1.2.1
 * (audyt O3: GoalsView 1100 linii, dług techniczny). Logika identyczna.
 *
 * Limit = max kwota wydatków w cyklu rozliczeniowym dla danej kategorii.
 * Przekroczenie nie blokuje dodawania tx, tylko pokazuje czerwony bar (soft cap).
 */
function LimitsView({ budgets, setBudgets, transactions, allCats = [], month, cycleDay = 1 }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ cat: "bukmacher", limit: "" });

  const getLocalCat = (id) => {
    return (allCats || []).find(c => c.id === id) || getCat(id);
  };

  // Wydatki z bieżącego cyklu, pogrupowane po kat
  const monthTx = useMemo(
    () => cycleTxs(transactions || [], month, cycleDay).filter(t => t.amount < 0),
    [transactions, month, cycleDay]
  );

  const spentBycat = useMemo(() => {
    const m = {};
    monthTx.forEach(t => { m[t.cat] = (m[t.cat] || 0) + Math.abs(t.amount); });
    return m;
  }, [monthTx]);

  const addLimit = () => {
    if (!form.cat || !form.limit) return;
    const existing = (budgets || []).find(b => b.cat === form.cat);
    if (existing) {
      setBudgets(b => b.map(x => x.cat === form.cat ? { ...x, limit: parseFloat(form.limit) } : x));
    } else {
      setBudgets(b => [...(b || []), {
        cat: form.cat,
        limit: parseFloat(form.limit),
        color: getCat(form.cat).color,
      }]);
    }
    setForm({ cat: "bukmacher", limit: "" });
    setModal(false);
  };

  const deleteLimit = (cat) => setBudgets(b => b.filter(x => x.cat !== cat));

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {t("limits.title", "Limity miesięczne")} · {MONTH_NAMES[month]}
          </div>
          <div style={{ fontSize: 12, color: "#334155", marginTop: 3 }}>
            {t("limits.subtitle", "Ustaw max kwotę na kategorię")}
          </div>
        </div>
        <button onClick={() => setModal(true)} style={{
          background: "#1e3a5f", border: "1px solid #2563eb44",
          color: "#60a5fa", borderRadius: 10, padding: "8px 12px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          fontSize: 13, fontWeight: 600,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          <PlusCircle size={13}/> {t("limits.add", "Limit")}
        </button>
      </div>

      {(!budgets || budgets.length === 0) && (
        <div style={{
          background: "#0f1825", border: "1px solid #1a2744", borderRadius: 14,
          padding: "32px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚦</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#cbd5e1", marginBottom: 4 }}>
            {t("limits.empty", "Brak limitów")}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            {t("limits.emptyDesc", "Ustaw limit miesięczny dla kategorii którą chcesz kontrolować.")}
          </div>
          <button onClick={() => setModal(true)} style={{
            background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none",
            borderRadius: 10, padding: "9px 16px", color: "white",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <PlusCircle size={13}/> {t("limits.addFirst", "Dodaj limit")}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(budgets || []).map(b => {
          const spent  = spentBycat[b.cat] || 0;
          const pct    = b.limit > 0 ? Math.min(100, spent / b.limit * 100) : 0;
          const over   = spent > b.limit;
          const warn   = !over && pct >= 80;
          const cat    = getLocalCat(b.cat);
          const Icon   = cat.icon;
          const remain = b.limit - spent;

          return (
            <div key={b.cat} style={{
              background: over ? "linear-gradient(135deg,#1a0808,#200e0e)" : "#0f1825",
              border: `1px solid ${over ? "#7f1d1d" : warn ? "#78350f" : "#1a2744"}`,
              borderRadius: 14, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: cat.color + "22", borderRadius: 10, padding: 8 }}>
                    {Icon && <Icon size={14} color={cat.color}/>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
                      {cat.label}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 2,
                      color: over ? "#ef4444" : warn ? "#f59e0b" : "#475569" }}>
                      {over
                        ? t("limits.over", "! Przekroczono o ") + fmt(spent - b.limit)
                        : warn
                          ? `🔶 ${t("limits.almostOut", "Zostało tylko")} ${fmt(remain)}`
                          : `${t("limits.left", "Zostało")} ${fmt(remain)}`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700,
                    color: over ? "#ef4444" : warn ? "#f59e0b" : "#e2e8f0" }}>
                    {fmt(spent)}
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>/ {fmt(b.limit)}</div>
                  <button onClick={() => deleteLimit(b.cat)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#334155", marginTop: 2,
                  }}><Trash2 size={11}/></button>
                </div>
              </div>

              <div style={{ background: "#060b14", borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%", borderRadius: 6,
                  background: over ? "#ef4444" : warn ? "#f59e0b"
                    : `linear-gradient(90deg,${cat.color}88,${cat.color})`,
                  transition: "width 0.6s ease",
                }}/>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5,
                fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#334155" }}>
                <span>0</span>
                <span style={{ color: over ? "#ef4444" : "#475569",
                  fontWeight: over ? 700 : 400 }}>
                  {pct.toFixed(0)}%
                </span>
                <span>{fmt(b.limit)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={t("limits.newTitle", "Nowy limit miesięczny")}>
        <Select label={t("limits.category", "Kategoria")} value={form.cat}
          onChange={e => setForm(f => ({...f, cat: e.target.value}))}>
          {CATEGORIES.filter(c => !["przychód","inne","sprzedaż","dodatkowe","bukmacherka"].includes(c.id))
            .map(c => <option key={c.id} value={c.id}>{c.label}</option>)
          }
        </Select>
        <Input label={t("limits.monthly", "Limit miesięczny (zł)")} type="number" value={form.limit}
          onChange={e => setForm(f => ({...f, limit: e.target.value}))} placeholder={t("limits.placeholder", "np. 200")}/>
        <div style={{ marginBottom: 16, background: "#060b14",
          border: "1px solid #1a2744", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {t("limits.spentInCycle", "Wydano w tym cyklu")}: <span style={{ color: "#e2e8f0",
              fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
              {fmt(spentBycat[form.cat] || 0)}
            </span>
          </div>
        </div>
        <button onClick={addLimit} style={{
          width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)",
          border: "none", borderRadius: 12, padding: 14, color: "white",
          fontWeight: 700, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {t("limits.save", "Zapisz limit")}
        </button>
      </Modal>
    </div>
  );
}

export { LimitsView };
