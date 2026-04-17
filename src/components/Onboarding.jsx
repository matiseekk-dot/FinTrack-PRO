import { useState } from "react";
import { FontLoader } from "./FontLoader.jsx";

const SLIDES = [
  {
    emoji: "👋",
    title: "Witaj w FinTrack PRO!",
    desc: "Osobisty tracker finansów. Zero subskrypcji, synchronizacja w chmurze, Twoje dane bezpieczne.",
    color: "#3b82f6",
  },
  {
    emoji: "💸",
    title: "Dodawaj transakcje",
    desc: "Wpisz kwotę, opis i kategorię. Możesz używać szablonów dla powtarzalnych wydatków (np. Paliwo 200 zł, Żabka 30 zł) — jedno kliknięcie i gotowe.",
    color: "#8b5cf6",
  },
  {
    emoji: "📅",
    title: "Czym jest cykl rozliczeniowy?",
    desc: "Standardowo cykl = miesiąc kalendarzowy (1-31). Ale możesz ustawić go pod dzień wypłaty — np. 27 każdego miesiąca do 26 następnego. Ustawisz to w Ustawieniach.",
    color: "#06b6d4",
  },
  {
    emoji: "🏷️",
    title: "Kategorie i custom kategorie",
    desc: "Masz gotowe 15 kategorii (jedzenie, transport, rachunki…) ale możesz dodać własne (np. Wakacje, Dziecko, Kurs online). Każda kategoria = inny kolor na wykresach.",
    color: "#ec4899",
  },
  {
    emoji: "🎯",
    title: "Budżety i alerty",
    desc: "Ustaw miesięczny limit dla wybranej kategorii (np. Rozrywka = 500 zł). Apka pokaże ostrzeżenie gdy zbliżasz się do 85% i alert gdy przekroczysz. Zakładki → Cele.",
    color: "#10b981",
  },
  {
    emoji: "💰",
    title: "Cele oszczędnościowe",
    desc: "Ustal cel (np. Wakacje 5000 zł do wakacji 2026) i powiąż z kontem oszczędnościowym. Apka policzy ile jeszcze brakuje i ile musisz odłożyć miesięcznie.",
    color: "#f59e0b",
  },
  {
    emoji: "🔒",
    title: "Bezpieczeństwo",
    desc: "Włącz blokadę PIN w Ustawieniach — apka zablokuje się automatycznie gdy wyjdziesz. Tylko Ty masz dostęp.",
    color: "#7c3aed",
  },
  {
    emoji: "🚀",
    title: "Gotowy do startu!",
    desc: "Zacznij od dodania pierwszej transakcji albo załaduj dane demo żeby zobaczyć jak apka wygląda w akcji.",
    color: "#ef4444",
  },
];

function Onboarding({ onFinish, onLoadDemo }) {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      background: "#060b14", color: "#e2e8f0",
      minHeight: "100dvh", maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "32px 24px",
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 32px)",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
    }}>
      <FontLoader/>

      {/* Skip button */}
      <button onClick={onFinish} style={{
        position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 20,
        background: "none", border: "none", cursor: "pointer",
        color: "#475569", fontSize: 13, fontWeight: 600,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        Pomiń
      </button>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 6, marginBottom: 40 }}>
        {SLIDES.map((_, i) => (
          <div key={i} style={{
            width: i === slide ? 24 : 8, height: 8, borderRadius: 4,
            background: i === slide ? current.color : i < slide ? "#475569" : "#1e3a5f",
            transition: "all 0.3s",
          }}/>
        ))}
      </div>

      {/* Content */}
      <div style={{ textAlign: "center", maxWidth: 360, flex: 1, display: "flex",
        flexDirection: "column", justifyContent: "center" }}>
        <div style={{
          fontSize: 72, marginBottom: 20,
          filter: `drop-shadow(0 8px 20px ${current.color}66)`,
        }}>
          {current.emoji}
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, marginBottom: 14, color: "#e2e8f0",
          letterSpacing: "-0.02em",
        }}>
          {current.title}
        </h1>
        <p style={{
          fontSize: 15, color: "#94a3b8", lineHeight: 1.6, margin: 0,
        }}>
          {current.desc}
        </p>
      </div>

      {/* Nav buttons */}
      <div style={{ width: "100%", maxWidth: 360, display: "flex", gap: 10, marginTop: 32 }}>
        {slide > 0 && (
          <button onClick={() => setSlide(s => s - 1)} style={{
            flex: 1, background: "#0d1628", border: "1px solid #1e3a5f66",
            borderRadius: 14, padding: "14px 0",
            color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            ← Wstecz
          </button>
        )}
        <button onClick={() => isLast ? onFinish() : setSlide(s => s + 1)} style={{
          flex: 2, background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
          border: "none", borderRadius: 14, padding: "14px 0",
          color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          boxShadow: `0 4px 16px ${current.color}44`,
        }}>
          {isLast ? "Zaczynam!" : "Dalej →"}
        </button>
      </div>

      {isLast && onLoadDemo && (
        <button onClick={onLoadDemo} style={{
          marginTop: 14, background: "none", border: "none", cursor: "pointer",
          color: "#64748b", fontSize: 13, textDecoration: "underline",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          🎬 Załaduj dane demo
        </button>
      )}
    </div>
  );
}

export { Onboarding };
