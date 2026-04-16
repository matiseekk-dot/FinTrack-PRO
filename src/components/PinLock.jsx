import { useState, useEffect } from "react";

const PIN_KEY = "ft_pin_hash";
const PIN_ENABLED_KEY = "ft_pin_enabled";

function hashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = Math.imul(31, h) + pin.charCodeAt(i) | 0;
  }
  return String(h);
}

function PinPad({ title, subtitle, onSubmit, onCancel, showCancel = false, error = false }) {
  const [digits, setDigits] = useState("");
  const [shake, setShake] = useState(false);

  const press = (d) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setTimeout(() => {
        const ok = onSubmit(next);
        if (ok === false) {
          setShake(true);
          setTimeout(() => { setShake(false); setDigits(""); }, 600);
        } else {
          setDigits("");
        }
      }, 100);
    }
  };

  const del = () => setDigits(d => d.slice(0, -1));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "#060b14",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{ marginBottom: 36, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <span style={{ fontSize: 30 }}>🔐</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#e2e8f0" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, color: shake ? "#ef4444" : "#475569", marginTop: 6, transition: "color 0.2s" }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{
        display: "flex", gap: 16, marginBottom: 44,
        animation: shake ? "pinShake 0.5s ease" : "none",
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: "50%",
            background: digits.length > i ? "#3b82f6" : "transparent",
            border: `2px solid ${digits.length > i ? "#3b82f6" : "#1e3a5f"}`,
            transition: "all 0.15s",
            boxShadow: digits.length > i ? "0 0 8px #3b82f633" : "none",
          }}/>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", maxWidth: 264 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => press(String(n))} style={{
            background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
            height: 68, fontSize: 24, fontWeight: 600, color: "#e2e8f0",
            cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
          }}>{n}</button>
        ))}
        <button onClick={showCancel && onCancel ? onCancel : undefined} style={{
          background: "none", border: "none", height: 68,
          fontSize: 12, color: showCancel ? "#475569" : "transparent",
          cursor: showCancel ? "pointer" : "default",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{showCancel ? "Anuluj" : ""}</button>
        <button onClick={() => press("0")} style={{
          background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
          height: 68, fontSize: 24, fontWeight: 600, color: "#e2e8f0",
          cursor: "pointer",
        }}>0</button>
        <button onClick={del} style={{
          background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
          height: 68, fontSize: 20, color: "#64748b", cursor: "pointer",
        }}>⌫</button>
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-10px)}
          40%,80%{transform:translateX(10px)}
        }
      `}</style>
    </div>
  );
}

// Ekran odblokowania (używany w App.jsx)
function PinScreen({ onSuccess, title = "FinTrack PRO" }) {
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = (pin) => {
    const stored = localStorage.getItem(PIN_KEY);
    if (stored && hashPin(pin) === stored) {
      onSuccess();
      return true;
    }
    setAttempts(a => a + 1);
    return false;
  };

  return (
    <PinPad
      title={title}
      subtitle={attempts > 0
        ? `Nieprawidłowy PIN · próba ${attempts}`
        : "Podaj PIN aby odblokować"}
      onSubmit={handleSubmit}
    />
  );
}

// Panel ustawień PIN (do wbudowania w SettingsPanel)
function PinSettings() {
  const [enabled, setEnabled] = useState(localStorage.getItem(PIN_ENABLED_KEY) === "1");
  const [mode, setMode] = useState(null); // null | setup | confirm | disable

  const handleSetup = (pin) => {
    sessionStorage.setItem("_pin_tmp", pin);
    setMode("confirm");
    return true;
  };

  const handleConfirm = (pin) => {
    const first = sessionStorage.getItem("_pin_tmp");
    sessionStorage.removeItem("_pin_tmp");
    if (pin === first) {
      localStorage.setItem(PIN_KEY, hashPin(pin));
      localStorage.setItem(PIN_ENABLED_KEY, "1");
      setEnabled(true);
      setMode(null);
      return true;
    }
    setMode(null);
    return false;
  };

  const handleDisable = (pin) => {
    const stored = localStorage.getItem(PIN_KEY);
    if (stored && hashPin(pin) === stored) {
      localStorage.removeItem(PIN_KEY);
      localStorage.removeItem(PIN_ENABLED_KEY);
      setEnabled(false);
      setMode(null);
      return true;
    }
    return false;
  };

  if (mode === "setup")   return <PinPad title="Ustaw PIN" subtitle="Wpisz 4-cyfrowy PIN" onSubmit={handleSetup} onCancel={() => setMode(null)} showCancel/>;
  if (mode === "confirm") return <PinPad title="Potwierdź PIN" subtitle="Wpisz PIN ponownie" onSubmit={handleConfirm} onCancel={() => setMode(null)} showCancel/>;
  if (mode === "disable") return <PinPad title="Podaj PIN" subtitle="Wpisz aktualny PIN aby wyłączyć" onSubmit={handleDisable} onCancel={() => setMode(null)} showCancel/>;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
          {enabled ? "🔒 Blokada PIN włączona" : "🔓 Blokada PIN"}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
          {enabled ? "Apka jest zabezpieczona kodem PIN" : "Zabezpiecz apkę 4-cyfrowym kodem"}
        </div>
      </div>
      <button
        onClick={() => setMode(enabled ? "disable" : "setup")}
        style={{
          background: enabled ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#0d1628",
          border: `1px solid ${enabled ? "#2563eb" : "#1e3a5f"}`,
          borderRadius: 10, padding: "8px 16px", cursor: "pointer",
          color: enabled ? "white" : "#64748b",
          fontSize: 12, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {enabled ? "Wyłącz" : "Włącz PIN"}
      </button>
    </div>
  );
}

export { PinScreen, PinSettings, PIN_KEY, PIN_ENABLED_KEY, hashPin };
