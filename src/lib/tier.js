// Tier management - Free vs PRO
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
    };
  } catch (_) {
    return { isPro: false, type: null, since: null, expiresAt: null };
  }
}

function activatePro(type, licenseKey) {
  const now = new Date().toISOString();
  const expiresAt = type === "yearly"
    ? new Date(Date.now() + 365 * 86400000).toISOString()
    : null;
  localStorage.setItem(PRO_KEY, JSON.stringify({
    type, since: now, expiresAt, licenseKey,
  }));
  return getProStatus();
}

function deactivatePro() {
  localStorage.removeItem(PRO_KEY);
}

function getLimits(isPro) {
  return isPro ? PRO_LIMITS : FREE_LIMITS;
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
  FREE_LIMITS, PRO_LIMITS,
  getProStatus, activatePro, deactivatePro, getLimits,
  countMonthlyTransactions, canAddTransaction,
};
