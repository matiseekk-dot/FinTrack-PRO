import { useState } from "react";
import { PiggyBank, AlertCircle, Plane, Heart } from "lucide-react";
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
  proStatus, openUpgrade,
  goals, setGoals,
  accounts, budgets, setBudgets,
  transactions, setTransactions,
  month, cycleDay,
  vacationArchive, setVacationArchive,
  allCats,
  trips, setTrips,
  hobbies, setHobbies,
}) {
  const [subTab, setSubTab] = useState("goals");

  const tabs = [
    { id: "goals",  label: t("plans.tab.goals"),  Icon: PiggyBank    },
    { id: "limits", label: t("plans.tab.limits"), Icon: AlertCircle  },
    { id: "trips",  label: t("plans.tab.trips"),  Icon: Plane        },
    { id: "hobby",  label: t("plans.tab.hobby"),  Icon: Heart        },
  ];

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
                ? "linear-gradient(135deg,#1e40af,#7c3aed)"
                : "#0f1825",
              border: subTab === id ? "1px solid #2563eb" : "1px solid #1a2744",
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
