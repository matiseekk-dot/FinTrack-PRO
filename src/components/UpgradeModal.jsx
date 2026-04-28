import { useState, useEffect } from "react";
import { X, Sparkles, Crown, ExternalLink } from "lucide-react";
import { t } from "../i18n.js";

// v1.3.0: Refactor po przejściu z Gumroad license keys na Google Play Billing.
// v1.3.1: TIER_FEATURES jako funkcja (nie const) - ewaluuje t() przy każdym renderze.
function getTierFeatures() {
  return [
    { label: t("upgrade.feat.txLimit",     "Limit transakcji miesięcznie"),     free: "50", pro: t("upgrade.feat.unlimited", "Bez limitu") },
    { label: t("upgrade.feat.support",     "Wsparcie autora"),                  free: "—",  pro: "✅" },
    { label: t("upgrade.feat.earlyAccess", "Wczesny dostęp do nowych funkcji"), free: "—",  pro: "✅" },
  ];
}

// Play Store listing URL. Po publikacji apki podstaw realny link.
// W TWA context (apka pobrana z Play Store) lepiej użyć market intent.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=pl.skudev.fintrackpro";
const PLAY_STORE_INTENT = "market://details?id=pl.skudev.fintrackpro";

function UpgradeModal({ open, onClose, trigger, onActivated }) {
  const [plan, setPlan] = useState("yearly");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!open) {
      setOpening(false);
    }
  }, [open]);

  if (!open) return null;

  const handlePurchase = () => {
    // v1.3.0: TODO — integracja RevenueCat. Na razie otwieramy Play Store listing.
    //
    // Plan integracji RC (osobna sesja):
    //   1. import { Purchases } from "@revenuecat/purchases-js" (lub native bridge w TWA)
    //   2. await Purchases.configure({ apiKey: REVENUECAT_PUBLIC_KEY, appUserID: user.uid })
    //   3. const offerings = await Purchases.getOfferings()
    //   4. const package = offerings.current.availablePackages.find(p => p.identifier === plan)
    //   5. await Purchases.purchasePackage(package)
    //   6. customerInfo.entitlements.active["pro"] → setProStatus({ source: "play_store", ... })
    //
    // Do tego czasu - prosty redirect do Play Store żeby user mógł sam zainstalować/zobaczyć.
    setOpening(true);

    // Próbuj market intent (TWA / mobile Chrome) najpierw, fallback do https URL
    try {
      window.location.href = PLAY_STORE_INTENT;
      // Fallback po 1.5s jeśli intent nie zadziałał
      setTimeout(() => {
        window.open(PLAY_STORE_URL, "_blank");
        setOpening(false);
      }, 1500);
    } catch (_) {
      window.open(PLAY_STORE_URL, "_blank");
      setOpening(false);
    }
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
        padding: "24px 22px calc(env(safe-area-inset-bottom, 24px) + 24px)",
        width: "100%", maxWidth: 500,
        maxHeight: "90vh", overflowY: "auto",
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
              {trigger === "limit" && t("upgrade.trigger.limit", "Osiągnięto limit 50 transakcji miesięcznie")}
              {trigger === "import" && t("upgrade.trigger.import", "Import z banków to funkcja PRO")}
              {trigger === "sync" && t("upgrade.trigger.sync", "Synchronizacja między urządzeniami to funkcja PRO")}
              {trigger === "account" && t("upgrade.trigger.account", "Bez limitu kont bankowych")}
              {trigger === "budget" && t("upgrade.trigger.budget", "Bez limitu budżetów")}
              {trigger === "goal" && t("upgrade.trigger.goal", "Bez limitu celów oszczędnościowych")}
              {trigger === "customCat" && t("upgrade.trigger.customCat", "Własne kategorie to funkcja PRO")}
              {!trigger && t("upgrade.trigger.default", "Odblokuj pełną wersję aplikacji")}
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

        {/* Plan toggle */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {[
            { id: "yearly",   label: t("upgrade.yearly", "Rocznie"),  price: "99 zł", sub: t("upgrade.yearly.sub", "tylko 8 zł/msc"), badge: null },
            { id: "lifetime", label: t("upgrade.lifetime", "Dożywotnio"), price: "199 zł", sub: t("upgrade.lifetime.sub", "raz i na zawsze"), badge: t("upgrade.lifetime.badge", "Early bird") },
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
            <div>{t("upgrade.col.feature", "Funkcja")}</div>
            <div style={{ textAlign: "center" }}>Free</div>
            <div style={{ textAlign: "center", color: "#60a5fa" }}>PRO</div>
          </div>
          {(() => {
            const feats = getTierFeatures();
            return feats.map((f, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 64px 64px",
                padding: "10px 14px",
                borderBottom: i < feats.length - 1 ? "1px solid #0f1a2e" : "none",
                fontSize: 12, alignItems: "center",
              }}>
                <div style={{ color: "#cbd5e1" }}>{f.label}</div>
                <div style={{ textAlign: "center", color: "#64748b", fontSize: 11 }}>{f.free}</div>
                <div style={{ textAlign: "center", color: "#60a5fa", fontWeight: 700 }}>{f.pro}</div>
              </div>
            ));
          })()}
        </div>

        {/* CTA */}
        <button onClick={handlePurchase} disabled={opening} style={{
          width: "100%", padding: 16, marginBottom: 10,
          background: opening ? "#1e3a5f" : "linear-gradient(135deg,#1e40af,#7c3aed)",
          border: "none", borderRadius: 14, color: "white",
          fontWeight: 800, fontSize: 15,
          cursor: opening ? "wait" : "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: opening ? "none" : "0 4px 20px #7c3aed55",
          opacity: opening ? 0.7 : 1,
        }}>
          {opening ? <Sparkles size={18}/> : <ExternalLink size={18}/>}
          {opening ? t("upgrade.opening", "Otwieram Play Store...") : t("upgrade.openPlay", "Otwórz w Google Play")}
        </button>

        <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          {t("upgrade.disclaimer1", "Płatność przez Google Play · Subskrypcja roczna lub dożywotni dostęp")}<br/>
          {t("upgrade.disclaimer2", "Możesz anulować w ustawieniach Google Play w każdej chwili")}
        </div>
      </div>
    </div>
  );
}

export { UpgradeModal };
