import { useState, useEffect } from "react";

const PIN_KEY = "ft_pin_hash";       // legacy: String.hashCode result (pre-v1.4)
const PIN_KEY_V2 = "ft_pin_hash_v2"; // PBKDF2: { salt, hash, iter }
const PIN_ENABLED_KEY = "ft_pin_enabled";
const PIN_LOCKOUT_KEY = "ft_pin_lockout"; // { attempts, lockedUntil }

const PBKDF2_ITERATIONS = 250_000; // ~150ms na nowoczesnym CPU, OK dla mobile
const SALT_BYTES = 16;
const HASH_BITS = 256;

// Lockout: progresywny — 5 fails = 30s, 10 fails = 5min, 15+ = 30min
const LOCKOUT_TIERS = [
  { fails: 15, ms: 30 * 60 * 1000 },  // 30 min
  { fails: 10, ms: 5 * 60 * 1000 },   // 5 min
  { fails: 5,  ms: 30 * 1000 },       // 30 s
];

// === HASHING ===
// Web Crypto PBKDF2-SHA256. Salt random per setup, iteracje 250k (OWASP min 600k
// dla SHA-256 ale dla mobile webview kompromis — i tak >>> oryginalnego
// String.hashCode które było natychmiastowe).
async function pbkdf2Hash(pin, saltBase64) {
  const enc = new TextEncoder();
  const salt = saltBase64
    ? Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltStr = saltBase64 || btoa(String.fromCharCode(...salt));
  return { salt: saltStr, hash, iter: PBKDF2_ITERATIONS };
}

// Constant-time string compare — zapobiega timing attackom.
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// LEGACY hashing — dla migracji starych userów (v1.3.x).
// Po pierwszym poprawnym wpisaniu PIN-u re-hashuje przez PBKDF2 i kasuje legacy.
function legacyHashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = Math.imul(31, h) + pin.charCodeAt(i) | 0;
  }
  return String(h);
}

// === LOCKOUT ===
function getLockoutState() {
  try {
    const raw = localStorage.getItem(PIN_LOCKOUT_KEY);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function setLockoutState(s) {
  try { localStorage.setItem(PIN_LOCKOUT_KEY, JSON.stringify(s)); } catch {}
}

function clearLockout() {
  try { localStorage.removeItem(PIN_LOCKOUT_KEY); } catch {}
}

function recordFail() {
  const s = getLockoutState();
  s.attempts += 1;
  // Find applicable tier (highest match)
  for (const tier of LOCKOUT_TIERS) {
    if (s.attempts >= tier.fails) {
      s.lockedUntil = Date.now() + tier.ms;
      break;
    }
  }
  setLockoutState(s);
  return s;
}

function isLocked() {
  const s = getLockoutState();
  if (s.lockedUntil > Date.now()) {
    return { locked: true, until: s.lockedUntil, remainingMs: s.lockedUntil - Date.now() };
  }
  return { locked: false, attempts: s.attempts };
}

// === VERIFY ===
async function verifyPin(pin) {
  // 1. Sprawdź lockout
  const lock = isLocked();
  if (lock.locked) return { ok: false, locked: true, remainingMs: lock.remainingMs };

  // 2. v2 PBKDF2
  try {
    const rawV2 = localStorage.getItem(PIN_KEY_V2);
    if (rawV2) {
      const stored = JSON.parse(rawV2);
      if (stored && stored.salt && stored.hash) {
        const { hash } = await pbkdf2Hash(pin, stored.salt);
        if (constantTimeEqual(hash, stored.hash)) {
          clearLockout();
          return { ok: true };
        }
        recordFail();
        return { ok: false };
      }
    }
  } catch (e) {
    console.error("[PIN] v2 verify error", e);
  }

  // 3. Legacy v1 — zaakceptuj jeśli match, potem migruj na v2
  const legacy = localStorage.getItem(PIN_KEY);
  if (legacy && legacyHashPin(pin) === legacy) {
    // Migruj na v2
    try {
      const v2 = await pbkdf2Hash(pin);
      localStorage.setItem(PIN_KEY_V2, JSON.stringify(v2));
      localStorage.removeItem(PIN_KEY);
    } catch (e) {
      console.warn("[PIN] migration to v2 failed, keeping legacy", e);
    }
    clearLockout();
    return { ok: true, migrated: true };
  }

  // 4. Brak match
  recordFail();
  return { ok: false };
}

async function setupPin(pin) {
  const v2 = await pbkdf2Hash(pin);
  localStorage.setItem(PIN_KEY_V2, JSON.stringify(v2));
  localStorage.removeItem(PIN_KEY); // wyczyść legacy
  localStorage.setItem(PIN_ENABLED_KEY, "1");
  clearLockout();
}

async function disablePinWith(pin) {
  const result = await verifyPin(pin);
  if (!result.ok) return result;
  localStorage.removeItem(PIN_KEY_V2);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(PIN_ENABLED_KEY);
  clearLockout();
  return { ok: true };
}

// === UI ===
function PinPad({ title, subtitle, onSubmit, onCancel, showCancel = false }) {
  const [digits, setDigits] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const press = async (d) => {
    if (busy || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setBusy(true);
      // Małe opóźnienie żeby user zobaczył 4 kropki przed reakcją
      await new Promise(r => setTimeout(r, 80));
      const ok = await onSubmit(next);
      if (ok === false) {
        setShake(true);
        setTimeout(() => { setShake(false); setDigits(""); setBusy(false); }, 600);
      } else {
        setDigits("");
        setBusy(false);
      }
    }
  };

  const del = () => { if (!busy) setDigits(d => d.slice(0, -1)); };

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", maxWidth: 264, opacity: busy ? 0.5 : 1 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => press(String(n))} disabled={busy} style={{
            background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
            height: 68, fontSize: 24, fontWeight: 600, color: "#e2e8f0",
            cursor: busy ? "wait" : "pointer", fontFamily: "'Space Grotesk', sans-serif",
          }}>{n}</button>
        ))}
        <button onClick={showCancel && onCancel ? onCancel : undefined} disabled={busy} style={{
          background: "none", border: "none", height: 68,
          fontSize: 12, color: showCancel ? "#475569" : "transparent",
          cursor: showCancel ? (busy ? "wait" : "pointer") : "default",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{showCancel ? "Anuluj" : ""}</button>
        <button onClick={() => press("0")} disabled={busy} style={{
          background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
          height: 68, fontSize: 24, fontWeight: 600, color: "#e2e8f0",
          cursor: busy ? "wait" : "pointer",
        }}>0</button>
        <button onClick={del} disabled={busy} style={{
          background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: 14,
          height: 68, fontSize: 20, color: "#64748b", cursor: busy ? "wait" : "pointer",
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

// === Lockout screen ===
function LockoutScreen({ remainingMs }) {
  const [left, setLeft] = useState(remainingMs);
  useEffect(() => {
    const id = setInterval(() => {
      const s = isLocked();
      if (!s.locked) {
        setLeft(0);
        // Sam się odświeży gdy parent zauważy że isLocked() == false
        window.location.reload();
      } else {
        setLeft(s.remainingMs);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const fmt = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999, background: "#060b14",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px", fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "#7f1d1d22",
        border: "1px solid #7f1d1d", display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 20 }}>
        <span style={{ fontSize: 36 }}>🛑</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 22, color: "#fca5a5", textAlign: "center" }}>
        Zbyt wiele nieudanych prób
      </div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 8, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
        Zaczekaj zanim spróbujesz ponownie. Lockout chroni przed bruteforce'em.
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 32, fontWeight: 700,
        color: "#ef4444", marginTop: 20, letterSpacing: "0.05em" }}>
        {fmt}
      </div>
    </div>
  );
}

// === Public components ===
function PinScreen({ onSuccess, title = "FinTrack PRO" }) {
  const [attempts, setAttempts] = useState(() => getLockoutState().attempts);
  const [lockState, setLockState] = useState(() => isLocked());

  // Re-check lockout co render — gdy user wraca po wygaśnięciu blokady
  useEffect(() => {
    if (lockState.locked) {
      const id = setInterval(() => {
        const s = isLocked();
        if (!s.locked) {
          setLockState({ locked: false, attempts: s.attempts });
          clearInterval(id);
        }
      }, 1000);
      return () => clearInterval(id);
    }
  }, [lockState.locked]);

  if (lockState.locked) return <LockoutScreen remainingMs={lockState.remainingMs}/>;

  const handleSubmit = async (pin) => {
    const result = await verifyPin(pin);
    if (result.ok) {
      onSuccess();
      return true;
    }
    if (result.locked) {
      setLockState({ locked: true, remainingMs: result.remainingMs });
      return false;
    }
    setAttempts(a => a + 1);
    return false;
  };

  // Subtitle pokazuje liczbę prób + ostrzeżenie gdy blisko lockoutu
  const nextLockoutFails = LOCKOUT_TIERS.slice().reverse().find(t => attempts < t.fails);
  const subtitle = attempts === 0
    ? "Podaj PIN aby odblokować"
    : nextLockoutFails && (nextLockoutFails.fails - attempts) <= 2
      ? `Nieprawidłowy PIN · za ${nextLockoutFails.fails - attempts} prób blokada`
      : `Nieprawidłowy PIN · próba ${attempts}`;

  return <PinPad title={title} subtitle={subtitle} onSubmit={handleSubmit}/>;
}

function PinSettings() {
  const [enabled, setEnabled] = useState(localStorage.getItem(PIN_ENABLED_KEY) === "1");
  const [mode, setMode] = useState(null); // null | setup | confirm | disable

  const handleSetup = (pin) => {
    sessionStorage.setItem("_pin_tmp", pin);
    setMode("confirm");
    return true;
  };

  const handleConfirm = async (pin) => {
    const first = sessionStorage.getItem("_pin_tmp");
    sessionStorage.removeItem("_pin_tmp");
    if (pin === first) {
      await setupPin(pin);
      setEnabled(true);
      setMode(null);
      return true;
    }
    setMode(null);
    return false;
  };

  const handleDisable = async (pin) => {
    const result = await disablePinWith(pin);
    if (result.ok) {
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
          {enabled ? "Apka jest zabezpieczona kodem PIN (PBKDF2 + lockout)" : "Zabezpiecz apkę 4-cyfrowym kodem"}
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

// hashPin export zachowany jako legacy noop dla backward compat
// (jeśli ktoś importuje z starego API w innym pliku — nie chcemy crashować)
const hashPin = legacyHashPin;

export { PinScreen, PinSettings, PIN_KEY, PIN_KEY_V2, PIN_ENABLED_KEY, hashPin };
