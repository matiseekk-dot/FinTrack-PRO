/**
 * Archiwizacja starych transakcji żeby nie przekroczyć Firestore 1MB limit.
 * 
 * Strategia: tx starsze niż 2 lata → przeniesione do localStorage, usunięte z Firestore.
 * 
 * UWAGA v1.2.11: Archiwum jest LOCAL-ONLY (nie syncuje się przez Firestore).
 * Jeśli zarchiwizujesz na laptopie, telefon dalej będzie miał te tx (bo Firestore
 * nadal je ma → przy następnym sync laptop dostanie je z powrotem).
 * 
 * To jest świadomy trade-off: archiwum to "exit hatch" gdy jeden device ma za dużo
 * danych. Pełna obsługa multi-device archive wymagałaby Firestore subcollection
 * users/{uid}/archive/{tx_id} co podwaja koszt sync/storage.
 * 
 * Wywoływane ręcznie z UI (StorageWarning).
 */

import { dateToLocal } from "../utils.js";

const ARCHIVE_KEY = "ft_archive_tx";

function getArchivedTransactions() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function getArchiveStats() {
  const archived = getArchivedTransactions();
  if (archived.length === 0) return null;
  const sortedByDate = [...archived].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return {
    count: archived.length,
    oldestDate: sortedByDate[0]?.date || null,
    newestDate: sortedByDate[sortedByDate.length - 1]?.date || null,
    sizeBytes: (localStorage.getItem(ARCHIVE_KEY) || "").length,
  };
}

function archiveOldTransactions(transactions, cutoffDays = 730) {
  const cutoff = Date.now() - (cutoffDays * 86400000);
  const cutoffStr = dateToLocal(new Date(cutoff));
  
  const toArchive = [];
  const toKeep = [];
  
  transactions.forEach(t => {
    if (t.date && t.date < cutoffStr) {
      toArchive.push(t);
    } else {
      toKeep.push(t);
    }
  });
  
  if (toArchive.length === 0) return { archived: 0, kept: transactions.length };
  
  // Merge z istniejącym archive
  const existing = getArchivedTransactions();
  const allArchived = [...existing, ...toArchive];
  
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(allArchived));
    return { archived: toArchive.length, kept: toKeep.length, newTransactions: toKeep };
  } catch (e) {
    // QuotaExceededError - localStorage pełen. NIE usuwamy z transactions, bo
    // archive nie zapisał się. User musi najpierw zarchiwizować mniej lub wyeksportować.
    console.error("[FT] Archive failed - localStorage full", e);
    return { archived: 0, kept: transactions.length, error: "quota_exceeded" };
  }
}

/**
 * Przywróć zarchiwizowane tx z powrotem do głównej listy. Dla undo.
 * Czyści archiwum localStorage.
 */
function restoreArchivedTransactions(currentTransactions) {
  const archived = getArchivedTransactions();
  if (archived.length === 0) return { restored: 0, transactions: currentTransactions };
  
  // Merge - filtruj duplikaty po ID na wszelki wypadek
  const existingIds = new Set((currentTransactions || []).map(t => t.id));
  const newOnes = archived.filter(t => !existingIds.has(t.id));
  const merged = [...(currentTransactions || []), ...newOnes];
  
  try {
    localStorage.removeItem(ARCHIVE_KEY);
    return { restored: newOnes.length, transactions: merged };
  } catch (e) {
    console.error("[FT] Restore failed", e);
    return { restored: 0, transactions: currentTransactions, error: String(e) };
  }
}

function clearArchive() {
  try {
    localStorage.removeItem(ARCHIVE_KEY);
    return true;
  } catch { return false; }
}

export {
  archiveOldTransactions,
  restoreArchivedTransactions,
  getArchivedTransactions,
  getArchiveStats,
  clearArchive,
};
