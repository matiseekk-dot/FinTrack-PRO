import { useState } from "react";
import { AlertTriangle, Archive, Check, Undo2 } from "lucide-react";
import { archiveOldTransactions, restoreArchivedTransactions, getArchiveStats } from "../lib/archive.js";

/**
 * Warning + fix dla power userów z dużą ilością transakcji.
 * Pojawia się od 4500 tx (~ 70% Firestore limitu 1MB).
 */
function StorageWarning({ transactions, setTransactions }) {
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(null);
  const [archiveError, setArchiveError] = useState(null);
  
  if (!Array.isArray(transactions)) return null;
  const count = transactions.length;
  
  // Pokazuj komponent gdy: dużo tx LUB istnieje archiwum (żeby user mógł zrobić undo)
  const stats = getArchiveStats();
  const hasArchive = stats && stats.count > 0;
  if (count < 4500 && !hasArchive) return null;
  
  const urgent = count >= 5500;
  
  const handleArchive = () => {
    if (!confirm(
      "UWAGA: Archiwum jest LOKALNE (tylko ten browser).\n\n" +
      "• Archiwizowane transakcje znikną z głównej listy\n" +
      "• Nadal będą w localStorage tego urządzenia\n" +
      "• NIE syncują się przez Firestore — telefon dalej będzie miał stare tx\n" +
      "• Można cofnąć przyciskiem \"Przywróć\"\n\n" +
      "Najlepiej: zarchiwizuj na URZĄDZENIU NA KTÓRYM widzisz najwięcej tx, " +
      "potem na innych urządzeniach (po sync) zrób to samo.\n\n" +
      "Kontynuować?"
    )) return;
    
    setArchiveError(null);
    setArchiving(true);
    setTimeout(() => {
      const result = archiveOldTransactions(transactions, 730);  // 2 lata
      if (result.error === "quota_exceeded") {
        setArchiveError("localStorage pełny. Wyeksportuj dane do Excel i wyczyść.");
        setArchiving(false);
        return;
      }
      if (result.archived > 0 && result.newTransactions) {
        setTransactions(result.newTransactions);
        setArchived(result.archived);
      }
      setArchiving(false);
    }, 100);
  };

  const handleRestore = () => {
    if (!confirm("Przywrócić wszystkie zarchiwizowane transakcje? Lista wróci do oryginalnej wielkości.")) return;
    const result = restoreArchivedTransactions(transactions);
    if (result.restored > 0) {
      setTransactions(result.transactions);
      setArchived(null);
      alert(`Przywrócono ${result.restored} transakcji.`);
    }
  };
  
  // Stan po świeżej archiwizacji - pokazujemy success + undo
  if (archived !== null) {
    return (
      <div style={{
        background: "#052e16", border: "1px solid #14532d",
        borderRadius: 12, padding: "10px 14px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Check size={16} color="#10b981"/>
        <div style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>
          Zarchiwizowano <strong>{archived}</strong> tx (lokalnie, starsze niż 2 lata)
        </div>
        <button onClick={handleRestore} style={{
          background: "#14532d", border: "1px solid #16a34a44", color: "#10b981",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 4,
        }}>
          <Undo2 size={11}/> Cofnij
        </button>
      </div>
    );
  }
  
  // Stan persistent - jest archiwum, można je przywrócić w każdej chwili
  if (hasArchive && count < 4500) {
    return (
      <div style={{
        background: "#0a1e3f", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: "10px 14px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 10,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <Archive size={14} color="#60a5fa"/>
        <div style={{ flex: 1, fontSize: 11, color: "#94a3b8" }}>
          Masz <strong style={{ color: "#cbd5e1" }}>{stats.count}</strong> zarchiwizowanych tx (lokalnie). Najstarsza: {stats.oldestDate || "—"}.
        </div>
        <button onClick={handleRestore} style={{
          background: "#1e3a5f", border: "1px solid #3b82f644", color: "#60a5fa",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 4,
        }}>
          <Undo2 size={11}/> Przywróć
        </button>
      </div>
    );
  }
  
  return (
    <div style={{
      background: urgent ? "#7f1d1d" : "#78350f",
      border: `1px solid ${urgent ? "#ef4444" : "#f59e0b"}`,
      borderRadius: 12, padding: "12px 14px",
      marginBottom: 10,
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <AlertTriangle size={16} color={urgent ? "#fca5a5" : "#fbbf24"} style={{ marginTop: 2, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 3 }}>
            {urgent ? "Masz bardzo dużo transakcji" : "Dużo transakcji w bazie"}
          </div>
          <div style={{ fontSize: 11, color: "#e2e8f0", lineHeight: 1.4 }}>
            {count.toLocaleString("pl-PL")} transakcji.
            {urgent && " Sync może przestać działać przy 6000+."}
            {" "}Zarchiwizuj stare (2+ lat) — pozostaną tylko na tym urządzeniu (lokalnie).
          </div>
        </div>
      </div>
      
      {archiveError && (
        <div style={{ fontSize: 11, color: "#fecaca", marginBottom: 8, padding: "6px 10px",
          background: "#000a", borderRadius: 6 }}>
          ⚠️ {archiveError}
        </div>
      )}
      
      <button onClick={handleArchive} disabled={archiving} style={{
        width: "100%", padding: 10,
        background: "white", color: urgent ? "#991b1b" : "#78350f",
        border: "none", borderRadius: 10,
        fontWeight: 700, fontSize: 12,
        cursor: archiving ? "wait" : "pointer",
        fontFamily: "'Space Grotesk', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <Archive size={13}/> {archiving ? "Archiwizuję..." : "Zarchiwizuj stare transakcje"}
      </button>
    </div>
  );
}

export { StorageWarning };
