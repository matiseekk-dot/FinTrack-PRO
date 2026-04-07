import * as XLSX from "xlsx";

const LS_KEY = "fintrack_v1";

function saveToStorage(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return Promise.resolve(true);
  } catch(e) {
    console.error("[FT] save failed", e);
    return Promise.resolve(false);
  }
}

function migrateData(d) {
  // v1 v2: bills+recurring   payments
  if (!d.payments && (d.bills || d.recurring)) {
    const bills     = d.bills     || [];
    const recurring = d.recurring || [];
    d.payments = [
      ...bills.map(b => ({
        id: b.id, name: b.name,
        amount: -(Math.abs(b.amount || 0)),
        cat: b.cat || "rachunki",
        acc: b.acc || 1,
        color: b.color || "#f59e0b",
        type: "bill",
        freq: "monthly",
        dueDay: b.dueDay || 1,
        dayOfMonth: b.dueDay || 1,
        trackPaid: true,
        shared: false,
      })),
      ...recurring
        .filter(r => !bills.find(b => b.name === r.desc))
        .map(r => ({
          id: r.id, name: r.desc || r.name,
          amount: r.amount || 0,
          cat: r.cat || "rachunki",
          acc: r.acc || 1,
          color: "#8b5cf6",
          type: r.freq === "weekly" ? "sub" : "bill",
          freq: r.freq || "monthly",
          dueDay: r.dayOfMonth || 1,
          dayOfMonth: r.dayOfMonth || 1,
          dayOfWeek: r.dayOfWeek || 1,
          trackPaid: false,
          shared: false,
        })),
    ];
    delete d.bills;
    delete d.recurring;
  }
  // ensure payments is always array
  if (!Array.isArray(d.payments)) d.payments = [];
  // ensure goals is always array
  if (!Array.isArray(d.goals)) d.goals = [];
  // ensure accounts have required fields
  if (Array.isArray(d.accounts)) {
    d.accounts = d.accounts.map(a => ({
      ...a,
      type: a.type || "checking",
      color: a.color || "#3b82f6",
      iban: a.iban || "",
    }));
  }
  // ensure paid is object
  if (!d.paid || typeof d.paid !== "object") d.paid = {};
  return d;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Promise.resolve(migrateData(parsed));
    }
  } catch(e) {
    console.warn("[FT] load error, clearing corrupt data:", e);
    try { localStorage.removeItem(LS_KEY); } catch(_) {}
  }
  return Promise.resolve(null);
}

// JSON export/import (backup)
function downloadJSON(data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "fintrack_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return true;
  } catch(e) { return false; }
}

function loadSnapshotFromJSON(json) {
  try {
    const d = JSON.parse(json);
    // Akceptuj backup z polem "v" lub bez (stare wersje apki)
    if (d && (d.v || d.accounts || d.transactions)) return migrateData(d);
    return null;
  }
  catch(_) { return null; }
}





export { LS_KEY, saveToStorage, migrateData, loadFromStorage, downloadJSON, loadSnapshotFromJSON };
