// Drill-down kategorii: pokazuje listę transakcji z konkretnej kategorii
// w przekazanej puli tx (np. cycleTxs lub trip tx). Używane w:
//   - AnalyticsView "Ranking wydatków" → cała pula bieżącego cyklu
//   - TripsView TripDetails "Wg kategorii" → tylko tx tego wyjazdu
//
// MVP: tylko podgląd (lista tx sortowana po dacie malejąco). Edit/delete user
// robi w widoku Transakcje. Modal można rozszerzyć później o akcje inline.

import { X } from "lucide-react";
import { fmt, fmtDisplay } from "../utils.js";
import { resolveCategory } from "../lib/categoryHelpers.js";

function CategoryTxModal({ open, onClose, categoryId, transactions = [], allCats = [], title = null }) {
  if (!open || !categoryId) return null;

  const cat = resolveCategory(categoryId, allCats);
  const Icon = cat.icon;

  // Filtruj tx do tej kategorii, sortuj malejąco po dacie
  const catTxs = transactions
    .filter(t => t.cat === categoryId && t.amount < 0) // tylko wydatki w tej kat
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const total = catTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
  const count = catTxs.length;
  const avg = count > 0 ? total / count : 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d1628", border: "1px solid #1a2744",
          borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 500,
          maxHeight: "85vh", overflowY: "auto",
          paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
          paddingLeft: 20, paddingRight: 20,
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{
              background: cat.color + "22",
              border: `1px solid ${cat.color}66`,
              borderRadius: 12,
              padding: 10,
              flexShrink: 0,
            }}>
              <Icon size={18} color={cat.color}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cat.label}
              </div>
              {title && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {title}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "#1a2744", border: "none", borderRadius: 10,
            padding: 10, cursor: "pointer", color: "#94a3b8",
            minWidth: 40, minHeight: 40,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={18}/>
          </button>
        </div>

        {/* KPI: total / count / avg */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Łącznie</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: cat.color, marginTop: 4 }}>
              {fmtDisplay(total)}
            </div>
          </div>
          <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Transakcji</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginTop: 4 }}>
              {count}
            </div>
          </div>
          <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Średnio</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#94a3b8", marginTop: 4 }}>
              {fmtDisplay(avg)}
            </div>
          </div>
        </div>

        {/* Lista tx */}
        {catTxs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "#64748b", fontSize: 13 }}>
            Brak transakcji w tej kategorii w tym okresie.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {catTxs.map(tx => (
              <div key={tx.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px", background: "#060b14", borderRadius: 10,
              }}>
                <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.desc || "(bez opisu)"}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2,
                    fontFamily: "'DM Mono', monospace" }}>
                    {tx.date}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                    fontWeight: 700, color: "#ef4444" }}>
                    −{fmt(Math.abs(tx.amount))}
                  </div>
                  {tx.origCurrency && tx.origCurrency !== "PLN" && tx.origAmount != null && (
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
                      color: "#64748b", marginTop: 1 }}>
                      {Math.abs(tx.origAmount).toFixed(2)} {tx.origCurrency}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer hint */}
        <div style={{ marginTop: 14, padding: "10px 12px",
          background: "#060b14", borderRadius: 10,
          fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 1.5 }}>
          💡 Edytować lub usunąć tx? Otwórz <strong style={{ color: "#94a3b8" }}>Transakcje</strong> i znajdź ją na liście.
        </div>
      </div>
    </div>
  );
}

export { CategoryTxModal };
