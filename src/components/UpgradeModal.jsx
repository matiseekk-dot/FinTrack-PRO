import { useState, useEffect } from "react";
import { X, Check, Sparkles, Zap, Crown } from "lucide-react";
import { activatePro } from "../lib/tier.js";

const TIER_FEATURES = [
  { label: "Bez limitu transakcji", free: "50/mies", pro: "∞" },
  { label: "Bez limitu kont", free: "2", pro: "∞" },
  { label: "Bez limitu budżetów", free: "1", pro: "∞" },
  { label: "Bez limitu celów", free: "1", pro: "∞" },
  { label: "Własne kategorie", free: "❌", pro: "✅" },
  { label: "Import z banków (CSV)", free: "❌", pro: "✅" },
  { label: "Synchronizacja chmurowa", free: "❌", pro: "✅" },
  { label: "Eksport PDF", free: "❌", pro: "✅" },
  { label: "Wszystkie analizy", free: "❌", pro: "✅" },
];

function UpgradeModal({ open, onClose, trigger, onActivated }) {
  const [plan, setPlan] = useState("yearly");
  const [showLicenseInput, setShowLicenseInput] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setShowLicenseInput(false);
      setLicenseKey("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handlePurchase = () => {
    const urls = {
      yearly:   "https://skudev.gumroad.com/l/fintrack-pro-yearly",
      lifetime: "https://skudev.gumroad.com/l/fintrack-pro-lifetime",
    };
    window.open(urls[plan], "_blank");
  };

  const handleActivate = () => {
    const key = licenseKey.trim();
    if (!key || key.length < 8) {
      setError("Nieprawidłowy klucz licencji");
      return;
    }
    // Tu normalnie byłaby weryfikacja przez webhook Gumroad.
    // Na teraz: prefix "FT-Y-" = yearly, "FT-L-" = lifetime, "FT-T-" = trial
    let type = "yearly";
    if (key.startsWith("FT-L-")) type = "lifetime";
    else if (key.startsWith("FT-T-")) type = "trial";
    else if (key.startsWith("FT-Y-")) type = "yearly";
    else {
      setError("Nieznany format klucza. Format: FT-Y-xxxxx lub FT-L-xxxxx");
      return;
    }
    activatePro(type, key);
    if (onActivated) onActivated(type);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000c", zIndex: 10000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div style={{
        background: "linear-gradient(180deg,#0d1628 0%,#060b14 100%)",
        border: "1px solid #1e3a5f",
        borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: 480,
        paddingTop: 24, paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: 20, paddingRight: 20,
        maxHeight: "92dvh", overflowY: "auto",
        fontFamily: "'Space Grotesk', sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Crown size={20} color="#fbbf24"/>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>FinTrack PRO</span>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              {trigger === "limit" && "Osiągnięto limit 50 transakcji miesięcznie"}
              {trigger === "import" && "Import z banków to funkcja PRO"}
              {trigger === "sync" && "Synchronizacja między urządzeniami to funkcja PRO"}
              {trigger === "account" && "Bez limitu kont bankowych"}
              {trigger === "budget" && "Bez limitu budżetów"}
              {trigger === "goal" && "Bez limitu celów oszczędnościowych"}
              {trigger === "customCat" && "Własne kategorie to funkcja PRO"}
              {!trigger && "Odblokuj pełną wersję aplikacji"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "#1a2744", border: "none", borderRadius: 10,
            padding: 10, cursor: "pointer", color: "#94a3b8",
            minWidth: 40, minHeight: 40, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <X size={18}/>
          </button>
        </div>

        {!showLicenseInput ? (
          <>
            {/* Plan toggle */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {[
                { id: "yearly",   label: "Rocznie",  price: "99 zł", sub: "tylko 8 zł/msc", badge: null },
                { id: "lifetime", label: "Dożywotnio", price: "199 zł", sub: "raz i na zawsze", badge: "Early bird" },
              ].map(p => (
                <button key={p.id} onClick={() => setPlan(p.id)} style={{
                  flex: 1,
                  background: plan === p.id ? "linear-gradient(135deg,#1e40af,#7c3aed)" : "#0d1628",
                  border: plan === p.id ? "2px solid #60a5fa" : "1px solid #1e3a5f",
                  borderRadius: 16, padding: "14px 10px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  position: "relative",
                }}>
                  {p.badge && (
                    <div style={{
                      position: "absolute", top: -8, right: 8,
                      background: "#fbbf24", color: "#000",
                      fontSize: 9, fontWeight: 800, padding: "2px 8px",
                      borderRadius: 6, letterSpacing: "0.03em",
                    }}>{p.badge}</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: plan === p.id ? "white" : "#94a3b8" }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: plan === p.id ? "white" : "#e2e8f0", lineHeight: 1 }}>
                    {p.price}
                  </div>
                  <div style={{ fontSize: 10, color: plan === p.id ? "#cbd5e1" : "#64748b" }}>
                    {p.sub}
                  </div>
                </button>
              ))}
            </div>

            {/* Features table */}
            <div style={{
              background: "#0a1120", border: "1px solid #1a2744",
              borderRadius: 14, padding: "4px 0", marginBottom: 20,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 64px 64px",
                padding: "10px 14px", borderBottom: "1px solid #1a2744",
                fontSize: 10, fontWeight: 700, color: "#475569",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                <div>Funkcja</div>
                <div style={{ textAlign: "center" }}>Free</div>
                <div style={{ textAlign: "center", color: "#60a5fa" }}>PRO</div>
              </div>
              {TIER_FEATURES.map((f, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 64px 64px",
                  padding: "10px 14px",
                  borderBottom: i < TIER_FEATURES.length - 1 ? "1px solid #0f1a2e" : "none",
                  fontSize: 12, alignItems: "center",
                }}>
                  <div style={{ color: "#cbd5e1" }}>{f.label}</div>
                  <div style={{ textAlign: "center", color: "#64748b", fontSize: 11 }}>{f.free}</div>
                  <div style={{ textAlign: "center", color: "#60a5fa", fontWeight: 700 }}>{f.pro}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button onClick={handlePurchase} style={{
              width: "100%", padding: 16, marginBottom: 10,
              background: "linear-gradient(135deg,#1e40af,#7c3aed)",
              border: "none", borderRadius: 14, color: "white",
              fontWeight: 800, fontSize: 15, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 20px #7c3aed55",
            }}>
              <Sparkles size={18}/>
              Kup {plan === "yearly" ? "roczną" : "dożywotnią"} — {plan === "yearly" ? "99 zł" : "199 zł"}
            </button>

            <button onClick={() => setShowLicenseInput(true)} style={{
              width: "100%", padding: 12, background: "none",
              border: "1px solid #1e3a5f", borderRadius: 12,
              color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Mam już klucz licencji
            </button>

            <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
              14 dni gwarancji zwrotu · Brak subskrypcji · Płatność przez Gumroad<br/>
              Po zakupie otrzymasz klucz licencji mailem
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Klucz licencji
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={e => { setLicenseKey(e.target.value); setError(""); }}
                placeholder="FT-Y-XXXXX-XXXXX lub FT-L-XXXXX-XXXXX"
                autoFocus
                style={{
                  width: "100%", marginTop: 8, padding: "14px 16px",
                  background: "#0a1120", border: "1px solid #1e3a5f",
                  borderRadius: 12, color: "#e2e8f0", fontSize: 14,
                  fontFamily: "'DM Mono', monospace",
                  boxSizing: "border-box",
                }}
              />
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{error}</div>
              )}
            </div>

            <button onClick={handleActivate} style={{
              width: "100%", padding: 14, marginBottom: 10,
              background: "linear-gradient(135deg,#10b981,#059669)",
              border: "none", borderRadius: 14, color: "white",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Check size={16}/> Aktywuj PRO
            </button>

            <button onClick={() => setShowLicenseInput(false)} style={{
              width: "100%", padding: 10, background: "none",
              border: "none", color: "#64748b", fontSize: 13, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              ← Powrót do planów
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export { UpgradeModal };
