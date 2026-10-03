import { useState } from "react";
import { List, Landmark, SlidersHorizontal, Settings, ChevronRight, PanelBottom, Pin } from "lucide-react";
import { t, getLang } from "../i18n.js";
import { MODULES, moduleLabel, moduleDesc } from "../lib/modules.js";
import { NAV_SLOTS, navCandidates, defaultNavTabs, navItem } from "../lib/nav.js";
import { Modal } from "../components/ui/Modal.jsx";
import { primaryBtn } from "../components/ModuleUI.jsx";

/**
 * "More" tab: every destination of the app in one list, plus the editor for
 * the bottom-bar shortcuts.
 */
function MoreView({ modules = [], navTabs = [], onNavTabsChange, onNavigate, onOpenModule, onManageModules, onOpenSettings }) {
  const lang = getLang();
  const [editNav, setEditNav] = useState(false);

  // Moduły z własnym ekranem (pozostałe są dostępne jako filtr w Wpisach)
  const screens = [
    ["reselling",   t("more.resellingDesc", "Przedmioty, prowizje, zysk na sztuce")],
    ["betting",     t("more.bettingDesc", "Kupony, ROI, bukmacherzy")],
    ["freelance",   t("more.freelanceDesc", "Zlecenia, klienci, zaległe płatności")],
    ["collections", t("more.collectionsDesc", "Katalog, wartość, lista życzeń")],
    ["trips",       moduleDesc("trips", lang)],
  ].filter(([id]) => modules.includes(id));

  const groups = [
    ...(screens.length ? [{
      title: t("more.moduleScreens", "Moduły"),
      items: screens.map(([id, desc]) => ({ id: `__mod_${id}`, nav: id, Icon: MODULES[id].icon, color: MODULES[id].color, label: moduleLabel(id, lang), desc })),
    }] : []),
    {
      title: t("more.money", "Pieniądze"),
      items: [
        { id: "transactions", nav: "transactions", Icon: List, color: "#94a3b8", label: t("nav.ledger", "Wpisy"), desc: t("more.ledgerDesc", "Wszystkie wpisy, filtry, wydatki osobiste") },
        { id: "portfolio", nav: "portfolio", Icon: Landmark, color: "#60a5fa", label: t("more.accounts", "Konta"), desc: t("more.accountsDesc", "Salda, waluty kont, inwestycje") },
      ],
    },
    {
      title: t("more.app", "Aplikacja"),
      items: [
        { id: "__nav",      Icon: PanelBottom,       color: "#10b981", label: t("more.navTitle", "Dolny pasek"), desc: t("more.navDesc", "Wybierz skróty na pasku na dole") },
        { id: "__modules",  Icon: SlidersHorizontal, color: "#34d399", label: t("more.modules", "Moduły"), desc: t("more.modulesDesc", "Wybierz, co śledzisz, i walutę główną") },
        { id: "__settings", Icon: Settings,          color: "#64748b", label: t("more.settings", "Ustawienia"), desc: t("more.settingsDesc", "Eksport, import, PIN, kursy walut") },
      ],
    },
  ];

  const open = (id) => {
    if (id === "__nav") return setEditNav(true);
    if (id === "__modules") return onManageModules && onManageModules();
    if (id === "__settings") return onOpenSettings && onOpenSettings();
    if (id.startsWith("__mod_")) {
      const mod = id.slice(6);
      // Wyjazdy to zwykła zakładka, nie ekran modułu
      return mod === "trips" ? onNavigate && onNavigate("trips") : onOpenModule && onOpenModule(mod);
    }
    return onNavigate && onNavigate(id);
  };

  return (
    <div style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map(g => (
        <section key={g.title}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "4px 4px 8px" }}>{g.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map(({ id, nav, Icon, color, label, desc }) => (
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
                {nav && navTabs.includes(nav) && <Pin size={12} color="#10b981" aria-label={t("more.navPinned", "Na pasku")}/>}
                <ChevronRight size={14} color="#334155"/>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div style={{ textAlign: "center", fontSize: 11, color: "#334155", fontFamily: "'DM Mono', monospace" }}>
        Sidegig · v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
      </div>

      {editNav && <NavEditor onClose={() => setEditNav(false)} modules={modules} value={navTabs} onChange={onNavTabsChange}/>}
    </div>
  );
}

/** Choose up to NAV_SLOTS shortcuts; the order of tapping is the order on the bar. */
function NavEditor({ onClose, modules, value, onChange }) {
  const [picked, setPicked] = useState(value);

  const candidates = navCandidates(modules);
  const full = picked.length >= NAV_SLOTS;
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= NAV_SLOTS ? p : [...p, id]);
  const save = () => { onChange && onChange(picked); onClose(); };
  const reset = () => setPicked(defaultNavTabs(modules));

  const preview = ["home", ...picked, "more"].map(id => navItem(id));
  const split = Math.ceil(preview.length / 2);
  const previewItem = (item) => (
    <span key={item.id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 2px" }}>
      <item.Icon size={14} color={item.id === "home" || item.id === "more" ? "#475569" : "#34d399"}/>
      <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 7, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{item.label}</span>
    </span>
  );

  return (
    <Modal open onClose={onClose} title={t("more.navTitle", "Dolny pasek")}>
      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 14 }}>
        {t("more.navHint", "Wybierz do {n} skrótów. Start i Więcej są zawsze na pasku.").replace("{n}", NAV_SLOTS)}
      </div>

      {/* Podgląd paska */}
      <div style={{ display: "flex", alignItems: "center", background: "#060b14", border: "1px solid #1a2744", borderRadius: 16, padding: "4px 3px", marginBottom: 16 }}>
        {preview.slice(0, split).map(previewItem)}
        <span style={{ width: 34, height: 26, borderRadius: 10, background: "linear-gradient(135deg,#059669,#10b981)", flexShrink: 0, margin: "0 2px", display: "grid", placeItems: "center", color: "white", fontWeight: 800 }}>+</span>
        {preview.slice(split).map(previewItem)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {candidates.map(id => {
          const item = navItem(id);
          const pos = picked.indexOf(id);
          const on = pos >= 0;
          const disabled = !on && full;
          return (
            <button key={id} type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={() => toggle(id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, textAlign: "left",
              background: on ? "#10b98114" : "#060b14", border: `1px solid ${on ? "#10b98155" : "#1a2744"}`,
              cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontFamily: "inherit",
            }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: item.color + "22", border: `1px solid ${item.color}55`, display: "grid", placeItems: "center" }}>
                <item.Icon size={15} color={item.color}/>
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{navLongLabel(id)}</span>
              <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800,
                background: on ? "#10b981" : "transparent", border: `1.5px solid ${on ? "#10b981" : "#475569"}`, color: "white" }}>
                {on ? pos + 1 : ""}
              </span>
            </button>
          );
        })}
      </div>

      {full && <div style={{ fontSize: 11, color: "#64748b", marginTop: 10 }}>{t("more.navFull", "Pasek jest pełny — odznacz coś, żeby wybrać inny skrót.")}</div>}

      <button onClick={save} style={{ ...primaryBtn, marginTop: 16 }}>{t("common.save", "Zapisz")}</button>
      <button onClick={reset} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 8, fontFamily: "inherit" }}>
        {t("more.navReset", "Przywróć domyślne")}
      </button>
    </Modal>
  );
}

// Na liście w edytorze jest miejsce na pełną nazwę modułu
function navLongLabel(id) {
  if (MODULES[id]) return moduleLabel(id);
  return navItem(id).label;
}

export { MoreView };
