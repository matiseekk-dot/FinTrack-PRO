// Tier management - Free vs PRO.
//
// v1.3.0: Refactor po przejściu z Gumroad license keys na Google Play Billing
// (przez RevenueCat). Główne zmiany:
//   - activatePro(type, licenseKey) → setProStatus({ type, expiresAt, source })
//   - proStatus.licenseKey usunięty z payload (nie potrzebne dla Play Store IAP)
//   - source: "play_store" | "trial" | "manual" pozwala na przyszłą integrację
//     z RevenueCat (gdzie source = "play_store" + entitlement.expiresDate)
//
// RevenueCat integration TODO (osobna sesja):
//   - Po purchase RevenueCat → webhook → set isPro w Firestore
//   - Klient nasłuchuje Firestore proStatus → setProStatus({ source: "play_store", ...})
//   - Gdy entitlement wygasa → setProStatus(null) (RC daje expirationDate)

const PRO_KEY = "ft_pro_status";

const FREE_LIMITS = {
  transactionsPerMonth: 50,
  accounts: 2,
  budgets: 1,
  goals: 1,
  customCategories: 0,
  canImport: false,
  canSync: false,
  canExportPDF: false,
  canUsePIN: true,
};

const PRO_LIMITS = {
  transactionsPerMonth: Infinity,
  accounts: Infinity,
  budgets: Infinity,
  goals: Infinity,
  customCategories: 20,
  canImport: true,
  canSync: true,
  canExportPDF: true,
  canUsePIN: true,
};

function getProStatus() {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    if (!raw) return { isPro: false, type: null, since: null, expiresAt: null };
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
      return { isPro: false, type: null, since: null, expiresAt: null, wasProUntil: parsed.expiresAt };
    }
    return {
      isPro: true,
      type: parsed.type || "unknown",
      since: parsed.since,
      expiresAt: parsed.expiresAt,
      source: parsed.source || "unknown",
    };
  } catch (_) {
    return { isPro: false, type: null, since: null, expiresAt: null };
  }
}

/**
 * Zwraca raw payload z localStorage żeby App mógł go syncować przez Firestore.
 * Bez wywoływania getProStatus() bo ten sprawdza expiresAt i mógłby zwrócić null
 * dla wygasłej licencji którą i tak chcemy zachować w sync.
 */
function getProStatusRaw() {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Ustaw status PRO z remote sync (Firestore). Używane gdy user zaloguje się
 * na drugim urządzeniu - powinien dostać swoje PRO bez ponownej aktywacji.
 * v1.3.0: ignoruje pole licenseKey ze starych payloads (graceful degradation).
 */
function setProStatusFromRemote(remoteData) {
  if (!remoteData || typeof remoteData !== "object") return;
  if (!remoteData.type || !remoteData.since) return;
  // Nie nadpisuj jeśli lokalna aktywacja jest świeższa
  const local = getProStatusRaw();
  if (local && local.since && remoteData.since && local.since >= remoteData.since) return;
  // Sanitization: usuwamy stare licenseKey, normalizujemy source
  const clean = {
    type: remoteData.type,
    since: remoteData.since,
    expiresAt: remoteData.expiresAt || null,
    source: remoteData.source || "unknown",
  };
  localStorage.setItem(PRO_KEY, JSON.stringify(clean));
}

/**
 * Ustaw PRO status. Wywoływane przez RevenueCat callback (przyszłość) lub manual
 * grant w Settings (jeśli zachowamy taką funkcję dla testów / promo codes).
 *
 * @param {object} opts
 * @param {"yearly"|"lifetime"|"trial"} opts.type
 * @param {string} [opts.expiresAt] - ISO date string. Lifetime = null.
 * @param {"play_store"|"trial"|"manual"} [opts.source="manual"]
 */
function setProStatus({ type, expiresAt = null, source = "manual" }) {
  if (!type) {
    console.warn("[tier] setProStatus called without type");
    return getProStatus();
  }
  const now = new Date().toISOString();
  // Jeśli expiresAt nie podany dla yearly - oblicz +365 dni
  const finalExpiresAt = expiresAt
    ? expiresAt
    : (type === "yearly" ? new Date(Date.now() + 365 * 86400000).toISOString() : null);
  localStorage.setItem(PRO_KEY, JSON.stringify({
    type, since: now, expiresAt: finalExpiresAt, source,
  }));
  return getProStatus();
}

function deactivatePro() {
  localStorage.removeItem(PRO_KEY);
}

function countMonthlyTransactions(transactions) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  return transactions.filter(t => t.date && t.date.startsWith(ym)).length;
}

function canAddTransaction(transactions, isPro) {
  if (isPro) return { allowed: true };
  const count = countMonthlyTransactions(transactions);
  const limit = FREE_LIMITS.transactionsPerMonth;
  if (count >= limit) {
    return { allowed: false, reason: "limit", count, limit };
  }
  if (count >= limit * 0.9) {
    return { allowed: true, warning: true, count, limit, remaining: limit - count };
  }
  return { allowed: true, count, limit };
}

export {
  getProStatus, getProStatusRaw, setProStatusFromRemote,
  setProStatus, deactivatePro,
  canAddTransaction,
  FREE_LIMITS, PRO_LIMITS,
};
