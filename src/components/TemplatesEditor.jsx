import { useState } from "react";
import { Input, Select } from "./ui/Input.jsx";
import { INITIAL_TEMPLATES, getCat, BASE_CATEGORIES } from "../constants.js";
import { t } from "../i18n.js";

function TemplatesEditor() {
  const [tpls, setTpls] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ft_templates") || JSON.stringify(INITIAL_TEMPLATES));
      // Fix typo migration
      const fixed = saved.map(t => ({ ...t, desc: t.desc === "Zhabka" ? "Zabka" : t.desc }));
      return fixed;
    }
    catch(_) { return INITIAL_TEMPLATES; }
  });
  const [tForm, setTForm] = useState({ desc: "", amount: "", cat: "zakupy" });

  const saveTpls = (next) => {
    setTpls(next);
    try { localStorage.setItem("ft_templates", JSON.stringify(next)); } catch(_) {}
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {tpls.map(t => {
          const cat = getCat(t.cat);
          const Icon = cat.icon;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10,
              background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ background: cat.color+"22", borderRadius: 8, padding: 6 }}>
                <Icon size={13} color={cat.color}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.desc}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{cat.label} · {t.amount} zl</div>
              </div>
              <button onClick={() => saveTpls(tpls.filter(x => x.id !== t.id))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1 }}>x</button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#060b14",
        borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>{t("templates.addLabel", "Dodaj szablon")}</div>
        <Input label="Nazwa (np. Zabka)" value={tForm.desc}
          onChange={e => setTForm(f => ({...f, desc: e.target.value}))} placeholder="np. Zabka"/>
        <Input label="Kwota (zl)" type="number" value={tForm.amount}
          onChange={e => setTForm(f => ({...f, amount: e.target.value}))} placeholder="30"/>
        <Select label="Kategoria" value={tForm.cat}
          onChange={e => setTForm(f => ({...f, cat: e.target.value}))}>
          {BASE_CATEGORIES.filter(c => c.group !== "income").map(c =>
            <option key={c.id} value={c.id}>{c.label}</option>
          )}
        </Select>
        <button onClick={() => {
          if (!tForm.desc || !tForm.amount) return;
          const next = [...tpls, { id: Date.now(), desc: tForm.desc,
            amount: parseFloat(tForm.amount), cat: tForm.cat, acc: 1 }];
          saveTpls(next);
          setTForm({ desc: "", amount: "", cat: "zakupy" });
        }} style={{ background: "#1e3a5f", border: "1px solid #2563eb44",
          borderRadius: 10, padding: "10px 0", color: "#60a5fa",
          fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          + {t("templates.addBtn", "Dodaj szablon")}
        </button>
      </div>
    </div>
  );
};

export { TemplatesEditor };
