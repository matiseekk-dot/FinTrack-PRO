import { useState } from "react";
import { Wallet, TrendingUp } from "lucide-react";
import { AccountsView } from "./AccountsView.jsx";
import { InvestmentsView } from "./InvestmentsView.jsx";

/**
 * Łączony widok Konta + Inwestycje jako jeden tab "Portfel".
 * Zamiast dwóch oddzielnych tabów w nawigacji, mamy jeden z wewnętrznymi zakładkami.
 */
function PortfolioCombinedView({
  proStatus, openUpgrade,
  accounts, setAccounts,
  portfolio, setPortfolio,
}) {
  const [subTab, setSubTab] = useState("accounts"); // "accounts" | "investments"

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{
        padding: "0 16px",
        marginBottom: 14,
        display: "flex",
        gap: 8,
      }}>
        {[
          { id: "accounts",    label: "Konta",       Icon: Wallet },
          { id: "investments", label: "Inwestycje",  Icon: TrendingUp },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: subTab === id
                ? "linear-gradient(135deg,#1e40af,#7c3aed)"
                : "#0f1825",
              border: subTab === id ? "1px solid #2563eb" : "1px solid #1a2744",
              color: subTab === id ? "white" : "#64748b",
            }}
          >
            <Icon size={14} color={subTab === id ? "white" : "#64748b"} />
            {label}
          </button>
        ))}
      </div>

      {/* Render wewnętrzny widok */}
      {subTab === "accounts" && (
        <AccountsView
          proStatus={proStatus}
          openUpgrade={openUpgrade}
          accounts={accounts}
          setAccounts={setAccounts}
        />
      )}
      {subTab === "investments" && (
        <InvestmentsView
          portfolio={portfolio}
          setPortfolio={setPortfolio}
          accounts={accounts}
        />
      )}
    </div>
  );
}

export { PortfolioCombinedView };
