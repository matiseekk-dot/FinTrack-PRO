import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { FontLoader } from "./FontLoader.jsx";

const ONBOARDING_SLIDES = [
  {
    emoji: "👋",
    title: "Witaj w FinTrack PRO!",
    desc: "Twój osobisty tracker finansów. Zero subskrypcji, synchronizacja w chmurze — Twoje dane bezpieczne między urządzeniami.",
    color: "#3b82f6",
  },
  {
    emoji: "💸",
    title: "Śledź każdą złotówkę",
    desc: "Dodawaj transakcje w kilka sekund. Kategorie, szablony szybkiego dodawania i wykresy analityczne — wszystko gotowe od razu.",
    color: "#8b5cf6",
  },
  {
    emoji: "🎯",
    title: "Planuj i oszczędzaj",
    desc: "Ustaw cele oszczędnościowe, śledź rachunki i płatności cykliczne, rozliczaj wspólne wydatki z partnerem.",
    color: "#10b981",
  },
  {
    emoji: "🔒",
    title: "Bezpieczeństwo",
    desc: "Włącz blokadę PIN w Ustawieniach — apka zablokuje się automatycznie gdy wyjdziesz z niej. Tylko Ty masz dostęp do swoich finansów.",
    color: "#7c3aed",
  },
  {
    emoji: "🚀",
    title: "Gotowy do startu!",
    desc: "Zacznij od dodania pierwszej transakcji. Możesz też załadować dane demo, żeby zobaczyć jak apka wygląda w akcji.",
    color: "#f59e0b",
  },
];

function Onboarding({ onFinish, onLoadDemo }) {
  const [slide, setSlide] = useState(0);
  const current = ONBOARDING_SLIDES[slide];
  const isLast  = slide === ONBOARDING_SLIDES.length - 1;

  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      background: "#060b14", color: "#e2e8f0",
      minHeight: "100dvh", maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "32px 24px",
      paddingBottom: "env(safe-area-inset-bottom, 32px)",
    }}>
      <FontLoader/>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 8, marginBottom: 48 }}>
        {ONBOARDING_SLIDES.map((_, i) => (
          <div key={i} style={{
            width: i === slide ? 24 : 8, height: 8, borderRadius: 4,
            background: i === slide ? current.color : "#1a2744",
            transition: "all 0.3s ease",
          }}/>
        ))}
      </div>

      {/* Icon */}
      <div style={{
        width: 100, height: 100, borderRadius: 28,
        background: current.color + "22",
        border: `2px solid ${current.color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 48, marginBottom: 32,
        transition: "all 0.3s ease",
      }}>
        {current.emoji}
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 14, lineHeight: 1.2 }}>
          {current.title}
        </div>
        <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.7, maxWidth: 320 }}>
          {current.desc}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        {isLast ? (
          <>
            <button onClick={onFinish} style={{
              width: "100%", background: `linear-gradient(135deg, ${current.color}, #7c3aed)`,
              border: "none", borderRadius: 14, padding: "15px 0",
              color: "white", fontWeight: 800, fontSize: 16,
              cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Zacznij od zera
            </button>
            <button onClick={() => onLoadDemo && onLoadDemo()} style={{
              width: "100%", background: "#0a1120",
              border: "1px solid #1a2744", borderRadius: 14, padding: "15px 0",
              color: "#94a3b8", fontWeight: 700, fontSize: 15,
              cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
            }}>
              🎬 Załaduj dane demo
            </button>
          </>
        ) : (
          <button onClick={() => setSlide(s => s + 1)} style={{
            width: "100%", background: `linear-gradient(135deg, ${current.color}, #7c3aed)`,
            border: "none", borderRadius: 14, padding: "15px 0",
            color: "white", fontWeight: 800, fontSize: 16,
            cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Dalej →
          </button>
        )}
        {!isLast && (
          <button onClick={onFinish} style={{
            background: "none", border: "none",
            color: "#334155", fontSize: 14, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif", padding: "8px 0",
          }}>
            Pomiń
          </button>
        )}
      </div>
    </div>
  );
};

//    NOTIFICATIONS                                                             

export { Onboarding };
