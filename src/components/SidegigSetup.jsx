import { useState, useEffect } from "react";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { FontLoader } from "./FontLoader.jsx";
import { MODULES, MODULE_ORDER, moduleLabel, moduleDesc } from "../lib/modules.js";
import { SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { t, getLang, getLocale } from "../i18n.js";

const BRAND = "linear-gradient(135deg,#059669,#10b981)";

// Nazwa waluty w języku użytkownika (Intl), np. „euro”, „Euro”, „real brasileño”
function currencyName(code) {
  try {
    const n = new Intl.DisplayNames([getLocale()], { type: "currency" }).of(code);
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
  } catch (_) { return code; }
}
const ALL_CURRENCIES = ["PLN", ...SUPPORTED_CURRENCIES];

/**
 * Two-step Sidegig setup: home currency, then modules.
 * Shown once for every user (new users and FinTrack users upgrading), and again
 * from More → Modules. Returning users get modules pre-ticked from their data.
 */
function SidegigSetup({ initialCurrency = "EUR", initialModules = [], isReturningUser = false, canCancel = false, onCancel, onDone }) {
  const lang = getLang();
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState(initialCurrency);
  const [selected, setSelected] = useState(() => new Set(initialModules));
  // Edycja modułów (canCancel) z już włączonymi Zakładami = wiek potwierdzony wcześniej.
  // Pierwszy setup zawsze pyta, nawet gdy Zakłady zaznaczyliśmy na podstawie danych.
  const [adultConfirmed, setAdultConfirmed] = useState(() => canCancel && initialModules.includes("betting"));

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const bettingOn = selected.has("betting");
  const blockedByAge = bettingOn && !adultConfirmed;
  const canFinish = selected.size > 0 && !blockedByAge;

  const finish = () => {
    if (!canFinish) return;
    onDone({ currency, modules: MODULE_ORDER.filter(id => selected.has(id)) });
  };

  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      background: "#060b14", color: "#e2e8f0",
      minHeight: "100dvh", maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column",
      padding: "0 20px",
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
      boxSizing: "border-box",
    }}>
      <FontLoader/>

      {/* Header: brand + step indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: BRAND, display: "grid", placeItems: "center", color: "white", fontWeight: 900, fontSize: 15 }}>S</div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Sidegig</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{step}/2</span>
          {canCancel && (
            <button onClick={onCancel} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 6 }}>
              {t("common.cancel", "Anuluj")}
            </button>
          )}
        </div>
      </div>

      {step === 1 && (
        <>
          {isReturningUser && (
            <div style={{ background: "#10b98114", border: "1px solid #10b98144", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#a7f3d0", lineHeight: 1.5, marginBottom: 18 }}>
              {t("setup.upgradeNote", "FinTrack to teraz Sidegig. Wszystkie Twoje transakcje, hobby i wyjazdy są na miejscu.")}
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textWrap: "balance" }}>
            {t("setup.currencyTitle", "Twoja waluta główna")}
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 18px" }}>
            {t("setup.currencyDesc", "W niej pokażemy sumy i bilans. Każdy wpis zachowuje swoją walutę — przeliczamy po kursie z dnia transakcji.")}
          </p>

          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {[initialCurrency, ...ALL_CURRENCIES.filter(c => c !== initialCurrency)].map(code => {
              const on = currency === code;
              return (
                <button key={code} role="radio" aria-checked={on} onClick={() => setCurrency(code)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                  background: on ? "#10b98114" : "#0d1628",
                  border: `1px solid ${on ? "#10b981" : "#1a2744"}`,
                  color: "#e2e8f0", fontFamily: "inherit", textAlign: "left",
                }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14, width: 40, color: on ? "#34d399" : "#cbd5e1" }}>{code}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#94a3b8" }}>{currencyName(code)}</span>
                  {on && <Check size={16} color="#34d399"/>}
                </button>
              );
            })}
          </div>

          <button onClick={() => setStep(2)} style={primaryBtn(true)}>
            {t("onb.next", "Dalej →").replace(" →", "")} <ArrowRight size={16}/>
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textWrap: "balance" }}>
            {t("setup.modulesTitle", "Co śledzisz poza pensją?")}
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 18px" }}>
            {isReturningUser
              ? t("setup.modulesDescReturning", "Zaznaczyliśmy moduły na podstawie Twoich danych. Niezaznaczone znikną z menu — dane zostają.")
              : t("setup.modulesDesc", "Wybierz to, co Cię dotyczy. Zmienisz to w każdej chwili w Więcej → Moduły.")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            {MODULE_ORDER.map(id => {
              const m = MODULES[id];
              const Icon = m.icon;
              const on = selected.has(id);
              return (
                <div key={id}>
                  <button onClick={() => toggle(id)} aria-pressed={on} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                    background: on ? "#10b9810f" : "#0d1628",
                    border: `1px solid ${on ? "#10b98188" : "#1a2744"}`,
                    color: "#e2e8f0", fontFamily: "inherit", textAlign: "left",
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `1.5px solid ${on ? "#10b981" : "#475569"}`,
                      background: on ? "#10b981" : "transparent",
                      display: "grid", placeItems: "center",
                    }}>
                      {on && <Check size={14} color="white" strokeWidth={3}/>}
                    </span>
                    <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: m.color + "22", border: `1px solid ${m.color}55`, display: "grid", placeItems: "center" }}>
                      <Icon size={16} color={m.color}/>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
                        {moduleLabel(id, lang)}
                        {m.adult && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "#f59e0b22", color: "#fbbf24", letterSpacing: "0.04em" }}>18+</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>{moduleDesc(id, lang)}</span>
                    </span>
                  </button>

                  {id === "betting" && on && (
                    <button role="checkbox" aria-checked={adultConfirmed} onClick={() => setAdultConfirmed(v => !v)} style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
                      margin: "6px 0 0", padding: "10px 14px", borderRadius: 12, cursor: "pointer",
                      background: adultConfirmed ? "#10b9810a" : "#f59e0b0f",
                      border: `1px dashed ${adultConfirmed ? "#10b98155" : "#f59e0b66"}`,
                      fontSize: 12, color: "#cbd5e1", lineHeight: 1.45, fontFamily: "inherit", textAlign: "left",
                    }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                        border: `1.5px solid ${adultConfirmed ? "#10b981" : "#f59e0b"}`,
                        background: adultConfirmed ? "#10b981" : "transparent",
                        display: "grid", placeItems: "center",
                      }}>
                        {adultConfirmed && <Check size={12} color="white" strokeWidth={3}/>}
                      </span>
                      <span>{t("setup.adultConfirm", "Mam ukończone 18 lat. Sidegig tylko zapisuje wyniki — nie przyjmuje zakładów i nie współpracuje z bukmacherami.")}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {blockedByAge && (
            <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>
              {t("setup.adultRequired", "Potwierdź wiek, aby włączyć moduł Zakłady.")}
            </div>
          )}
          {selected.size === 0 && (
            <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>
              {t("setup.pickOne", "Wybierz co najmniej jeden moduł.")}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep(1)} style={{
              flex: 1, padding: 14, borderRadius: 14, cursor: "pointer",
              background: "#0d1628", border: "1px solid #1a2744", color: "#94a3b8",
              fontWeight: 700, fontSize: 14, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <ArrowLeft size={16}/> {t("onb.back", "Wstecz")}
            </button>
            <button onClick={finish} disabled={!canFinish} style={{ ...primaryBtn(canFinish), flex: 2, marginTop: 0 }}>
              {t("setup.start", "Zaczynamy")} <ArrowRight size={16}/>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function primaryBtn(enabled) {
  return {
    width: "100%", marginTop: 18, padding: 14, borderRadius: 14,
    border: "none", color: "white", fontWeight: 800, fontSize: 15,
    fontFamily: "inherit", cursor: enabled ? "pointer" : "not-allowed",
    background: enabled ? BRAND : "#1e3a5f",
    boxShadow: enabled ? "0 4px 20px #10b98140" : "none",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
}

export { SidegigSetup };
