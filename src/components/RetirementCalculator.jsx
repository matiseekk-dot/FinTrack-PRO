import { useState } from "react";
import { Calculator, Info } from "lucide-react";
import { fmt } from "../utils.js";
import { 
  LIMITS_2026, 
  calculateIKZETaxSavings,
  calculateIKEBenefit,
  calculatePPKBonus,
} from "../lib/retirementCalc.js";

function RetirementCalculator() {
  const [activeTab, setActiveTab] = useState("ikze");
  
  return (
    <div style={{
      background: "linear-gradient(135deg,#0a1a2e,#0d1628)",
      border: "1px solid #1e3a5f66",
      borderRadius: 16,
      padding: "16px 18px",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Calculator size={14} color="#06b6d4"/>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Kalkulator emerytalny 2026
        </div>
      </div>
      
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[
          { id: "ikze", label: "IKZE" },
          { id: "ike", label: "IKE" },
          { id: "ppk", label: "PPK" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: "8px 10px",
            background: activeTab === tab.id ? "#1e3a5f" : "#060b14",
            border: `1px solid ${activeTab === tab.id ? "#2563eb" : "#1a2744"}`,
            borderRadius: 8,
            color: activeTab === tab.id ? "#60a5fa" : "#64748b",
            fontSize: 12, fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {tab.label}
          </button>
        ))}
      </div>
      
      {activeTab === "ikze" && <IKZECalculator/>}
      {activeTab === "ike" && <IKECalculator/>}
      {activeTab === "ppk" && <PPKCalculator/>}
    </div>
  );
}

function IKZECalculator() {
  const [amount, setAmount] = useState(7500);
  const [bracket, setBracket] = useState("low");
  
  const calc = calculateIKZETaxSavings(amount, bracket);
  
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Wpłata roczna IKZE
        </label>
        <div style={{ position: "relative", marginTop: 4 }}>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            style={{
              width: "100%", padding: "10px 40px 10px 12px",
              background: "#060b14", border: "1px solid #1e3a5f",
              borderRadius: 8, color: "#e2e8f0",
              fontSize: 16, fontWeight: 600,
              fontFamily: "'DM Mono', monospace",
              boxSizing: "border-box",
            }}
          />
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b", fontSize: 12 }}>zł</span>
        </div>
        {amount > LIMITS_2026.ikze && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>
            ⚠ Limit roczny {LIMITS_2026.ikze.toLocaleString("pl-PL")} zł — nadwyżka nie będzie liczona
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Twój próg podatkowy
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {[
            { id: "low", label: "12%", hint: "dochód do 120k/rok" },
            { id: "high", label: "32%", hint: "dochód > 120k/rok" },
          ].map(b => (
            <button key={b.id} onClick={() => setBracket(b.id)} style={{
              flex: 1, padding: "8px",
              background: bracket === b.id ? "#1e3a5f" : "#060b14",
              border: `1px solid ${bracket === b.id ? "#2563eb" : "#1a2744"}`,
              borderRadius: 8,
              color: bracket === b.id ? "#60a5fa" : "#64748b",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              <div>{b.label}</div>
              <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.7 }}>{b.hint}</div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Wyniki */}
      <div style={{ background: "#060b14", borderRadius: 10, padding: 12, marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", fontSize: 12 }}>
          <div style={{ color: "#94a3b8" }}>Wpłacasz:</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{fmt(calc.contribution)}</div>
          
          <div style={{ color: "#10b981" }}>Zaoszczędzisz na PIT:</div>
          <div style={{ color: "#10b981", fontWeight: 700, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>−{fmt(calc.taxSavings)}</div>
          
          <div style={{ color: "#94a3b8", paddingTop: 6, borderTop: "1px solid #1a2744" }}>Faktyczny koszt:</div>
          <div style={{ color: "#06b6d4", fontWeight: 700, fontSize: 14, fontFamily: "'DM Mono', monospace", textAlign: "right", paddingTop: 6, borderTop: "1px solid #1a2744" }}>
            {fmt(calc.netCost)}
          </div>
        </div>
        
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#0a1a2e", borderRadius: 6, fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>
          <Info size={10} style={{ display: "inline", marginRight: 4 }}/>
          Przy wypłacie po 65 r.ż. zapłacisz 10% ryczałt (~{fmt(calc.futureTaxOnWithdrawal)}). 
          Netto korzyść: <span style={{ color: "#10b981" }}>{fmt(calc.netBenefit)}</span>
        </div>
      </div>
    </div>
  );
}

function IKECalculator() {
  const [balance, setBalance] = useState(10000);
  const [years, setYears] = useState(20);
  
  const calc = calculateIKEBenefit(balance, 0.05, years);
  
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Aktualne saldo IKE
        </label>
        <input
          type="number"
          value={balance}
          onChange={e => setBalance(parseFloat(e.target.value) || 0)}
          style={{
            width: "100%", padding: "10px 12px", marginTop: 4,
            background: "#060b14", border: "1px solid #1e3a5f",
            borderRadius: 8, color: "#e2e8f0",
            fontSize: 16, fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            boxSizing: "border-box",
          }}
        />
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Lata do emerytury ({years})
        </label>
        <input
          type="range"
          min="5" max="40"
          value={years}
          onChange={e => setYears(parseInt(e.target.value))}
          style={{ width: "100%", marginTop: 8 }}
        />
      </div>
      
      <div style={{ background: "#060b14", borderRadius: 10, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", fontSize: 12 }}>
          <div style={{ color: "#94a3b8" }}>Dziś masz:</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{fmt(calc.currentBalance)}</div>
          
          <div style={{ color: "#94a3b8" }}>Za {years} lat (~5% rocznie):</div>
          <div style={{ color: "#10b981", fontWeight: 700, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{fmt(calc.futureValue)}</div>
          
          <div style={{ color: "#94a3b8" }}>Zysk:</div>
          <div style={{ color: "#10b981", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>+{fmt(calc.profit)}</div>
          
          <div style={{ color: "#14b8a6", paddingTop: 6, borderTop: "1px solid #1a2744" }}>Oszczędzisz na Belce:</div>
          <div style={{ color: "#14b8a6", fontWeight: 700, fontSize: 14, fontFamily: "'DM Mono', monospace", textAlign: "right", paddingTop: 6, borderTop: "1px solid #1a2744" }}>
            −{fmt(calc.belkaTaxAvoided)}
          </div>
        </div>
        
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#0a1a2e", borderRadius: 6, fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>
          <Info size={10} style={{ display: "inline", marginRight: 4 }}/>
          Limit wpłat w 2026: {LIMITS_2026.ike.toLocaleString("pl-PL")} zł. Zwolnienie z 19% Belki przy wypłacie po 60 r.ż.
        </div>
      </div>
    </div>
  );
}

function PPKCalculator() {
  const [salary, setSalary] = useState(8000);
  const [years, setYears] = useState(5);
  
  // Typowo: 2% pensji + 1.5% pracodawca + 240 zł rocznie państwo
  const yourAnnual = salary * 12 * 0.02;
  const employerAnnual = salary * 12 * 0.015;
  
  const calc = calculatePPKBonus(yourAnnual, employerAnnual, years);
  
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Twoje wynagrodzenie brutto (msc)
        </label>
        <div style={{ position: "relative", marginTop: 4 }}>
          <input
            type="number"
            value={salary}
            onChange={e => setSalary(parseFloat(e.target.value) || 0)}
            style={{
              width: "100%", padding: "10px 40px 10px 12px",
              background: "#060b14", border: "1px solid #1e3a5f",
              borderRadius: 8, color: "#e2e8f0",
              fontSize: 16, fontWeight: 600,
              fontFamily: "'DM Mono', monospace",
              boxSizing: "border-box",
            }}
          />
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b", fontSize: 12 }}>zł</span>
        </div>
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Po ilu latach? ({years})
        </label>
        <input
          type="range"
          min="1" max="40"
          value={years}
          onChange={e => setYears(parseInt(e.target.value))}
          style={{ width: "100%", marginTop: 8 }}
        />
      </div>
      
      <div style={{ background: "#060b14", borderRadius: 10, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", fontSize: 12 }}>
          <div style={{ color: "#94a3b8" }}>Twoje wpłaty (2%):</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{fmt(calc.yourContribution)}</div>
          
          <div style={{ color: "#10b981" }}>Od pracodawcy (1.5%):</div>
          <div style={{ color: "#10b981", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>+{fmt(calc.employerContribution)}</div>
          
          <div style={{ color: "#06b6d4" }}>Od państwa (250 + 240/rok):</div>
          <div style={{ color: "#06b6d4", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "right" }}>+{fmt(calc.governmentContribution)}</div>
          
          <div style={{ color: "#94a3b8", paddingTop: 6, borderTop: "1px solid #1a2744" }}>Łącznie uzbiera się:</div>
          <div style={{ color: "#06b6d4", fontWeight: 700, fontSize: 14, fontFamily: "'DM Mono', monospace", textAlign: "right", paddingTop: 6, borderTop: "1px solid #1a2744" }}>
            {fmt(calc.totalInvested)}
          </div>
        </div>
        
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#0a2e1a", borderRadius: 6, fontSize: 10, color: "#86efac", lineHeight: 1.5 }}>
          🎁 "Darmowa kasa" którą dostaniesz: <strong>{fmt(calc.freeMoney)}</strong>
          {" "}({(calc.freeMoneyRatio * 100).toFixed(0)}% Twoich wpłat)
        </div>
      </div>
    </div>
  );
}

export { RetirementCalculator };
