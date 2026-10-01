import { useState } from "react";
import { PiggyBank, AlertCircle, Plane, Disc3 } from "lucide-react";
import { GoalsView } from "./GoalsView.jsx";
import { LimitsView } from "./LimitsView.jsx";
import { TripsView } from "./TripsView.jsx";
import { HobbyView } from "./HobbyView.jsx";
import { t } from "../i18n.js";

/**
 * PlansView - parent dla "Plany". Zawiera 4 sub-zakładki:
 *   - Cele     (oszczędnościowe + emerytura, wycięte z GoalsView)
 *   - Limity   (limity miesięczne, wycięte z GoalsView do osobnego LimitsView)
 *   - Wyjazdy  (lista + szczegóły + archiwum)
 *   - Hobby    (lista hobby + szczegóły każdego)
 *
 * v1.2.1: Hobby przeniesione tu z osobnego tabu w bottom nav.
 *         Limity wycięte z GoalsView jako osobna sub-zakładka.
 */
function PlansView({
  modules = null, initialSubTab = null,
  proStatus, openUpgrade,
  goals, setGoals,
  accounts, budgets, setBudgets,
  transactions, setTransactions,
  month, cycleDay,
  vacationArchive, setVacationArchive,
  allCats,
  trips, setTrips,
  hobbies, setHobbies,
  portfolio,
}) {
  // Sidegig: sub-zakładki zależą od włączonych modułów. Cele i limity należą do
  // budżetu osobistego; Wyjazdy do modułu Trips; Hobby to moduł Kolekcje.
  // modules === null (stary kod / brak setupu) → pokazuj wszystko.
  const allTabs = [
    { id: "trips",  label: t("plans.tab.trips"),  Icon: Plane,       module: "trips" },
    { id: "hobby",  label: t("plans.tab.collections", "Kolekcje"), Icon: Disc3, module: "collections" },
    { id: "goals",  label: t("plans.tab.goals"),  Icon: PiggyBank,   module: "personal" },
    { id: "limits", label: t("plans.tab.limits"), Icon: AlertCircle, module: "personal" },
  ];
  const tabs = Array.isArray(modules) ? allTabs.filter(tb => modules.includes(tb.module)) : allTabs;
  const [chosen, setSubTab] = useState(initialSubTab);
  const subTab = tabs.some(tb => tb.id === chosen) ? chosen : (tabs[0] ? tabs[0].id : null);

  if (tabs.length === 0) return (
    <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
      {t("plans.empty", "Włącz moduł Wyjazdy, Kolekcje albo Budżet osobisty w Więcej → Moduły.")}
    </div>
  );

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{
        padding: "0 16px", marginBottom: 14,
        display: "flex", gap: 4,
      }}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
              fontWeight: 700, fontSize: 11,
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              background: subTab === id
                ? "linear-gradient(135deg,#059669,#10b981)"
                : "#0f1825",
              border: subTab === id ? "1px solid #10b981" : "1px solid #1a2744",
              color: subTab === id ? "white" : "#64748b",
              transition: "all 0.15s ease",
              minWidth: 0,
            }}>
            <Icon size={12} color={subTab === id ? "white" : "#64748b"}/>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {subTab === "goals" && (
        <GoalsView
          proStatus={proStatus} openUpgrade={openUpgrade}
          goals={goals} setGoals={setGoals}
          accounts={accounts} budgets={budgets} setBudgets={setBudgets}
          transactions={transactions} month={month} cycleDay={cycleDay}
          vacationArchive={vacationArchive} setVacationArchive={setVacationArchive}
          allCats={allCats}
          portfolio={portfolio}
        />
      )}

      {subTab === "limits" && (
        <LimitsView
          budgets={budgets} setBudgets={setBudgets}
          transactions={transactions}
          allCats={allCats}
          month={month} cycleDay={cycleDay}
        />
      )}

      {subTab === "trips" && (
        <TripsView
          trips={trips} setTrips={setTrips}
          transactions={transactions} setTransactions={setTransactions}
          allCats={allCats}
          vacationArchive={vacationArchive}
        />
      )}

      {subTab === "hobby" && (
        <HobbyView
          hobbies={hobbies} setHobbies={setHobbies}
          transactions={transactions}
          allCats={allCats}
          month={month} cycleDay={cycleDay}
        />
      )}
    </div>
  );
}

export { PlansView };
