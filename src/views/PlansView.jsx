import { useState } from "react";
import { PiggyBank, Plane } from "lucide-react";
import { GoalsView } from "./GoalsView.jsx";
import { TripsView } from "./TripsView.jsx";
import { t } from "../i18n.js";

/**
 * PlansView - parent dla "Plany". Zawiera 2 sub-zakładki:
 *   - Cele (oszczędnościowe + emerytura)
 *   - Wyjazdy (lista + szczegóły + archiwum)
 *
 * Hobby ma swój osobny tab w głównej nawigacji.
 *
 * Wzorowane na PortfolioCombinedView żeby zachować spójność wizualną.
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
}) {
  const [subTab, setSubTab] = useState("goals");

  const tabs = [
    { id: "goals",  label: t("plans.tab.goals"),  Icon: PiggyBank },
    { id: "trips",  label: t("plans.tab.trips"),  Icon: Plane     },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{
        padding: "0 16px", marginBottom: 14,
        display: "flex", gap: 6,
      }}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 12, cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: subTab === id
                ? "linear-gradient(135deg,#1e40af,#7c3aed)"
                : "#0f1825",
              border: subTab === id ? "1px solid #2563eb" : "1px solid #1a2744",
              color: subTab === id ? "white" : "#64748b",
              transition: "all 0.15s ease",
            }}>
            <Icon size={13} color={subTab === id ? "white" : "#64748b"}/>
            {label}
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

      {subTab === "trips" && (
        <TripsView
          trips={trips} setTrips={setTrips}
          transactions={transactions} setTransactions={setTransactions}
          allCats={allCats}
          vacationArchive={vacationArchive}
        />
      )}
    </div>
  );
}

export { PlansView };
