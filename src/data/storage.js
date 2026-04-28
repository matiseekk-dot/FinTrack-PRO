import { encryptString, decryptString } from "../lib/crypto.js";
import { dateToLocal } from "../utils.js";

const LS_KEY = "fintrack_v1";

async function saveToStorage(data) {
  try {
    // Przed zapisem: usuń icon (React component) z customCats - nie zachowuje się po JSON
    const safe = { ...data };
    if (Array.isArray(safe.customCats)) {
      safe.customCats = safe.customCats.map(c => {
        const { icon, ...rest } = c;
        return { ...rest, iconName: rest.iconName || (icon && icon.displayName) || "Wallet" };
      });
    }

    const serialized = JSON.stringify(safe);
    const encrypted = await encryptString(serialized);

    try {
      localStorage.setItem(LS_KEY, encrypted);
      return true;
    } catch (quotaErr) {
      if (quotaErr.name === "QuotaExceededError" || quotaErr.code === 22) {
        console.error("[FT] Quota exceeded - użyj StorageWarning w Dashboard by zarchiwizować");
        return false;
      }
      throw quotaErr;
    }
  } catch(e) {
    console.error("[FT] save failed", e);
    return false;
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
  // ensure trips/hobbies są tablicami
  if (!Array.isArray(d.trips))    d.trips    = [];
  if (!Array.isArray(d.hobbies))  d.hobbies  = [];
  // capitalize custom category labels (migration for old data)
  if (Array.isArray(d.customCats)) {
    d.customCats = d.customCats.map(c => {
      const out = { ...c };
      out.label = c.label ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : c.label;
      // Icon musi być funkcją (React component). Jeśli zepsuty obiekt (np. po JSON stringify) — usuń
      if (out.icon != null && typeof out.icon !== "function") {
        // Zachowaj iconName dla ICON_MAP lookup
        if (!out.iconName && typeof out.icon === "object" && out.icon.displayName) {
          out.iconName = out.icon.displayName;
        }
        delete out.icon;
      }
      out.iconName = out.iconName || "Wallet";
      return out;
    });
  }

  // Sanitize liczbowe pola - zamień NaN/Infinity/undefined na 0
  // Chroni przed propagacją NaN w .reduce() sumach
  const safeNum = (v) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  };

  if (Array.isArray(d.transactions)) {
    d.transactions = d.transactions
      .map(t => ({ ...t, amount: safeNum(t.amount) }))
      .filter(t => t.id && t.date);  // usuń transakcje bez ID lub daty
  }
  if (Array.isArray(d.accounts)) {
    d.accounts = d.accounts.map(a => ({ ...a, balance: safeNum(a.balance) }));
  }
  if (Array.isArray(d.budgets)) {
    d.budgets = d.budgets.map(b => ({ ...b, limit: Math.max(0, safeNum(b.limit)) }));
  }
  if (Array.isArray(d.goals)) {
    d.goals = d.goals.map(g => ({
      ...g,
      target: Math.max(0, safeNum(g.target)),
      saved:  safeNum(g.saved),
    }));
  }
  if (Array.isArray(d.payments)) {
    d.payments = d.payments.map(p => ({ ...p, amount: safeNum(p.amount) }));
  }
  if (Array.isArray(d.trips)) {
    d.trips = d.trips
      .filter(t => t && t.id != null)
      .map(t => ({
        ...t,
        budget: Math.max(0, safeNum(t.budget)),
        archived: !!t.archived,
        // Nazwa wymagana - jeśli pusta, daj fallback
        name: t.name || "Wyjazd",
      }));
  }
  if (Array.isArray(d.hobbies)) {
    d.hobbies = d.hobbies
      .filter(h => h && h.id != null)
      .map(h => ({
        ...h,
        categories: Array.isArray(h.categories) ? h.categories : [],
        keywords:   Array.isArray(h.keywords)   ? h.keywords   : [],
        yearlyTarget: h.yearlyTarget != null ? Math.max(0, safeNum(h.yearlyTarget)) : null,
        archived: !!h.archived,
        name: h.name || "Hobby",
      }));
  }

  return d;
}

async function loadFromStorage() {
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (raw) {
      // Deszyfruj jeśli zaszyfrowane
      if (raw.startsWith("enc:v1:")) {
        raw = await decryptString(raw);
        if (!raw) { console.warn("[FT] Failed to decrypt, using defaults"); return null; }
      }
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
    a.download = "fintrack_" + dateToLocal(new Date()) + ".json";
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
