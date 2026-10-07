import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Modal } from "./ui/Modal.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { primaryBtn, fieldLabel, CheckRow, card } from "./ModuleUI.jsx";
import { t, getLang } from "../i18n.js";
import { newId } from "../lib/ledger.js";
import { convert, getDisplayCurrency } from "../lib/fx.js";
import { linkProps } from "../lib/native.js";
import { matchDuplicates, mergeDuplicate } from "../lib/collectionMatch.js";
import { getSaved, save, markSynced, needsPricing, fetchFolders, fetchReleases, lowestPrice, collectionValue, mapRelease } from "../lib/discogs.js";

/**
 * Import kolekcji (i listy życzeń) z Discogs do kolekcji winyli + wyceny z rynku Discogs.
 * Ponowny import dodaje tylko nowe płyty — Twoich zmian w pozycjach nie nadpisuje.
 * Płyta, którą masz już w katalogu (dodaną ręcznie), dostaje dane z Discogs zamiast duplikatu.
 */
function DiscogsModal({ hobby, items, setItems, today, onClose }) {
  const lang = getLang();
  const saved = getSaved();
  const [user, setUser] = useState(saved.user);
  const [token, setToken] = useState(saved.token);
  const [withWants, setWithWants] = useState(true);
  const [folders, setFolders] = useState(null);
  const [folderId, setFolderId] = useState(saved.folder);
  const [busy, setBusy] = useState(null);       // tekst postępu
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);   // { added, skipped, wants, merged }
  const [priced, setPriced] = useState(null);   // ile płyt wyceniono
  const [value, setValue] = useState(null);     // wartość kolekcji wg Discogs (z tokenem)
  const [showSetup, setShowSetup] = useState(!saved.user);
  const stopRef = useRef(false);
  // Najświeższe pozycje (po imporcie ceny liczymy już z nowymi płytami)
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const staleBefore = shiftDays(today, -30);
  const mine = items.filter(it => it.hobbyId === hobby.id);
  const toPrice = mine.filter(it => needsPricing(it, staleBefore));
  const fromDiscogs = mine.filter(it => it.discogs).length;
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

  /** Pobiera płyty i dopisuje nowe; rzuca błąd dalej (obsługa w wywołującym). */
  const importReleases = async (folder) => {
    const u = user.trim(), tk = token.trim();
    setBusy(t("discogs.importing", "Pobieram płyty…"));
    const releases = await fetchReleases(u, tk, { folderId: folder, onPage: (n, all) => setBusy(t("discogs.progress", "Pobieram płyty: {n} z {all}").replace("{n}", n).replace("{all}", all)) });
    let wants = [];
    if (withWants) {
      try { wants = await fetchReleases(u, tk, { wantlist: true, onPage: (n, all) => setBusy(t("discogs.progressWants", "Lista życzeń: {n} z {all}").replace("{n}", n).replace("{all}", all)) }); }
      catch { wants = []; } // prywatna lista życzeń — pomijamy bez błędu
    }
    const current = itemsRef.current.filter(it => it.hobbyId === hobby.id);
    const haveInstance = new Set(current.map(it => it.discogs && it.discogs.i).filter(Boolean));
    // Płyta dodana skanerem/ręcznie z numerem wydania, ale bez egzemplarza z kolekcji Discogs
    const byRelease = new Map(current.filter(it => it.status === "owned" && it.discogs && it.discogs.r && !it.discogs.i).map(it => [it.discogs.r, it]));
    const haveWant = new Set(current.filter(it => it.status === "wishlist").map(it => it.discogs && it.discogs.r).filter(Boolean));
    // Nowe pozycje w walucie aplikacji — wyceny z Discogs (EUR) przeliczamy na nią
    const base = { hobbyId: hobby.id, currency: getDisplayCurrency(), buyPrice: null, buyDate: null, buyTxId: null, buyTxOwned: false, value: null, targetPrice: null, createdAt: today };
    const added = [];
    const patches = {};
    let skipped = 0;
    for (const r of releases) {
      const m = mapRelease(r, lang);
      if (m.discogs.i && haveInstance.has(m.discogs.i)) { skipped++; continue; }
      const same = byRelease.get(m.discogs.r);
      if (same) { patches[same.id] = { discogs: m.discogs }; byRelease.delete(m.discogs.r); skipped++; continue; }
      added.push({ ...base, id: newId(), status: "owned", ...m });
    }
    let wantsAdded = 0;
    for (const w of wants) {
      const m = mapRelease(w, lang);
      if (haveWant.has(m.discogs.r)) continue;
      added.push({ ...base, id: newId(), status: "wishlist", ...m, condition: null });
      wantsAdded++;
    }
    // Płyty, które już masz w katalogu (dodane ręcznie) — łączymy zamiast dublować
    const manual = current.filter(it => !it.discogs);
    const merges = matchDuplicates([...manual, ...added]).filter(p => !p.item.discogs && p.dup.discogs);
    const dropped = new Set();
    for (const p of merges) {
      patches[p.item.id] = { ...(patches[p.item.id] || {}), ...mergeDuplicate(p.item, p.dup) };
      dropped.add(p.dup.id);
    }
    const fresh = added.filter(it => !dropped.has(it.id));
    if (fresh.length || Object.keys(patches).length) {
      setItems(prev => [...fresh, ...prev.map(it => patches[it.id] ? { ...it, ...patches[it.id] } : it)]);
    }
    const wantsFresh = fresh.filter(it => it.status === "wishlist").length;
    markSynced(folder, today);
    return { added: fresh.length - wantsFresh, skipped, wants: wantsFresh, merged: merges.length };
  };

  // Wyceny po kolei (limit Discogs); zapis co kilka płyt, żeby przerwanie nie gubiło postępu
  const priceList = async (list) => {
    const tk = token.trim();
    let batch = {};
    let done = 0;
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
        const cur = it.currency || "EUR";
        if (eur != null) {
          const v = cur === "EUR" ? eur : convert(eur, "EUR", cur);
          batch[it.id] = { value: Math.round(v * 100) / 100, valueAt: today, valueSource: "discogs", valueCur: cur };
          done++;
        } else {
          // Brak ofert: stara wycena zostaje, chyba że była w innej walucie (wtedy nic nie znaczy)
          batch[it.id] = { valueAt: today, valueCur: cur, ...(it.valueCur === cur ? {} : { value: null, valueSource: null }) };
        }
        if ((i + 1) % 10 === 0) flush();
      }
    } finally { flush(); }
    return { done, total: list.length };
  };

  const run = async (job) => {
    stopRef.current = false;
    setError(""); setResult(null); setPriced(null);
    try { await job(); }
    catch (e) { setError(errText(e)); }
    setBusy(null);
  };

  const runImport = () => run(async () => setResult(await importReleases(folderId)));
  const runPricing = () => run(async () => setPriced(await priceList([...toPrice])));
  // „Odśwież”: nowe płyty z Discogs + wyceny brakujące i starsze niż 30 dni
  const runRefresh = () => run(async () => {
    setResult(await importReleases(saved.folder || 0));
    await new Promise(r => setTimeout(r, 60)); // nowe pozycje trafiają do itemsRef po renderze
    if (stopRef.current) return;
    const list = itemsRef.current.filter(it => it.hobbyId === hobby.id && needsPricing(it, staleBefore));
    setPriced(await priceList(list));
  });

  const minutes = (n) => Math.max(1, Math.ceil(n * (token.trim() ? 1.1 : 2.6) / 60));
  const canRefresh = !!saved.user && fromDiscogs > 0;

  return (
    <Modal open onClose={() => { stopRef.current = true; onClose(); }} title={t("discogs.title", "Discogs")}>
      {canRefresh ? (
        <div style={{ ...card, background: "#060b14", padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>
            {t("discogs.refreshDesc", "Konto {user} · płyty z Discogs: {n}. „Odśwież” dociąga nowe płyty i aktualizuje wyceny starsze niż 30 dni.").replace("{user}", saved.user).replace("{n}", fromDiscogs)}
            {saved.syncedAt && <> {t("discogs.lastSync", "Ostatnio: {date}.").replace("{date}", saved.syncedAt)}</>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runRefresh} disabled={!!busy} style={{ ...primaryBtn, flex: 1, marginTop: 0, opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {busy || <><RefreshCw size={15}/> {t("discogs.refresh", "Odśwież")}</>}
            </button>
            {busy && <StopBtn onClick={() => { stopRef.current = true; }}/>}
          </div>
          {!showSetup && (
            <button onClick={() => setShowSetup(true)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, marginTop: 10, cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
              {t("discogs.changeAccount", "Zmień konto, folder albo token")}
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
          {t("discogs.desc", "Pobierzemy płyty z Twojej kolekcji Discogs do „{name}”. Tylko odczyt — w Discogs nic się nie zmieni. Ponowny import dodaje tylko nowe płyty.").replace("{name}", hobby.name)}
        </div>
      )}

      {(showSetup || !canRefresh) && <>
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
      </>}

      {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 10, lineHeight: 1.45 }}>{error}</div>}

      {result && (
        <div style={{ fontSize: 13, color: "#34d399", marginTop: 12, lineHeight: 1.5 }}>
          {t("discogs.done", "Dodane płyty: {added}, na liście życzeń: {wants}, już były: {skipped}.").replace("{added}", result.added).replace("{wants}", result.wants).replace("{skipped}", result.skipped)}
          {result.merged > 0 && <> {t("discogs.merged", "Połączone z płytami, które były już w katalogu: {n}.").replace("{n}", result.merged)}</>}
        </div>
      )}
      {priced != null && (
        <div style={{ fontSize: 13, color: "#34d399", marginTop: 6, lineHeight: 1.5 }}>
          {priced.total === 0 ? t("discogs.pricesFresh", "Wyceny są aktualne ✓")
            : t("discogs.pricedN", "Wycenione płyty: {n} z {all}.").replace("{n}", priced.done).replace("{all}", priced.total)}
        </div>
      )}

      {toPrice.length > 0 && !(canRefresh && !showSetup) && (
        <div style={{ ...card, background: "#060b14", padding: "12px", marginTop: 14 }}>
          <div style={fieldLabel}>{t("discogs.pricingTitle", "Wyceny z Discogs")}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>
            {t("discogs.pricingDesc", "Bez wyceny: {n}. Wycena = najniższa aktualna oferta na Discogs (ostrożnie). Potrwa ok. {min} min — nie zamykaj tego okna.").replace("{n}", toPrice.length).replace("{min}", minutes(toPrice.length))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runPricing} disabled={!!busy} style={{ ...primaryBtn, flex: 1, marginTop: 0, opacity: busy ? 0.6 : 1 }}>{t("discogs.price", "Pobierz wyceny")}</button>
            {busy && <StopBtn onClick={() => { stopRef.current = true; }}/>}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, marginTop: 14 }}>
        {t("discogs.priceNote", "Wycena = najniższa aktualna oferta na Discogs, przeliczona na Twoją walutę. Wartość wpisana ręcznie nie jest nadpisywana.")}
      </div>
    </Modal>
  );
}

function StopBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ flex: "none", background: "none", border: "1px solid #1a2744", borderRadius: 12, padding: "0 14px", color: "#94a3b8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
      {t("discogs.stop", "Stop")}
    </button>
  );
}

function shiftDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export { DiscogsModal, shiftDays };
