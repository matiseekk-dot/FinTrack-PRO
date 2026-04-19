import { useState } from "react";
import { Wallet, ArrowRight, Check, Plus } from "lucide-react";
import { FontLoader } from "./FontLoader.jsx";

const BANKS = [
  { id: "pko",     name: "PKO BP",      color: "#004B93", short: "PKO" },
  { id: "mbank",   name: "mBank",       color: "#E30613", short: "mB" },
  { id: "ing",     name: "ING",         color: "#FF6200", short: "ING" },
  { id: "santander", name: "Santander", color: "#EC0000", short: "SAN" },
  { id: "pekao",   name: "Pekao",       color: "#E30613", short: "PKO" },
  { id: "revolut", name: "Revolut",     color: "#0066FF", short: "REV" },
  { id: "millennium", name: "Millennium", color: "#722F37", short: "MIL" },
  { id: "other",   name: "Inny",        color: "#64748b", short: "?" },
];

function EmptyStateSetup({ onComplete }) {
  const [step, setStep] = useState(1); // 1 = bank, 2 = saldo, 3 = done
  const [bank, setBank] = useState(null);
  const [balance, setBalance] = useState("");
  const [accName, setAccName] = useState("");

  const handleBankSelect = (b) => {
    setBank(b);
    setAccName(b.name === "Inny" ? "Konto główne" : b.name);
    setStep(2);
  };

  const handleSaveBalance = () => {
    const parsed = parseFloat(String(balance).replace(",", "."));
    if (!isFinite(parsed)) return;
    onComplete({
      name: accName || "Konto główne",
      balance: parsed,
      type: "checking",
      bank: bank?.name || "",
      color: bank?.color || "#3b82f6",
      iban: "",
    });
  };

  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      background: "linear-gradient(180deg,#060b14 0%,#0d1628 100%)",
      color: "#e2e8f0", minHeight: "100dvh",
      padding: "24px 20px",
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
      display: "flex", flexDirection: "column",
    }}>
      <FontLoader/>

      {/* Progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
        {[1,2].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= step ? "#60a5fa" : "#1e3a5f",
            transition: "background 0.3s",
          }}/>
        ))}
      </div>

      {step === 1 && (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg,#1e40af,#7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20, boxShadow: "0 8px 24px #7c3aed44",
          }}>
            <Wallet size={28} color="white"/>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Dodaj swój bank
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28, lineHeight: 1.5 }}>
            Zacznij od głównego konta. Kolejne dodasz w każdej chwili.
          </p>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10, flex: 1, alignContent: "start",
          }}>
            {BANKS.map(b => (
              <button key={b.id} onClick={() => handleBankSelect(b)} style={{
                background: "#0d1628", border: "1px solid #1e3a5f66",
                borderRadius: 14, padding: "18px 8px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                cursor: "pointer", transition: "all 0.15s",
                aspectRatio: "1",
              }}
              onTouchStart={e => e.currentTarget.style.background = "#1e3a5f"}
              onTouchEnd={e => e.currentTarget.style.background = "#0d1628"}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: b.color, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "white",
                }}>
                  {b.short}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1", textAlign: "center" }}>
                  {b.name}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: bank?.color || "#3b82f6",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20, color: "white", fontWeight: 800, fontSize: 18,
          }}>
            {bank?.short}
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Saldo na koncie
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28, lineHeight: 1.5 }}>
            Wpisz aktualne saldo w {bank?.name}. Będzie to Twój punkt startowy.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "block" }}>
              Nazwa konta
            </label>
            <input
              type="text"
              value={accName}
              onChange={e => setAccName(e.target.value)}
              placeholder="np. Osobiste, Wspólne, Firmowe"
              style={{
                width: "100%", padding: "14px 16px",
                background: "#0d1628", border: "1px solid #1e3a5f",
                borderRadius: 12, color: "#e2e8f0", fontSize: 15,
                boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "block" }}>
              Aktualne saldo
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                inputMode="decimal"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="0,00"
                autoFocus
                style={{
                  width: "100%", padding: "18px 60px 18px 16px",
                  background: "#0d1628", border: "1px solid #1e3a5f",
                  borderRadius: 12, color: "#e2e8f0",
                  fontSize: 22, fontWeight: 700,
                  fontFamily: "'DM Mono', monospace",
                  boxSizing: "border-box",
                }}
              />
              <span style={{
                position: "absolute", right: 16, top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b", fontSize: 16, fontWeight: 600,
              }}>zł</span>
            </div>
          </div>

          <div style={{ flex: 1 }}/>

          <button onClick={handleSaveBalance} disabled={!balance || !isFinite(parseFloat(String(balance).replace(",","."))) } style={{
            width: "100%", padding: 16, borderRadius: 14,
            background: (!balance || !isFinite(parseFloat(String(balance).replace(",",".")))) ? "#1e3a5f" : "linear-gradient(135deg,#1e40af,#7c3aed)",
            border: "none", color: "white", fontWeight: 800, fontSize: 15,
            cursor: balance ? "pointer" : "not-allowed",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            Gotowe <ArrowRight size={18}/>
          </button>

          <button onClick={() => setStep(1)} style={{
            marginTop: 10, padding: 10, background: "none",
            border: "none", color: "#64748b", fontSize: 13,
            cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
          }}>
            ← Zmień bank
          </button>
        </>
      )}
    </div>
  );
}

export { EmptyStateSetup };
