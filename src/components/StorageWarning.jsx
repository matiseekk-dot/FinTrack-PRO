import { useState } from "react";
import { AlertTriangle, Archive, Check } from "lucide-react";
import { archiveOldTransactions } from "../lib/archive.js";

/**
 * Warning + fix dla power userów z dużą ilością transakcji.
 * Pojawia się od 4500 tx (~ 70% Firestore limitu 1MB).
 */
function StorageWarning({ transactions, setTransactions }) {
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(null);
  
  if (!Array.isArray(transactions)) return null;
  const count = transactions.length;
  
  if (count < 4500) return null;
  
  const urgent = count >= 5500;
  
  const handleArchive = () => {
    setArchiving(true);
    setTimeout(() => {
      const result = archiveOldTransactions(transactions, 730);  // 2 lata
      if (result.archived > 0 && result.newTransactions) {
        setTransactions(result.newTransactions);
        setArchived(result.archived);
      }
      setArchiving(false);
    }, 100);
  };
  
  if (archived !== null) {
    return (
      <div style={{
        background: "#052e16", border: "1px solid #14532d",
        borderRadius: 12, padding: "10px 14px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Check size={16} color="#10b981"/>
        <div style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>
          Zarchiwizowano <strong>{archived}</strong> transakcji (starszych niż 2 lata)
        </div>
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
            {" "}Zarchiwizuj stare (2+ lat) — nadal będą dostępne w Analizie.
          </div>
        </div>
      </div>
      
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
