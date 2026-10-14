import { useMemo, useState } from "react";
import { Modal } from "./ui/Modal.jsx";
import { primaryBtn, card, num } from "./ModuleUI.jsx";
import { t } from "../i18n.js";
import { rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { buildPurchaseTx, itemTitle, knownAddedDate, purchaseDateGuess } from "../lib/collections.js";
import { shiftDays } from "./DiscogsModal.jsx";

const ACCENT = "#34d399";
const PAGE = 40;

/**
 * Ceny zakupu kilku pozycji naraz (po imporcie z Discogs albo skanowaniu).
 * „Wydatek” przy wierszu = wpis zakupu w Wpisach połączony z pozycją (jak „Nowy wydatek”
 * w formularzu pozycji). Bez niego zapisujemy tylko cenę — do liczenia zysku.
 * Domyślnie wydatek mają zakupy z ostatnich 60 dni; starsze rzeczy nie zaniżają bieżącego miesiąca.
 * items — lista na start (np. nowe płyty), older — pozostałe bez ceny, pokazywane na życzenie.
 */
function PurchaseFillModal({ hobby, items: first, older = [], setItems, setTransactions, setAccounts, defaultAcc = 1, today, onClose, onSaved }) {
  const recentFrom = shiftDays(today, -60);
  const [rows, setRows] = useState(() => Object.fromEntries([...first, ...older].map(it => {
    const date = purchaseDateGuess(it, today);
    const known = knownAddedDate(it);
    return [it.id, { price: "", date, expense: !!known && date >= recentFrom, touched: false }];
  })));
  const [limit, setLimit] = useState(first.length ? first.length : PAGE);
  const items = useMemo(() => [...first, ...older], [first, older]);
  const [saving, setSaving] = useState(false);

  const patch = (id, p) => setRows(r => {
    const next = { ...r[id], ...p };
    // Zmiana daty przestawia „Wydatek”, dopóki ktoś nie wybrał go sam
    if (p.date && !next.touched) next.expense = p.date >= recentFrom;
    return { ...r, [id]: next };
  });

  const filled = useMemo(() => items.filter(it => {
    const v = num(rows[it.id]?.price);
    return isFinite(v) && v > 0;
  }), [items, rows]);
  const withExpense = filled.filter(it => rows[it.id].expense).length;
  const bad = items.some(it => {
    const raw = String(rows[it.id]?.price || "").trim();
    const v = num(raw);
    return raw && !(isFinite(v) && v > 0);
  });

  const save = async () => {
    if (!filled.length || saving || bad) return;
    setSaving(true);
    try {
      const patches = new Map();
      const add = [];
      const rates = new Map();
      for (const it of filled) {
        const r = rows[it.id];
        const date = r.date || today;
        const next = { ...it, buyPrice: Math.round(num(r.price) * 100) / 100, buyDate: date, buyTxId: null, buyTxOwned: false, acc: it.acc ?? defaultAcc };
        if (r.expense) {
          const cur = next.currency || "PLN";
          const key = `${cur}|${date}`;
          if (!rates.has(key)) rates.set(key, await rateOnDate(cur, date));
          const tx = buildPurchaseTx(next, hobby, rates.get(key));
          next.buyTxId = tx.id;
          next.buyTxOwned = true;
          add.push(tx);
        }
        patches.set(it.id, next);
      }
      if (add.length) commitTxChanges({ setTransactions, setAccounts }, { add });
      // Pozycja mogła się w międzyczasie zmienić (sync) — dopisujemy tylko pola zakupu
      setItems(prev => prev.map(it => {
        const p = patches.get(it.id);
        if (!p || it.buyTxId != null || it.buyPrice != null) return it;
        return { ...it, buyPrice: p.buyPrice, buyDate: p.buyDate, buyTxId: p.buyTxId, buyTxOwned: p.buyTxOwned, acc: p.acc };
      }));
      onSaved(filled.length, add.length);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", minWidth: 0, boxSizing: "border-box", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8,
    padding: "8px 9px", color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", outline: "none", WebkitAppearance: "none",
  };

  return (
    <Modal open onClose={onClose} title={t("buyfill.title", "Ceny zakupu")}>
      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 6 }}>
        {t("buyfill.desc", "Wpisz, ile kosztowały. Puste pola pomijamy — uzupełnisz je kiedy indziej.")}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, marginBottom: 12 }}>
        {t("buyfill.expenseHint", "Z „Wydatkiem” zakup trafi też do Wpisów z tą datą — policzy się w wydatkach kolekcji. Bez niego zapiszemy tylko cenę (do liczenia zysku) — tak zostaw rzeczy kupione dawno.")}
      </div>

      <div style={{ ...card, background: "#060b14", padding: "2px 12px", marginBottom: 12 }}>
        {items.slice(0, limit).map((it, i, arr) => {
          const r = rows[it.id];
          const sub = [it.creator, it.format].filter(Boolean).join(" · ");
          return (
            <div key={it.id} style={{ padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                  {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
                </div>
                <button type="button" role="checkbox" aria-checked={r.expense} onClick={() => patch(it.id, { expense: !r.expense, touched: true })}
                  title={t("buyfill.expenseTip", "Zapisz też jako wydatek w Wpisach")}
                  aria-label={`${t("buyfill.expenseTip", "Zapisz też jako wydatek w Wpisach")} · ${itemTitle(it)}`}
                  style={{
                    flex: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5,
                    background: r.expense ? ACCENT + "22" : "transparent", border: `1px solid ${r.expense ? ACCENT : "#1a2744"}`, color: r.expense ? ACCENT : "#64748b",
                  }}>
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${r.expense ? ACCENT : "#475569"}`, background: r.expense ? ACCENT : "transparent", color: "#060b14", fontSize: 9, lineHeight: "10px", textAlign: "center", fontWeight: 900 }}>{r.expense ? "✓" : ""}</span>
                  {t("buyfill.expense", "Wydatek")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                  <input type="text" inputMode="decimal" value={r.price} placeholder="0"
                    aria-label={`${t("coll.price", "Cena")} · ${itemTitle(it)}`}
                    onChange={e => patch(it.id, { price: e.target.value })}
                    style={{ ...inputStyle, paddingRight: 34, fontFamily: "'DM Mono', monospace" }}/>
                  <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#64748b", pointerEvents: "none" }}>{it.currency || "PLN"}</span>
                </div>
                <input type="date" value={r.date} max={today} aria-label={`${t("coll.boughtOn", "Kupione")} · ${itemTitle(it)}`}
                  onChange={e => patch(it.id, { date: e.target.value })}
                  style={{ ...inputStyle, flex: 1, fontSize: 14 }}/>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > limit && (
        <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ width: "100%", marginBottom: 12, background: "none", border: "1px dashed #1a2744", borderRadius: 10, padding: 10, color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {(limit === first.length && first.length > 0
            ? t("buyfill.older", "Pokaż też starsze bez ceny ({n})")
            : t("buyfill.more", "Pokaż więcej ({n})")).replace("{n}", items.length - limit)}
        </button>
      )}

      {bad && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{t("buyfill.bad", "Popraw cenę — to nie wygląda na kwotę.")}</div>}
      <button onClick={save} disabled={!filled.length || saving || bad} style={{ ...primaryBtn, opacity: filled.length && !bad ? (saving ? 0.7 : 1) : 0.5, cursor: filled.length && !bad ? (saving ? "wait" : "pointer") : "default" }}>
        {saving ? t("common.saving", "Zapisuję…")
          : !filled.length ? t("buyfill.saveNone", "Wpisz przynajmniej jedną cenę")
          : (withExpense
            ? t("buyfill.saveWith", "Zapisz ceny ({n}) · wydatki: {m}").replace("{m}", withExpense)
            : t("buyfill.save", "Zapisz ceny ({n})")).replace("{n}", filled.length)}
      </button>
    </Modal>
  );
}

export { PurchaseFillModal };
