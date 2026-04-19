import { useState } from "react";
import { MessageCircle, X, Send, Check } from "lucide-react";
import { exportErrorsForSupport, clearLocalErrors } from "../lib/errorTracking.js";

const SUPPORT_EMAIL = "matiseekk@gmail.com";

function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includeErrors, setIncludeErrors] = useState(true);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    const errorsInfo = includeErrors ? exportErrorsForSupport() : null;
    
    const body = [
      "Wiadomość:",
      message || "(brak)",
      "",
      "---",
      `Wersja: ${import.meta.env.MODE || "production"}`,
      `URL: ${window.location.href}`,
      `Data: ${new Date().toISOString()}`,
      `Przeglądarka: ${navigator.userAgent.substring(0, 100)}`,
    ];
    
    if (errorsInfo && errorsInfo.count > 0) {
      body.push("");
      body.push(`Ostatnie błędy (${errorsInfo.count}):`);
      errorsInfo.errors.slice(0, 5).forEach((err, i) => {
        body.push(`${i+1}. ${err.message} (${err.timestamp})`);
      });
    }
    
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("FinTrack PRO - zgłoszenie")}&body=${encodeURIComponent(body.join("\n"))}`;
    window.location.href = mailto;
    
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMessage("");
      if (includeErrors) clearLocalErrors();
    }, 2000);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: "fixed",
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        right: 16,
        width: 44, height: 44,
        borderRadius: 22,
        background: "#0d1628",
        border: "1px solid #1e3a5f",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", zIndex: 50,
        boxShadow: "0 4px 12px #0008",
      }} title="Zgłoś problem">
        <MessageCircle size={18} color="#94a3b8"/>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000c", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      backdropFilter: "blur(8px)",
    }} onClick={() => setOpen(false)}>
      <div style={{
        background: "#0d1628", borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 480,
        padding: 20,
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        fontFamily: "'Space Grotesk', sans-serif",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>Zgłoś problem</h3>
          <button onClick={() => setOpen(false)} style={{
            background: "#1a2744", border: "none", borderRadius: 8,
            padding: 6, cursor: "pointer", color: "#94a3b8",
          }}>
            <X size={16}/>
          </button>
        </div>

        {sent ? (
          <div style={{ padding: "30px 0", textAlign: "center" }}>
            <div style={{
              width: 56, height: 56, margin: "0 auto 12px",
              borderRadius: "50%", background: "#10b98122",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Check size={28} color="#10b981"/>
            </div>
            <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600 }}>
              Otwarto aplikację pocztową
            </div>
          </div>
        ) : (
          <>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Co się dzieje? Na co chcesz zwrócić uwagę?"
              rows={4}
              style={{
                width: "100%", padding: 12,
                background: "#060b14", border: "1px solid #1e3a5f",
                borderRadius: 10, color: "#e2e8f0",
                fontSize: 14, resize: "vertical",
                fontFamily: "'Space Grotesk', sans-serif",
                boxSizing: "border-box", marginBottom: 10,
              }}
            />

            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, color: "#94a3b8", marginBottom: 14,
              cursor: "pointer", userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={includeErrors}
                onChange={e => setIncludeErrors(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Załącz ostatnie błędy (pomaga mi naprawić bug)
            </label>

            <button onClick={handleSend} disabled={!message.trim()} style={{
              width: "100%", padding: 14,
              background: message.trim() ? "linear-gradient(135deg,#1e40af,#7c3aed)" : "#1e3a5f",
              border: "none", borderRadius: 12, color: "white",
              fontWeight: 700, fontSize: 14,
              cursor: message.trim() ? "pointer" : "not-allowed",
              fontFamily: "'Space Grotesk', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Send size={16}/> Wyślij
            </button>

            <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 10 }}>
              Wiadomość pójdzie na {SUPPORT_EMAIL}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { FeedbackButton };
