import { useState, useEffect, useRef } from "react";
import { Lock, Fingerprint, X, Check } from "lucide-react";

const PIN_KEY = "ft_pin";
const PIN_ENABLED_KEY = "ft_pin_enabled";

// Sprawdź czy Web Authentication API jest dostępne (Face ID / Touch ID)
function isBiometricAvailable() {
  return window.PublicKeyCredential !== undefined;
}

// Sprawdź czy urządzenie ma biometrię
async function checkBiometricSupport() {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

// Prosty SHA-256 hash PINu
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// Komponent ekranu PIN
function PinScreen({ mode = "unlock", onSuccess, onCancel, title }) {
  const [digits, setDigits] = useState([]);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [biometricAvail, setBiometricAvail] = useState(false);

  useEffect(() => {
    checkBiometricSupport().then(setBiometricAvail);
  }, []);

  const addDigit = (d) => {
    if (digits.length >= 6) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 6) verifyPin(next);
  };

  const removeDigit = () => setDigits(d => d.slice(0,-1));

  const verifyPin = async (pin) => {
    const hash = await hashPin(pin.join(""));
    const stored = localStorage.getItem(PIN_KEY);
    if (mode === "set") {
      localStorage.setItem(PIN_KEY, hash);
      localStorage.setItem(PIN_ENABLED_KEY, "1");
      onSuccess();
    } else {
      if (hash === stored) {
        onSuccess();
      } else {
        setShake(true);
        setError("Nieprawidłowy PIN");
        setTimeout(() => { setShake(false); setError(""); setDigits([]); }, 600);
      }
    }
  };

  const tryBiometric = async () => {
    try {
      // Używamy credential.get z user verification
      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname,
          userVerification: "required",
          timeout: 60000,
          allowCredentials: [],
        }
      });
      if (cred) onSuccess();
    } catch (e) {
      // Jeśli WebAuthn nie skonfigurowane, próbuj przez prompt
      setError("Użyj PIN");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "#060b14",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Lock size={28} color="white"/>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#e2e8f0", letterSpacing: "-0.02em" }}>FinTrack PRO</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>{title || "Wprowadź PIN"}</div>
      </div>

      {/* Kółka PIN */}
      <div style={{
        display: "flex", gap: 14, marginBottom: 32,
        animation: shake ? "shake 0.4s ease" : "none",
      }}>
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }`}</style>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            background: i < digits.length ? "linear-gradient(135deg,#2563eb,#7c3aed)" : "transparent",
            border: `2px solid ${i < digits.length ? "#2563eb" : "#1e3a5f"}`,
            transition: "all 0.15s ease",
          }}/>
        ))}
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>{error}</div>}

      {/* Klawiatura */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, width: "100%", maxWidth: 280 }}>
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} onClick={() => addDigit(d)}
            style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 14,
              height: 64, fontSize: 22, fontWeight: 700, color: "#e2e8f0",
              cursor: "pointer", fontFamily: "'DM Mono', monospace",
              transition: "all 0.1s", WebkitTapHighlightColor: "transparent" }}>
            {d}
          </button>
        ))}
        {/* Biometria lub cancel */}
        <button onClick={biometricAvail ? tryBiometric : (onCancel || (() => {}))}
          style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 14,
            height: 64, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#475569" }}>
          {biometricAvail ? <Fingerprint size={24} color="#7c3aed"/> : (onCancel ? <X size={20} color="#475569"/> : <span/>)}
        </button>
        <button onClick={() => addDigit(0)}
          style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 14,
            height: 64, fontSize: 22, fontWeight: 700, color: "#e2e8f0",
            cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
          0
        </button>
        <button onClick={removeDigit}
          style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 14,
            height: 64, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#94a3b8" }}>
          ⌫
        </button>
      </div>
    </div>
  );
}

export { PinScreen, PIN_KEY, PIN_ENABLED_KEY, checkBiometricSupport, hashPin };
