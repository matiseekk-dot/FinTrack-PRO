/**
 * Archiwizacja starych transakcji żeby nie przekroczyć Firestore 1MB limit.
 * 
 * Strategia: tx starsze niż 2 lata → przeniesione do localStorage, usunięte z Firestore.
 * Użytkownik nadal je widzi w Analizie ("dane historyczne"), ale nie w głównej liście.
 * 
 * Wywoływane ręcznie lub automatycznie gdy dokument > 90% limitu.
 */

import { dateToLocal } from "../utils.js";

const ARCHIVE_KEY = "ft_archive_tx";

function getArchivedTransactions() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
    console.error("[FT] Archive failed - localStorage full", e);
    return { archived: 0, kept: transactions.length, error: true };
  }
}

export {
  archiveOldTransactions,
};
