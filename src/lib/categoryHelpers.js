// Helper do rozwiązywania ID kategorii na pełny obiekt z ikoną i kolorem.
//
// Wcześniej (pre-v1.4) ten sam ~5-liniowy `getLocalCat` był skopiowany w
// Dashboard.jsx, TransactionsView.jsx, GoalsView.jsx, AccountsView.jsx,
// HobbyView.jsx — łącznie 5 kopii. Teraz jeden wspólny.
//
// Dlaczego osobny helper, nie samo `getCat` z constants.js?
// - getCat zna tylko BASE_CATEGORIES, nie zna `customCats` (user-defined)
// - getCat nie wymusza walidacji `icon` (po JSON roundtrip ikony stają się obiektami)
// - capitalize labela trzeba zrobić "ostatecznie" przed renderem
//
// resolveCategory(cat, allCats) zwraca:
//   { id, label, icon: ReactComponent, color, group?, expenseType? }
// Bezpieczne dla nieznanych ID — zwraca fallback z ikoną Wallet.

import { Wallet } from "lucide-react";
import { getCat } from "../constants.js";

function capitalize(s) {
  if (!s || typeof s !== "string") return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Zwraca pełny obiekt kategorii z ikoną Renderowalną (function/class).
 *
 * @param {string} catId — id kategorii (np. "jedzenie")
 * @param {Array}  allCats — BASE + customCats merged (typowo z App.jsx allCategories)
 * @returns {{ id, label, icon, color, group?, expenseType? }}
 */
function resolveCategory(catId, allCats) {
  const list = Array.isArray(allCats) ? allCats : [];
  const found = list.find(c => c.id === catId);
  if (found) {
    return {
      ...found,
      icon: typeof found.icon === "function" ? found.icon : Wallet,
      label: capitalize(found.label),
    };
  }
  // Fallback do getCat (BASE_CATEGORIES) — działa dla starszych tx z ID których
  // już nie ma w customCats po edycji.
  return getCat(catId);
}

export { resolveCategory };
