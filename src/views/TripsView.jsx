import { useState, useMemo } from "react";
import {
  Plane, Plus, X, Calendar, Wallet, ChevronRight, ChevronLeft,
  Trash2, Edit2, Archive as ArchiveIcon, RotateCcw, Tag,
} from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input } from "../components/ui/Input.jsx";
import { fmt, fmtShort, todayLocal } from "../utils.js";
import {
  groupTrips, getTripSpending, getYearlyTripsSummary, getTripsTrendYoY,
  pickTripColor, DEFAULT_TRIP_COLORS, migrateLegacyVacations,
} from "../lib/trips.js";
import { getCat } from "../constants.js";
import { t } from "../i18n.js";

function TripsView({ trips, setTrips, transactions, setTransactions, allCats, vacationArchive }) {
  const [modalTrip, setModalTrip] = useState(null);  // null | {} (edit/new)
  const [detailsId, setDetailsId] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  // One-shot migracja: jeśli trips puste a stare vacation/vacationArchive są - zaproponuj
  const migrationCandidate = useMemo(() => {
    if (Array.isArray(trips) && trips.length > 0) return null;
    return migrateLegacyVacations();
  }, [trips]);

  const grouped = useMemo(() => groupTrips(trips || [], todayLocal()), [trips]);
  const summary = useMemo(() => getYearlyTripsSummary(trips || [], transactions || [], year), [trips, transactions, year]);
  const yoyTrend = useMemo(() => getTripsTrendYoY(trips || [], transactions || []), [trips, transactions]);

  const openNew = () => {
    setModalTrip({
      id: null,
      name: "", dateFrom: todayLocal(), dateTo: todayLocal(),
      budget: "", color: pickTripColor(trips || []),
      notes: "", archived: false,
    });
  };

  const openEdit = (trip) => {
    setModalTrip({ ...trip, budget: String(trip.budget || "") });
  };

  const saveTrip = () => {
    if (!modalTrip) return;
    if (!modalTrip.name.trim()) return;
    const payload = {
      id: modalTrip.id || Date.now(),
      name: modalTrip.name.trim(),
      dateFrom: modalTrip.dateFrom,
      dateTo: modalTrip.dateTo,
      budget: parseFloat(String(modalTrip.budget).replace(",", ".")) || 0,
      color: modalTrip.color,
      notes: modalTrip.notes || "",
      archived: !!modalTrip.archived,
      createdAt: modalTrip.createdAt || new Date().toISOString(),
    };
    if (modalTrip.id) {
      setTrips(trips.map(t => t.id === modalTrip.id ? payload : t));
    } else {
      setTrips([...(trips || []), payload]);
    }
    setModalTrip(null);
  };

  const deleteTrip = (id) => {
    if (!window.confirm(t("trips.deleteConfirm"))) return;
    // Usuń trip + wyczyść tripId z tx (zachowując same tx)
    setTrips(trips.filter(t => t.id !== id));
    if (Array.isArray(transactions) && setTransactions) {
      setTransactions(transactions.map(t =>
        t.tripId === id ? { ...t, tripId: null } : t
      ));
    }
    if (detailsId === id) setDetailsId(null);
  };

  const toggleArchive = (id) => {
    setTrips(trips.map(t => t.id === id ? { ...t, archived: !t.archived } : t));
  };

  const performMigration = () => {
    if (!migrationCandidate) return;
    setTrips(migrationCandidate);
  };

  if (detailsId) {
    const trip = (trips || []).find(t => t.id === detailsId);
    if (trip) return (
      <TripDetails
        trip={trip}
        transactions={transactions}
        setTransactions={setTransactions}
        allCats={allCats}
        onBack={() => setDetailsId(null)}
        onEdit={() => openEdit(trip)}
        onDelete={() => { deleteTrip(trip.id); }}
        onArchiveToggle={() => toggleArchive(trip.id)}
      />
    );
  }

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Header z przyciskiem dodawania */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Wyjazdy
        </div>
        <button onClick={openNew} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none",
          borderRadius: 10, padding: "8px 14px", color: "white",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          <Plus size={14}/> {t("trips.add")}
        </button>
      </div>

      {/* Migracja sugestia */}
      {migrationCandidate && (!trips || trips.length === 0) && (
        <div style={{
          background: "#0d1f35", border: "1px solid #2563eb44",
          borderRadius: 12, padding: "12px 14px", marginBottom: 14,
          fontSize: 12, color: "#cbd5e1", lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: 6 }}>
            🛫 Wykryto stare dane z poprzedniej wersji
          </div>
          Znaleźliśmy 1 wyjazd z poprzedniej wersji apki. Czy go zaimportować?
          <button onClick={performMigration} style={{
            marginTop: 10, background: "#1e3a5f", border: "1px solid #2563eb",
            borderRadius: 8, padding: "6px 12px", color: "#60a5fa",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Importuj
          </button>
        </div>
      )}

      {/* YoY summary i year nav */}
      {(trips || []).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setYear(y => y - 1)} style={{
                background: "#0a1120", border: "1px solid #1a2744", borderRadius: 8,
                padding: "5px 8px", cursor: "pointer", color: "#64748b",
                display: "flex", alignItems: "center",
              }}>
                <ChevronLeft size={14}/>
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", minWidth: 50, textAlign: "center" }}>
                {year}
              </div>
              <button onClick={() => setYear(y => y + 1)} style={{
                background: "#0a1120", border: "1px solid #1a2744", borderRadius: 8,
                padding: "5px 8px", cursor: "pointer", color: "#64748b",
                display: "flex", alignItems: "center",
              }}>
                <ChevronRight size={14}/>
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>
              {summary.trips.length} {summary.trips.length === 1 ? "wyjazd" : "wyjazdy"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Stat label={t("trips.spent")} value={fmt(summary.totalSpent)} color="#ef4444"/>
            <Stat label={t("trips.budget")} value={summary.totalBudget > 0 ? fmt(summary.totalBudget) : "—"} color="#3b82f6"/>
            <Stat
              label={t("trips.remaining")}
              value={summary.totalBudget > 0 ? fmt(summary.totalBudget - summary.totalSpent) : "—"}
              color={summary.totalBudget - summary.totalSpent >= 0 ? "#10b981" : "#ef4444"}
            />
          </div>

          {/* Mini YoY chart */}
          {yoyTrend.length >= 2 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1a2744" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Trend rok-do-roku
              </div>
              <YoYBars data={yoyTrend}/>
            </div>
          )}
        </Card>
      )}

      {/* Aktywne */}
      {grouped.active.length > 0 && (
        <SectionTitle label={"🟢 " + t("trips.active")}>
          {grouped.active.map(trip => (
            <TripCard key={trip.id} trip={trip} transactions={transactions}
              onClick={() => setDetailsId(trip.id)}/>
          ))}
        </SectionTitle>
      )}

      {/* Nadchodzące */}
      {grouped.upcoming.length > 0 && (
        <SectionTitle label={"📅 " + t("trips.upcoming")}>
          {grouped.upcoming.map(trip => (
            <TripCard key={trip.id} trip={trip} transactions={transactions}
              onClick={() => setDetailsId(trip.id)}/>
          ))}
        </SectionTitle>
      )}

      {/* Archiwum */}
      {grouped.past.length > 0 && (
        <SectionTitle label={"📦 " + t("trips.past")}>
          {grouped.past.map(trip => (
            <TripCard key={trip.id} trip={trip} transactions={transactions}
              onClick={() => setDetailsId(trip.id)} dimmed/>
          ))}
        </SectionTitle>
      )}

      {/* Stary vacationArchive (read-only) */}
      {Array.isArray(vacationArchive) && vacationArchive.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Archiwum przed v1.1.2 (tylko podgląd)
          </div>
          {vacationArchive.map((v, i) => (
            <div key={i} style={{
              background: "#0a1120", border: "1px dashed #1a2744",
              borderRadius: 12, padding: "12px 14px", marginBottom: 8,
              opacity: 0.65, fontSize: 12, color: "#94a3b8",
            }}>
              <div style={{ fontWeight: 700, color: "#cbd5e1" }}>
                {v.name || v.dest || "Wyjazd"}
              </div>
              {(v.dateFrom || v.dateTo) && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {v.dateFrom || "?"} — {v.dateTo || "?"}
                </div>
              )}
              {v.spent != null && (
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  Wydane: {fmt(v.spent)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {(trips || []).length === 0 && !migrationCandidate && (
        <div style={{
          textAlign: "center", padding: "40px 20px", marginTop: 20,
          background: "#0a1120", borderRadius: 16, border: "1px dashed #1a2744",
        }}>
          <Plane size={36} color="#475569" style={{ marginBottom: 12 }}/>
          <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700, marginBottom: 4 }}>
            {t("trips.empty")}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            {t("trips.emptyDesc")}
          </div>
          <button onClick={openNew} style={{
            background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none",
            borderRadius: 10, padding: "9px 16px", color: "white",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Plus size={14}/> {t("trips.add")}
          </button>
        </div>
      )}

      {/* Modal add/edit */}
      {modalTrip && (
        <TripModal
          trip={modalTrip}
          setTrip={setModalTrip}
          onClose={() => setModalTrip(null)}
          onSave={saveTrip}
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

function YoYBars({ data }) {
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 50 }}>
      {data.map(d => {
        const h = (d.total / max) * 100;
        return (
          <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${h}%`, minHeight: 2,
                background: "linear-gradient(180deg,#3b82f6,#1e40af)",
                borderRadius: "4px 4px 0 0",
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

function SectionTitle({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function TripCard({ trip, transactions, onClick, dimmed = false }) {
  const spending = useMemo(() => getTripSpending(transactions, trip.id), [transactions, trip.id]);
  const budget = trip.budget || 0;
  const pct = budget > 0 ? Math.min(100, (spending.total / budget) * 100) : 0;
  const overBudget = budget > 0 && spending.total > budget;

  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", cursor: "pointer",
      background: dimmed ? "#0a1120" : "#0d1628",
      border: `1px solid ${dimmed ? "#1a2744" : trip.color + "44"}`,
      borderRadius: 14, padding: "14px 16px",
      fontFamily: "'Space Grotesk', sans-serif",
      opacity: dimmed ? 0.7 : 1,
      transition: "all 0.15s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: trip.color + "22", border: `1px solid ${trip.color}66`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Plane size={16} color={trip.color}/>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {trip.name}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {trip.dateFrom} — {trip.dateTo}
            </div>
          </div>
        </div>
        <ChevronRight size={16} color="#475569"/>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
        <div>
          <span style={{ color: "#64748b" }}>{t("trips.spent")}: </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700,
            color: overBudget ? "#ef4444" : "#e2e8f0" }}>
            {fmt(spending.total)}
          </span>
        </div>
        {budget > 0 && (
          <div style={{ color: "#64748b", fontSize: 11 }}>
            z {fmt(budget)}
          </div>
        )}
      </div>

      {budget > 0 && (
        <div style={{ marginTop: 8, background: "#060b14", borderRadius: 4, height: 4, overflow: "hidden" }}>
          <div style={{
            width: pct + "%", height: "100%",
            background: overBudget ? "#ef4444" : trip.color,
            transition: "width 0.5s",
          }}/>
        </div>
      )}
    </button>
  );
}

function TripDetails({ trip, transactions, setTransactions, allCats, onBack, onEdit, onDelete, onArchiveToggle }) {
  const spending = useMemo(() => getTripSpending(transactions, trip.id), [transactions, trip.id]);
  const tripTxs = useMemo(() => (transactions || [])
    .filter(t => t.tripId === trip.id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
  [transactions, trip.id]);

  const budget = trip.budget || 0;
  const remaining = budget - spending.total;

  const removeTagFromTx = (txId) => {
    if (!setTransactions) return;
    setTransactions(transactions.map(tx => tx.id === txId ? { ...tx, tripId: null } : tx));
  };

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Header */}
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#60a5fa", fontSize: 13,
        cursor: "pointer", padding: "0 0 12px 0", display: "flex", alignItems: "center", gap: 4,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <ChevronLeft size={14}/> Wstecz
      </button>

      <Card style={{ padding: "18px 20px", marginBottom: 14, borderColor: trip.color + "66" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: trip.color + "22", border: `1px solid ${trip.color}66`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Plane size={18} color={trip.color}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#e2e8f0" }}>
                {trip.name}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2,
                display: "flex", alignItems: "center", gap: 4 }}>
                <Calendar size={11}/> {trip.dateFrom} — {trip.dateTo}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onEdit} title="Edytuj" style={iconBtn}><Edit2 size={14}/></button>
            <button onClick={onArchiveToggle} title={trip.archived ? "Przywróć" : "Archiwum"} style={iconBtn}>
              {trip.archived ? <RotateCcw size={14}/> : <ArchiveIcon size={14}/>}
            </button>
            <button onClick={onDelete} title="Usuń" style={{...iconBtn, color: "#ef4444"}}>
              <Trash2 size={14}/>
            </button>
          </div>
        </div>

        {trip.notes && (
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12,
            padding: "10px 12px", background: "#060b14", borderRadius: 8 }}>
            {trip.notes}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Stat label={t("trips.spent")}     value={fmt(spending.total)}      color="#ef4444"/>
          <Stat label={t("trips.budget")}    value={budget > 0 ? fmt(budget) : "—"} color="#3b82f6"/>
          <Stat
            label={t("trips.remaining")}
            value={budget > 0 ? fmt(remaining) : "—"}
            color={remaining >= 0 ? "#10b981" : "#ef4444"}
          />
        </div>

        {budget > 0 && (
          <div style={{ marginTop: 12, background: "#060b14", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{
              width: Math.min(100, (spending.total / budget) * 100) + "%",
              height: "100%",
              background: spending.total > budget ? "#ef4444" : trip.color,
            }}/>
          </div>
        )}
      </Card>

      {/* Breakdown wg kategorii */}
      {Object.keys(spending.byCategory).length > 0 && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            {t("trips.byCategory")}
          </div>
          {Object.entries(spending.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([catId, val]) => {
              const cat = (allCats || []).find(c => c.id === catId) || getCat(catId);
              const pct = (val / spending.total) * 100;
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
                      background: cat.color || "#3b82f6", opacity: 0.7 }}/>
                  </div>
                </div>
              );
            })
          }
        </Card>
      )}

      {/* Lista transakcji */}
      {tripTxs.length > 0 && (
        <Card style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Transakcje</span>
            <span style={{ color: "#475569" }}>{tripTxs.length} {t("trips.txCount")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tripTxs.map(tx => {
              const cat = (allCats || []).find(c => c.id === tx.cat) || getCat(tx.cat);
              const isExpense = tx.amount < 0;
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                      color: isExpense ? "#ef4444" : "#10b981" }}>
                      {isExpense ? "−" : "+"}{fmt(Math.abs(tx.amount))}
                    </span>
                    <button onClick={() => removeTagFromTx(tx.id)} title="Usuń tag" style={{
                      background: "none", border: "none", cursor: "pointer", color: "#475569",
                      padding: 4, borderRadius: 4,
                    }}>
                      <X size={11}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tripTxs.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#64748b", fontSize: 12,
          background: "#0a1120", borderRadius: 14, border: "1px dashed #1a2744" }}>
          <Tag size={20} color="#475569" style={{ marginBottom: 8 }}/>
          <div>Brak przypisanych transakcji do tego wyjazdu.</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            Dodaj nową lub w widoku <strong>Transakcje</strong> użyj „Przypisz do wyjazdu".
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  background: "#0a1120", border: "1px solid #1a2744", borderRadius: 8,
  padding: "6px 8px", cursor: "pointer", color: "#94a3b8",
  display: "flex", alignItems: "center", justifyContent: "center",
};

function TripModal({ trip, setTrip, onClose, onSave }) {
  return (
    <Modal open={true} onClose={onClose} title={trip.id ? "Edytuj wyjazd" : t("trips.add")}>
      <Input
        label={t("trips.name")}
        value={trip.name}
        onChange={e => setTrip({ ...trip, name: e.target.value })}
        placeholder="np. Serbia z dzieckiem"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input
          label={t("trips.dateFrom")}
          type="date"
          value={trip.dateFrom}
          onChange={e => setTrip({ ...trip, dateFrom: e.target.value })}
        />
        <Input
          label={t("trips.dateTo")}
          type="date"
          value={trip.dateTo}
          onChange={e => setTrip({ ...trip, dateTo: e.target.value })}
        />
      </div>
      <Input
        label={t("trips.budget") + " (zł)"}
        type="number"
        inputMode="decimal"
        value={trip.budget}
        onChange={e => setTrip({ ...trip, budget: e.target.value })}
        placeholder="0"
      />
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          {t("trips.color")}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DEFAULT_TRIP_COLORS.map(c => (
            <button key={c} onClick={() => setTrip({ ...trip, color: c })} style={{
              width: 28, height: 28, borderRadius: 8, cursor: "pointer",
              background: c,
              border: trip.color === c ? "2px solid #e2e8f0" : "2px solid transparent",
            }}/>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          {t("trips.notes")}
        </div>
        <textarea
          value={trip.notes || ""}
          onChange={e => setTrip({ ...trip, notes: e.target.value })}
          rows={2}
          placeholder="np. Belgrade, hotel + atrakcje"
          style={{
            width: "100%", padding: "10px 12px",
            background: "#060b14", border: "1px solid #1e3a5f",
            borderRadius: 10, color: "#e2e8f0", fontSize: 13,
            fontFamily: "'Space Grotesk', sans-serif", boxSizing: "border-box", resize: "vertical",
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
        <button onClick={onSave} disabled={!trip.name.trim()} style={{
          flex: 2, padding: 12,
          background: trip.name.trim() ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#1e3a5f",
          border: "none", borderRadius: 10, color: "white",
          fontWeight: 700, fontSize: 13,
          cursor: trip.name.trim() ? "pointer" : "not-allowed",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

export { TripsView };
