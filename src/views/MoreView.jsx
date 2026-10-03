import { Briefcase, Wallet, Bell, BarChart2, SlidersHorizontal, Settings, ChevronRight } from "lucide-react";
import { t, getLang } from "../i18n.js";
import { MODULES, moduleLabel } from "../lib/modules.js";

/**
 * "More" tab: secondary destinations that don't earn a bottom-nav slot.
 * Personal-budget screens (Budget, Bills, Insights) appear only when the
 * Personal budget module is enabled.
 */
function MoreView({ modules = [], unpaidBillsCount = 0, onNavigate, onOpenModule, onManageModules, onOpenSettings }) {
  const personal = modules.includes("personal");
  const lang = getLang();
  // Moduły z własnym ekranem (pozostałe są dostępne jako filtr w Wpisach)
  const screens = [
    ["betting",   t("more.bettingDesc", "Kupony, ROI, bukmacherzy")],
    ["reselling", t("more.resellingDesc", "Przedmioty, prowizje, zysk na sztuce")],
    ["collections", t("more.collectionsDesc", "Katalog, wartość, lista życzeń")],
    ["freelance", t("more.freelanceDesc", "Zlecenia, klienci, zaległe płatności")],
  ].filter(([id]) => modules.includes(id));

  const groups = [
    ...(screens.length ? [{
      title: t("more.moduleScreens", "Moduły"),
      items: screens.map(([id, desc]) => ({ id: `__mod_${id}`, Icon: MODULES[id].icon, color: MODULES[id].color, label: moduleLabel(id, lang), desc })),
    }] : []),
    {
      title: t("more.money", "Pieniądze"),
      items: [
        { id: "portfolio", Icon: Briefcase, color: "#60a5fa", label: t("more.accounts", "Konta"), desc: t("more.accountsDesc", "Salda, waluty kont, inwestycje") },
        ...(personal ? [
          { id: "dashboard", Icon: Wallet,   color: "#94a3b8", label: t("more.budget", "Budżet osobisty"), desc: t("more.budgetDesc", "Codzienne wydatki i cykl rozliczeniowy") },
          { id: "payments",  Icon: Bell,     color: "#f59e0b", label: t("more.bills", "Rachunki"), desc: t("more.billsDesc", "Płatności cykliczne"), badge: unpaidBillsCount },
          { id: "analytics", Icon: BarChart2, color: "#8b5cf6", label: t("more.insights", "Analiza"), desc: t("more.insightsDesc", "Ranking wydatków, trendy, porównania") },
        ] : []),
      ],
    },
    {
      title: t("more.app", "Aplikacja"),
      items: [
        { id: "__modules",  Icon: SlidersHorizontal, color: "#34d399", label: t("more.modules", "Moduły"), desc: t("more.modulesDesc", "Wybierz, co śledzisz, i walutę główną") },
        { id: "__settings", Icon: Settings,          color: "#64748b", label: t("more.settings", "Ustawienia"), desc: t("more.settingsDesc", "Eksport, import, PIN, kursy walut") },
      ],
    },
  ];

  const open = (id) => {
    if (id === "__modules") return onManageModules && onManageModules();
    if (id === "__settings") return onOpenSettings && onOpenSettings();
    if (id.startsWith("__mod_")) return onOpenModule && onOpenModule(id.slice(6));
    return onNavigate && onNavigate(id);
  };

  return (
    <div style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map(g => (
        <section key={g.title}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "4px 4px 8px" }}>{g.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map(({ id, Icon, color, label, desc, badge }) => (
              <button key={id} onClick={() => open(id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                background: "#0d1628", border: "1px solid #1a2744",
                fontFamily: "'Space Grotesk', sans-serif", textAlign: "left",
              }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: color + "22", border: `1px solid ${color}55`, display: "grid", placeItems: "center" }}>
                  <Icon size={17} color={color}/>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{label}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{desc}</span>
                </span>
                {badge > 0 && (
                  <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: "#ef4444", color: "white", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", padding: "0 6px" }}>{badge > 9 ? "9+" : badge}</span>
                )}
                <ChevronRight size={14} color="#334155"/>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div style={{ textAlign: "center", fontSize: 11, color: "#334155", fontFamily: "'DM Mono', monospace" }}>
        Sidegig · v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
      </div>
    </div>
  );
}

export { MoreView };
