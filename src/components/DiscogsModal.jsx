import { useRef, useState } from "react";
import { Modal } from "./ui/Modal.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { primaryBtn, fieldLabel, CheckRow, card } from "./ModuleUI.jsx";
import { t, getLang } from "../i18n.js";
import { newId } from "../lib/ledger.js";
import { convert } from "../lib/fx.js";
import { linkProps } from "../lib/native.js";
import { getSaved, save, fetchFolders, fetchReleases, lowestPrice, collectionValue, mapRelease } from "../lib/discogs.js";

/**
 * Import kolekcji (i listy życzeń) z Discogs do kolekcji winyli + wyceny z rynku Discogs.
 * Ponowny import dodaje tylko nowe płyty — Twoich zmian w pozycjach nie nadpisuje.
 */
function DiscogsModal({ hobby, items, setItems, today, onClose }) {
  const lang = getLang();
  const saved = getSaved();
  const [user, setUser] = useState(saved.user);
  const [token, setToken] = useState(saved.token);
  const [withWants, setWithWants] = useState(true);
  const [folders, setFolders] = useState(null);
  const [folderId, setFolderId] = useState(0);
  const [busy, setBusy] = useState(null);       // tekst postępu
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);   // { added, skipped, wants }
  const [value, setValue] = useState(null);     // wartość kolekcji wg Discogs (z tokenem)
  const stopRef = useRef(false);

  const mine = items.filter(it => it.hobbyId === hobby.id);
  const toPrice = mine.filter(it => it.status === "owned" && it.discogs && it.discogs.r && (it.value == null || !it.valueAt || it.valueAt < shiftDays(today, -30)));
  const errText = (e) => e.status === 401 || e.status === 403
    ? t("discogs.err.private", "Kolekcja jest prywatna — dodaj token albo ustaw ją w Discogs jako publiczną.")
    : e.status === 404 ? t("discogs.err.user", "Nie ma takiego użytkownika Discogs.")
    : t("discogs.err.network", "Nie udało się połączyć z Discogs. Spróbuj za chwilę.");

  const connect = async () => {
    const u = user.trim();
    if (!u) return;
    setError(""); setBusy(t("discogs.connecting", "Łączę z Discogs…"));
    try {
      save(u, token.trim());
      setFolders(await fetchFolders(u, token.trim()));
      if (token.trim()) setValue(await collectionValue(u, token.trim()));
    } catch (e) { setError(errText(e)); }
    setBusy(null);
  };

  const runImport = async () => {
    const u = user.trim(), tk = token.trim();
    setError(""); setResult(null);
    try {
      setBusy(t("discogs.importing", "Pobieram płyty…"));
      const releases = await fetchReleases(u, tk, { folderId, onPage: (n, all) => setBusy(t("discogs.progress", "Pobieram płyty: {n} z {all}").replace("{n}", n).replace("{all}", all)) });
      let wants = [];
      if (withWants) {
        try { wants = await fetchReleases(u, tk, { wantlist: true, onPage: (n, all) => setBusy(t("discogs.progressWants", "Lista życzeń: {n} z {all}").replace("{n}", n).replace("{all}", all)) }); }
        catch { wants = []; } // prywatna lista życzeń — pomijamy bez błędu
      }
      const haveInstance = new Set(mine.map(it => it.discogs && it.discogs.i).filter(Boolean));
      const haveWant = new Set(mine.filter(it => it.status === "wishlist").map(it => it.discogs && it.discogs.r).filter(Boolean));
      const base = { hobbyId: hobby.id, currency: "EUR", buyPrice: null, buyDate: null, buyTxId: null, buyTxOwned: false, value: null, targetPrice: null, createdAt: today };
      const added = [];
      let skipped = 0;
      for (const r of releases) {
        const m = mapRelease(r, lang);
        if (m.discogs.i && haveInstance.has(m.discogs.i)) { skipped++; continue; }
        added.push({ ...base, id: newId(), status: "owned", ...m });
      }
      let wantsAdded = 0;
      for (const w of wants) {
        const m = mapRelease(w, lang);
        if (haveWant.has(m.discogs.r)) continue;
        added.push({ ...base, id: newId(), status: "wishlist", ...m, condition: null });
        wantsAdded++;
      }
      if (added.length) setItems(prev => [...added, ...prev]);
      setResult({ added: added.length - wantsAdded, skipped, wants: wantsAdded });
    } catch (e) { setError(errText(e)); }
    setBusy(null);
  };

  // Wyceny po kolei (limit Discogs); zapis co kilka płyt, żeby przerwanie nie gubiło postępu
  const runPricing = async () => {
    const tk = token.trim();
    stopRef.current = false;
    setError("");
    const list = [...toPrice];
    let batch = {};
    const flush = () => {
      const b = batch; batch = {};
      if (Object.keys(b).length) setItems(prev => prev.map(it => b[it.id] ? { ...it, ...b[it.id] } : it));
    };
    try {
      for (let i = 0; i < list.length; i++) {
        if (stopRef.current) break;
        setBusy(t("discogs.pricing", "Wyceniam {n} z {all}…").replace("{n}", i + 1).replace("{all}", list.length));
        const it = list[i];
        const eur = await lowestPrice(it.discogs.r, tk, "EUR");
        if (eur != null) {
          const cur = it.currency || "EUR";
          const v = cur === "EUR" ? eur : convert(eur, "EUR", cur);
          batch[it.id] = { value: Math.round(v * 100) / 100, valueAt: today, valueSource: "discogs" };
        } else batch[it.id] = { valueAt: today };
        if ((i + 1) % 10 === 0) flush();
      }
    } catch (e) { setError(errText(e)); }
    flush();
    setBusy(null);
  };

  const minutes = Math.max(1, Math.ceil(toPrice.length * (token.trim() ? 1.1 : 2.6) / 60));

  return (
    <Modal open onClose={() => { stopRef.current = true; onClose(); }} title={t("discogs.title", "Discogs")}>
      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
        {t("discogs.desc", "Pobierzemy płyty z Twojej kolekcji Discogs do „{name}”. Tylko odczyt — w Discogs nic się nie zmieni. Ponowny import dodaje tylko nowe płyty.").replace("{name}", hobby.name)}
      </div>

      <Input label={t("discogs.user", "Nazwa użytkownika Discogs")} value={user} onChange={e => setUser(e.target.value)} placeholder={t("discogs.userPh", "np. vinyl_fan")}/>
      <Input label={t("discogs.token", "Token osobisty (opcjonalnie)")} value={token} onChange={e => setToken(e.target.value)} placeholder="•••" type="password"/>
      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, margin: "-6px 0 12px" }}>
        {t("discogs.tokenHint", "Potrzebny, jeśli kolekcja jest prywatna, i przyspiesza wyceny. Wygenerujesz go w Discogs → Ustawienia → Developers. Zostaje tylko na tym urządzeniu.")}{" "}
        <a {...linkProps("https://www.discogs.com/settings/developers")} style={{ color: "#94a3b8" }}>discogs.com/settings/developers</a>
      </div>

      {!folders ? (
        <button onClick={connect} disabled={!!busy || !user.trim()} style={{ ...primaryBtn, opacity: busy || !user.trim() ? 0.6 : 1 }}>
          {busy || t("discogs.connect", "Połącz")}
        </button>
      ) : <>
        <Select label={t("discogs.folder", "Co zaimportować")} value={folderId} onChange={e => setFolderId(Number(e.target.value))}>
          {folders.map(f => <option key={f.id} value={f.id}>{f.id === 0 ? t("discogs.all", "Cała kolekcja") : f.name} ({f.count})</option>)}
        </Select>
        <CheckRow checked={withWants} onChange={setWithWants}>{t("discogs.wants", "Także lista życzeń (Wantlist) — trafi do „Lista życzeń”")}</CheckRow>
        {value && value.median && (
          <div style={{ ...card, background: "#060b14", padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#cbd5e1" }}>
            {t("discogs.value", "Wartość kolekcji wg Discogs: mediana {median} (od {min} do {max})").replace("{median}", value.median).replace("{min}", value.minimum).replace("{max}", value.maximum)}
          </div>
        )}
        <button onClick={runImport} disabled={!!busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy || t("discogs.import", "Importuj")}
        </button>
      </>}

      {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 10, lineHeight: 1.45 }}>{error}</div>}

      {result && (
        <div style={{ fontSize: 13, color: "#34d399", marginTop: 12, lineHeight: 1.5 }}>
          {t("discogs.done", "Dodane płyty: {added}, na liście życzeń: {wants}, już były: {skipped}.").replace("{added}", result.added).replace("{wants}", result.wants).replace("{skipped}", result.skipped)}
        </div>
      )}

      {folders && toPrice.length > 0 && (
        <div style={{ ...card, background: "#060b14", padding: "12px", marginTop: 14 }}>
          <div style={fieldLabel}>{t("discogs.pricingTitle", "Wyceny z Discogs")}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>
            {t("discogs.pricingDesc", "Bez wyceny: {n}. Wycena = najniższa aktualna oferta na Discogs (ostrożnie). Potrwa ok. {min} min — nie zamykaj tego okna.").replace("{n}", toPrice.length).replace("{min}", minutes)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runPricing} disabled={!!busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{t("discogs.price", "Pobierz wyceny")}</button>
            {busy && <button onClick={() => { stopRef.current = true; }} style={{ flex: "none", background: "none", border: "1px solid #1a2744", borderRadius: 12, padding: "0 14px", color: "#94a3b8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t("discogs.stop", "Stop")}</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function shiftDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export { DiscogsModal };
