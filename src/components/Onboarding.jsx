import { useState } from "react";
import { FontLoader } from "./FontLoader.jsx";
import { t } from "../i18n.js";

// v1.3.1: SLIDES jako funkcja (nie const), żeby t() ewaluowało się przy każdym
// renderze - inaczej tłumaczenia złapane raz przy module load nie zmienią się
// gdyby user zmienił język w trakcie (chociaż setLang() i tak robi reload).
function getSlides() {
  return [
    {
      emoji: "👋",
      title: t("onb.s1.title", "Witaj w FinTrack PRO!"),
      desc:  t("onb.s1.desc",  "Osobisty tracker finansów. Synchronizacja w chmurze, Twoje dane bezpieczne. 50 transakcji miesięcznie za darmo, więcej w wersji PRO."),
      color: "#3b82f6",
    },
    {
      emoji: "💸",
      title: t("onb.s2.title", "Dodawaj transakcje"),
      desc:  t("onb.s2.desc",  "Wpisz kwotę, opis i kategorię. Możesz używać szablonów dla powtarzalnych wydatków (np. Paliwo 200 zł, Żabka 30 zł) — jedno kliknięcie i gotowe."),
      color: "#8b5cf6",
    },
    {
      emoji: "📅",
      title: t("onb.s3.title", "Czym jest cykl rozliczeniowy?"),
      desc:  t("onb.s3.desc",  "Standardowo cykl = miesiąc kalendarzowy (1-31). Ale możesz ustawić go pod dzień wypłaty — np. 27 każdego miesiąca do 26 następnego. Ustawisz to w Ustawieniach."),
      color: "#06b6d4",
    },
    {
      emoji: "🏷️",
      title: t("onb.s4.title", "Kategorie i custom kategorie"),
      desc:  t("onb.s4.desc",  "Masz gotowe 20 kategorii (jedzenie, transport, rachunki, wynagrodzenie…) ale możesz dodać własne (np. Kredyt Dom, Żłobek, Vinted). Każda kategoria = inny kolor na wykresach."),
      color: "#ec4899",
    },
    {
      emoji: "🎯",
      title: t("onb.s5.title", "Budżety i alerty"),
      desc:  t("onb.s5.desc",  "Ustaw miesięczny limit dla wybranej kategorii (np. Rozrywka = 500 zł). Apka pokaże ostrzeżenie gdy zbliżasz się do 85% i alert gdy przekroczysz. Zakładki → Plany → Limity."),
      color: "#10b981",
    },
    {
      emoji: "💰",
      title: t("onb.s6.title", "Cele oszczędnościowe"),
      desc:  t("onb.s6.desc",  "Ustal cel (np. Wakacje 5000 zł do końca {YEAR} roku) i powiąż z kontem oszczędnościowym. Apka policzy ile jeszcze brakuje i ile musisz odłożyć miesięcznie.")
              .replace("{YEAR}", String(new Date().getFullYear() + 1)),
      color: "#f59e0b",
    },
    {
      emoji: "🔒",
      title: t("onb.s7.title", "Bezpieczeństwo"),
      desc:  t("onb.s7.desc",  "Włącz blokadę PIN w Ustawieniach — apka zablokuje się automatycznie gdy wyjdziesz. Tylko Ty masz dostęp."),
      color: "#7c3aed",
    },
    {
      emoji: "🚀",
      title: t("onb.s8.title", "Gotowy do startu!"),
      desc:  t("onb.s8.desc",  "Zacznij od dodania pierwszej transakcji albo załaduj dane demo żeby zobaczyć jak apka wygląda w akcji."),
      color: "#ef4444",
    },
  ];
}

function Onboarding({ onFinish, onLoadDemo }) {
  const [slide, setSlide] = useState(0);
  const SLIDES = getSlides();
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
        {t("onb.skip", "Pomiń")}
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
            ← {t("onb.back", "Wstecz")}
          </button>
        )}
        <button onClick={() => isLast ? onFinish() : setSlide(s => s + 1)} style={{
          flex: 2, background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
          border: "none", borderRadius: 14, padding: "14px 0",
          color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          boxShadow: `0 4px 16px ${current.color}44`,
        }}>
          {isLast ? t("onb.start", "Zaczynam!") : t("onb.next", "Dalej →")}
        </button>
      </div>

      {isLast && onLoadDemo && (
        <button onClick={onLoadDemo} style={{
          marginTop: 14, background: "none", border: "none", cursor: "pointer",
          color: "#64748b", fontSize: 13, textDecoration: "underline",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          🎬 {t("onb.loadDemo", "Załaduj dane demo")}
        </button>
      )}
    </div>
  );
}

export { Onboarding };
