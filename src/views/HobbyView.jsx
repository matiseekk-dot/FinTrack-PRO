import { useState, useMemo } from "react";
import {
  Heart, Plus, ChevronRight, ChevronLeft, Edit2, Trash2,
  Sparkles, AlertCircle, TrendingUp,
} from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input } from "../components/ui/Input.jsx";
import { fmt, fmtShort, cycleTxs } from "../utils.js";
import {
  pickHobbyColor, DEFAULT_HOBBY_COLORS,
  getHobbyTransactions, getHobbyStats,
} from "../lib/hobby.js";
import { getCat } from "../constants.js";
import { t } from "../i18n.js";

function HobbyView({ hobbies, setHobbies, transactions, allCats, month, cycleDay }) {
  const [modalHobby, setModalHobby] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  const cyclePool = useMemo(() => cycleTxs(transactions || [], month, cycleDay),
    [transactions, month, cycleDay]);

  // Łączny przegląd wszystkich hobby - KPI suma w cyklu i w roku
  const summary = useMemo(() => {
    if (!Array.isArray(hobbies)) return { cycleTotal: 0, yearTotal: 0, allTimeTotal: 0 };
    const active = hobbies.filter(h => !h.archived);
    let cycleTotal = 0, yearTotal = 0, allTimeTotal = 0;
    for (const h of active) {
      const stats = getHobbyStats(transactions, h, { cycleTxs: cyclePool });
      cycleTotal   += stats.thisCycle;
      yearTotal    += stats.thisYear;
      allTimeTotal += stats.allTime;
    }
    return {
      cycleTotal: Math.round(cycleTotal),
      yearTotal: Math.round(yearTotal),
      allTimeTotal: Math.round(allTimeTotal),
    };
  }, [hobbies, transactions, cyclePool]);

  const openNew = () => {
    setModalHobby({
      id: null,
      name: "",
      color: pickHobbyColor(hobbies || []),
      categories: [],
      keywords: [],
      yearlyTarget: "",
      archived: false,
    });
  };

  const openEdit = (hobby) => {
    setModalHobby({
      ...hobby,
      yearlyTarget: hobby.yearlyTarget ? String(hobby.yearlyTarget) : "",
    });
  };

  const saveHobby = () => {
    if (!modalHobby) return;
    if (!modalHobby.name.trim()) return;
    const yt = parseFloat(String(modalHobby.yearlyTarget).replace(",", "."));
    const payload = {
      id: modalHobby.id || Date.now(),
      name: modalHobby.name.trim(),
      color: modalHobby.color,
      categories: Array.isArray(modalHobby.categories) ? modalHobby.categories : [],
      keywords: Array.isArray(modalHobby.keywords)
        ? modalHobby.keywords.map(k => String(k).trim()).filter(Boolean)
        : [],
      yearlyTarget: Number.isFinite(yt) && yt > 0 ? yt : null,
      archived: !!modalHobby.archived,
      createdAt: modalHobby.createdAt || new Date().toISOString(),
    };
    if (modalHobby.id) {
      setHobbies((hobbies || []).map(h => h.id === modalHobby.id ? payload : h));
    } else {
      setHobbies([...(hobbies || []), payload]);
    }
    setModalHobby(null);
  };

  const deleteHobby = (id) => {
    if (!window.confirm(t("hobby.deleteConfirm"))) return;
    setHobbies((hobbies || []).filter(h => h.id !== id));
    if (detailsId === id) setDetailsId(null);
  };

  if (detailsId) {
    const hobby = (hobbies || []).find(h => h.id === detailsId);
    if (hobby) return (
      <HobbyDetails
        hobby={hobby}
        transactions={transactions}
        cyclePool={cyclePool}
        allCats={allCats}
        onBack={() => setDetailsId(null)}
        onEdit={() => openEdit(hobby)}
        onDelete={() => deleteHobby(hobby.id)}
      />
    );
  }

  const activeHobbies = (hobbies || []).filter(h => !h.archived);
  const archivedHobbies = (hobbies || []).filter(h => h.archived);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Hobby — gdzie schodzą pieniądze
        </div>
        <button onClick={openNew} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none",
          borderRadius: 10, padding: "8px 14px", color: "white",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          <Plus size={14}/> {t("hobby.add")}
        </button>
      </div>

      {/* KPI summary bar */}
      {activeHobbies.length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14,
          background: "linear-gradient(135deg,#1a0f2e,#0d1628)",
          border: "1px solid #7c3aed33" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Stat label={t("hobby.thisCycle")} value={fmt(summary.cycleTotal)} color="#ec4899"/>
            <Stat label={t("hobby.thisYear")}  value={fmt(summary.yearTotal)}  color="#a855f7"/>
            <Stat label={t("hobby.allTime")}   value={fmt(summary.allTimeTotal)} color="#8b5cf6"/>
          </div>
          {summary.cycleTotal > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1a2744",
              fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              💡 To są pieniądze które <strong style={{ color: "#fbbf24" }}>mógłbyś</strong> przesunąć do oszczędności.
              Decyduj świadomie — apka tylko pokazuje fakty.
            </div>
          )}
        </Card>
      )}

      {/* Aktywne hobby */}
      {activeHobbies.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeHobbies.map(h => (
            <HobbyCard
              key={h.id}
              hobby={h}
              transactions={transactions}
              cyclePool={cyclePool}
              onClick={() => setDetailsId(h.id)}
            />
          ))}
        </div>
      )}

      {/* Archiwum */}
      {archivedHobbies.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Archiwum
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {archivedHobbies.map(h => (
              <HobbyCard
                key={h.id}
                hobby={h}
                transactions={transactions}
                cyclePool={cyclePool}
                onClick={() => setDetailsId(h.id)}
                dimmed
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(hobbies || []).length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 20px", marginTop: 20,
          background: "#0a1120", borderRadius: 16, border: "1px dashed #1a2744",
        }}>
          <Heart size={36} color="#475569" style={{ marginBottom: 12 }}/>
          <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700, marginBottom: 4 }}>
            {t("hobby.empty")}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, maxWidth: 320, margin: "0 auto 16px" }}>
            {t("hobby.emptyDesc")}
          </div>
          <button onClick={openNew} style={{
            background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none",
            borderRadius: 10, padding: "9px 16px", color: "white",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Plus size={14}/> {t("hobby.add")}
          </button>
        </div>
      )}

      {/* Modal add/edit */}
      {modalHobby && (
        <HobbyModal
          hobby={modalHobby}
          setHobby={setModalHobby}
          allCats={allCats}
          onClose={() => setModalHobby(null)}
          onSave={saveHobby}
        />
      )}
    </div>
  );
}

// ═══ COMPONENTS ═══

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function HobbyCard({ hobby, transactions, cyclePool, onClick, dimmed = false }) {
  const stats = useMemo(() => getHobbyStats(transactions, hobby, { cycleTxs: cyclePool }),
    [transactions, hobby, cyclePool]);

  const target = hobby.yearlyTarget;
  const targetPct = target > 0 ? Math.min(100, (stats.thisYear / target) * 100) : 0;
  const overTarget = target > 0 && stats.thisYear > target;
  const nearTarget = target > 0 && targetPct >= 80 && !overTarget;

  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", cursor: "pointer",
      background: dimmed ? "#0a1120" : "#0d1628",
      border: `1px solid ${dimmed ? "#1a2744" : hobby.color + "44"}`,
      borderRadius: 14, padding: "14px 16px",
      fontFamily: "'Space Grotesk', sans-serif",
      opacity: dimmed ? 0.7 : 1,
      transition: "all 0.15s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: hobby.color + "22", border: `1px solid ${hobby.color}66`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Sparkles size={16} color={hobby.color}/>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hobby.name}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {stats.count} {stats.count === 1 ? "transakcja" : "transakcji"}
              {hobby.categories.length > 0 && ` · ${hobby.categories.length} kat.`}
            </div>
          </div>
        </div>
        <ChevronRight size={16} color="#475569"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        <MiniStat label="Cykl"  value={fmtShort(stats.thisCycle)}   color="#ec4899"/>
        <MiniStat label="Mies." value={fmtShort(stats.thisMonth)}   color="#f43f5e"/>
        <MiniStat label="Kwart."value={fmtShort(stats.thisQuarter)} color="#a855f7"/>
        <MiniStat label="Rok"   value={fmtShort(stats.thisYear)}    color="#8b5cf6"/>
      </div>

      {target > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Roczny limit: {fmt(target)}
            </span>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
              color: overTarget ? "#ef4444" : nearTarget ? "#fbbf24" : "#10b981" }}>
              {targetPct.toFixed(0)}%
            </span>
          </div>
          <div style={{ background: "#060b14", borderRadius: 4, height: 4 }}>
            <div style={{
              width: targetPct + "%", height: "100%", borderRadius: 4,
              background: overTarget ? "#ef4444" : nearTarget ? "#fbbf24" : hobby.color,
            }}/>
          </div>
          {overTarget && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444",
              display: "flex", alignItems: "center", gap: 4 }}>
              <AlertCircle size={11}/> Przekroczono limit o {fmt(stats.thisYear - target)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: "#060b14", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color, marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function HobbyDetails({ hobby, transactions, cyclePool, allCats, onBack, onEdit, onDelete }) {
  const stats = useMemo(() => getHobbyStats(transactions, hobby, { cycleTxs: cyclePool }),
    [transactions, hobby, cyclePool]);
  const txs = useMemo(() => getHobbyTransactions(transactions, hobby), [transactions, hobby]);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#a855f7", fontSize: 13,
        cursor: "pointer", padding: "0 0 12px 0", display: "flex", alignItems: "center", gap: 4,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <ChevronLeft size={14}/> Wstecz
      </button>

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
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {hobby.categories.length > 0
                  ? hobby.categories.slice(0, 4).map(c => {
                      const cat = (allCats || []).find(x => x.id === c) || getCat(c);
                      return cat.label || c;
                    }).join(" · ")
                  : "Tylko po słowach kluczowych"
                }
                {hobby.categories.length > 4 && ` +${hobby.categories.length - 4}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onEdit} title="Edytuj" style={iconBtn}><Edit2 size={14}/></button>
            <button onClick={onDelete} title="Usuń" style={{...iconBtn, color: "#ef4444"}}><Trash2 size={14}/></button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Stat label="Bieżący cykl"   value={fmt(stats.thisCycle)}   color="#ec4899"/>
          <Stat label="Ten miesiąc"    value={fmt(stats.thisMonth)}   color="#f43f5e"/>
          <Stat label="Ten kwartał"    value={fmt(stats.thisQuarter)} color="#a855f7"/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Stat label="Ten rok"        value={fmt(stats.thisYear)}    color="#8b5cf6"/>
          <Stat label="Total"          value={fmt(stats.allTime)}     color="#64748b"/>
        </div>

        {hobby.yearlyTarget > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                Roczny limit: {fmt(hobby.yearlyTarget)}
              </span>
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                color: stats.thisYear > hobby.yearlyTarget ? "#ef4444" : "#10b981" }}>
                {Math.min(100, (stats.thisYear / hobby.yearlyTarget) * 100).toFixed(0)}% wykorzystane
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
            <TrendingUp size={11}/> Rok-do-roku
          </div>
          <YoYBars data={stats.yoyTrend} color={hobby.color}/>
        </Card>
      )}

      {/* Breakdown wg kategorii */}
      {Object.keys(stats.byCategory).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Wg kategorii
          </div>
          {Object.entries(stats.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([catId, val]) => {
              const cat = (allCats || []).find(c => c.id === catId) || getCat(catId);
              const pct = (val / stats.allTime) * 100;
              return (
                <div key={catId} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600 }}>
                      {cat.label || catId}
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: cat.color || "#94a3b8" }}>
                      {fmt(val)}
                    </span>
                  </div>
                  <div style={{ background: "#060b14", borderRadius: 3, height: 4 }}>
                    <div style={{ width: pct + "%", height: "100%", borderRadius: 3,
                      background: cat.color || hobby.color, opacity: 0.7 }}/>
                  </div>
                </div>
              );
            })
          }
        </Card>
      )}

      {/* Top merchants */}
      {Object.keys(stats.byMerchant).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Top sklepy / źródła (lifetime)
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

      {/* Lista transakcji */}
      {txs.length > 0 ? (
        <Card style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            display: "flex", justifyContent: "space-between" }}>
            <span>Transakcje</span>
            <span style={{ color: "#475569" }}>{txs.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {txs.slice(0, 30).map(tx => {
              const cat = (allCats || []).find(c => c.id === tx.cat) || getCat(tx.cat);
              return (
                <div key={tx.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "#060b14", borderRadius: 8,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.desc || cat.label}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                      {tx.date} · {cat.label}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                    color: "#ef4444", flexShrink: 0 }}>
                    −{fmt(Math.abs(tx.amount))}
                  </span>
                </div>
              );
            })}
            {txs.length > 30 && (
              <div style={{ fontSize: 11, color: "#475569", textAlign: "center", padding: "6px 0" }}>
                + {txs.length - 30} starszych transakcji
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#64748b", fontSize: 12,
          background: "#0a1120", borderRadius: 14, border: "1px dashed #1a2744" }}>
          {t("hobby.noMatch")}
          <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>
            Sprawdź czy wybrałeś właściwe kategorie albo dodaj słowa kluczowe.
          </div>
        </div>
      )}
    </div>
  );
}

function YoYBars({ data, color }) {
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
      {data.map(d => {
        const h = (d.total / max) * 100;
        return (
          <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 9, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
              {fmtShort(d.total)}
            </div>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${h}%`, minHeight: 3,
                background: color || "#a855f7",
                borderRadius: "4px 4px 0 0",
                opacity: 0.85,
              }}/>
            </div>
            <div style={{ fontSize: 9, color: "#475569", fontFamily: "'DM Mono', monospace" }}>
              {String(d.year).slice(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const iconBtn = {
  background: "#0a1120", border: "1px solid #1a2744", borderRadius: 8,
  padding: "6px 8px", cursor: "pointer", color: "#94a3b8",
  display: "flex", alignItems: "center", justifyContent: "center",
};

function HobbyModal({ hobby, setHobby, allCats, onClose, onSave }) {
  const expenseCats = (allCats || []).filter(c =>
    !["przychód", "wynagrodzenie", "dodatkowe", "sprzedaż", "bukmacherka", "inne"].includes(c.id)
  );

  const toggleCategory = (catId) => {
    const cur = hobby.categories || [];
    if (cur.includes(catId)) {
      setHobby({ ...hobby, categories: cur.filter(c => c !== catId) });
    } else {
      setHobby({ ...hobby, categories: [...cur, catId] });
    }
  };

  const keywordsStr = Array.isArray(hobby.keywords) ? hobby.keywords.join(", ") : "";

  return (
    <Modal open={true} onClose={onClose} title={hobby.id ? "Edytuj hobby" : t("hobby.add")}>
      <Input
        label={t("hobby.name")}
        value={hobby.name}
        onChange={e => setHobby({ ...hobby, name: e.target.value })}
        placeholder="np. Winyle, F1, Bukmacherka"
      />

      {/* Color picker */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Kolor
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DEFAULT_HOBBY_COLORS.map(c => (
            <button key={c} onClick={() => setHobby({ ...hobby, color: c })} style={{
              width: 28, height: 28, borderRadius: 8, cursor: "pointer",
              background: c,
              border: hobby.color === c ? "2px solid #e2e8f0" : "2px solid transparent",
            }}/>
          ))}
        </div>
      </div>

      {/* Categories multi-select */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          {t("hobby.categories")}
        </div>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
          {t("hobby.categoriesHelp")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {expenseCats.map(c => {
            const selected = (hobby.categories || []).includes(c.id);
            return (
              <button key={c.id} onClick={() => toggleCategory(c.id)} style={{
                padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                fontSize: 11, fontWeight: 600,
                background: selected ? c.color + "33" : "#060b14",
                border: `1px solid ${selected ? c.color + "88" : "#1a2744"}`,
                color: selected ? c.color : "#64748b",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                {c.label}
              </button>
            );
          })}
        </div>
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
          placeholder="np. winyl, ghost, trivium"
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
          placeholder="np. 4000"
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

export { HobbyView };
