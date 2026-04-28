import { useState } from "react";
import { FontLoader } from "./FontLoader.jsx";
import { t } from "../i18n.js";

function LoginScreen({ onSignIn, loading, syncError }) {
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      background: "#060b14", color: "#e2e8f0",
      minHeight: "100dvh", maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
      paddingBottom: "env(safe-area-inset-bottom, 32px)",
    }}>
      <FontLoader/>

      {/* Logo */}
      <div style={{
        width: 80, height: 80, borderRadius: 22,
        background: "linear-gradient(135deg,#1e40af,#7c3aed)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, marginBottom: 28,
        boxShadow: "0 0 40px #7c3aed44",
      }}>
        💰
      </div>

      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>
        FinTrack PRO
      </div>
      <div style={{ fontSize: 15, color: "#475569", marginBottom: 48, textAlign: "center", lineHeight: 1.6 }}>
        {t("login.tagline", "Twoje finanse pod kontrolą.")}<br/>{t("login.subtitle", "Zaloguj się żeby synchronizować dane między urządzeniami.")}
      </div>

      {/* Features */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, marginBottom: 48 }}>
        {[
          { icon: "☁️", title: t("login.feat.sync.title", "Sync w chmurze"),    desc: t("login.feat.sync.desc",    "Dane dostępne na każdym urządzeniu") },
          { icon: "🔒", title: t("login.feat.secure.title", "Bezpieczne"),       desc: t("login.feat.secure.desc",  "Dane szyfrowane, tylko Ty masz dostęp") },
          { icon: "📊", title: t("login.feat.analytics.title", "Pełna analityka"), desc: t("login.feat.analytics.desc", "Wykresy, cele, raporty miesięczne") },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            display: "flex", alignItems: "center", gap: 14,
            background: "#0a1120", borderRadius: 14,
            padding: "14px 16px", border: "1px solid #1a2744",
          }}>
            <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{title}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Google Sign In button */}
      <button
        onClick={() => { setPressed(true); onSignIn().finally(() => setPressed(false)); }}
        disabled={loading || pressed}
        style={{
          width: "100%",
          background: loading || pressed ? "#1a2744" : "white",
          border: "none", borderRadius: 14,
          padding: "15px 0",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          cursor: loading || pressed ? "not-allowed" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {loading || pressed ? (
          <span style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>
            {t("login.connecting", "Łączenie…")}
          </span>
        ) : (
          <>
            {/* Google logo SVG */}
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.32-8.16 2.32-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
              {t("login.signInGoogle", "Zaloguj się przez Google")}
            </span>
          </>
        )}
      </button>

      {syncError && (
        <div style={{ fontSize: 13, color: "#ef4444", marginTop: 12, textAlign: "center",
          background: "#1a0808", border: "1px solid #7f1d1d44", borderRadius: 10, padding: "10px 16px" }}>
          {syncError}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#334155", marginTop: 16, textAlign: "center", lineHeight: 1.8 }}>
        {t("login.terms.prefix", "Logując się akceptujesz")}{" "}
        <a href="/FinTrack-PRO/terms.html" target="_blank" rel="noopener"
          style={{ color: "#475569", textDecoration: "underline" }}>
          {t("login.terms.tos", "Regulamin")}
        </a>{" "}{t("login.terms.and", "i")}{" "}
        <a href="/FinTrack-PRO/privacy.html" target="_blank" rel="noopener"
          style={{ color: "#475569", textDecoration: "underline" }}>
          {t("login.terms.privacy", "Politykę prywatności")}
        </a>.<br/>
        {t("login.terms.disclaimer", "Nie wysyłamy spamu ani nie sprzedajemy danych.")}
      </div>
    </div>
  );
};

export { LoginScreen };
