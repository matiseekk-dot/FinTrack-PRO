import { useEffect, useRef, useState } from "react";
import { Flashlight, FlashlightOff, X, RotateCw, CameraOff } from "lucide-react";
import { Modal } from "./ui/Modal.jsx";
import { primaryBtn, fieldLabel, CheckRow, Chip, card } from "./ModuleUI.jsx";
import { t, getLang } from "../i18n.js";
import { newId } from "../lib/ledger.js";
import { getDisplayCurrency } from "../lib/fx.js";
import { fmtCurrency } from "../utils.js";
import { KINDS, collectionKind, itemTitle } from "../lib/collections.js";
import { getDetector, normalizeCode, lookupCode, scanFeedback } from "../lib/barcode.js";
import { canReachRestricted } from "../lib/net.js";

const ACCENT = "#34d399";

/** Podgląd z tylnego aparatu + wykrywanie kodów. onCode(surowy kod) przy każdym odczycie. */
function BarcodeScanner({ onCode, overlay }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState("starting"); // starting | scanning | denied | nocamera | unsupported | failed
  const [torch, setTorch] = useState(null);       // null = telefon nie ma latarki

  useEffect(() => {
    let stopped = false, stream = null, timer = null;
    const stopStream = (s) => { if (s) s.getTracks().forEach(tr => tr.stop()); };
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setState("unsupported"); return; }
      const [cam, det] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        getDetector(),
      ]);
      if (cam.status === "fulfilled") stream = cam.value;
      if (stopped) { stopStream(stream); return; }
      if (cam.status === "rejected") {
        const name = cam.reason && cam.reason.name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "failed");
        return;
      }
      if (det.status === "rejected") { stopStream(stream); setState("failed"); return; }
      const detector = det.value;
      const video = videoRef.current;
      if (!video) { stopStream(stream); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay — wideo i tak ruszy */ }
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) setTorch(false);
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }
      setState("scanning");
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 && !document.hidden) {
          try {
            const found = await detector.detect(video);
            const hit = found.find(b => b.rawValue);
            if (hit && !stopped) onCodeRef.current(hit.rawValue);
          } catch { /* nieczytelna klatka */ }
        }
        timer = setTimeout(tick, 120);
      };
      tick();
    })();
    return () => { stopped = true; clearTimeout(timer); stopStream(stream); trackRef.current = null; };
  }, []);

  const toggleTorch = () => {
    const tr = trackRef.current;
    if (!tr || torch == null) return;
    tr.applyConstraints({ advanced: [{ torch: !torch }] }).then(() => setTorch(!torch)).catch(() => setTorch(null));
  };

  const problem = {
    denied: t("scan.err.denied", "Brak zgody na aparat. Zezwól na dostęp w ustawieniach przeglądarki albo telefonu — albo wpisz kod niżej."),
    nocamera: t("scan.err.nocamera", "Nie znaleziono aparatu. Wpisz kod niżej."),
    unsupported: t("scan.err.unsupported", "Ta przeglądarka nie daje dostępu do aparatu. Wpisz kod niżej."),
    failed: t("scan.err.failed", "Nie udało się uruchomić skanera. Przy pierwszym użyciu potrzebny jest internet. Możesz wpisać kod niżej."),
  }[state];

  return (
    <div style={{ position: "relative", height: "min(34vh, 260px)", minHeight: 170, borderRadius: 14, overflow: "hidden", background: "#000", marginBottom: 12 }}>
      <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", display: problem ? "none" : "block" }}/>
      {problem ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>
          <CameraOff size={26} color="#64748b"/>
          {problem}
        </div>
      ) : <>
        {/* Ramka celownika */}
        <div style={{ position: "absolute", left: "10%", right: "10%", top: "28%", bottom: "28%", border: `2px solid ${overlay && overlay.tone === "ok" ? ACCENT : "rgba(255,255,255,0.75)"}`, borderRadius: 10, pointerEvents: "none", transition: "border-color .15s" }}>
          <div style={{ position: "absolute", left: 8, right: 8, top: "50%", height: 2, background: "#f87171", opacity: 0.8 }}/>
        </div>
        {state === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#cbd5e1", fontSize: 13 }}>{t("scan.starting", "Uruchamiam aparat…")}</div>
        )}
        {torch != null && (
          <button type="button" onClick={toggleTorch} aria-label={t("scan.torch", "Latarka")} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: 8, color: torch ? "#fbbf24" : "#e2e8f0", cursor: "pointer", display: "grid", placeItems: "center" }}>
            {torch ? <Flashlight size={16}/> : <FlashlightOff size={16}/>}
          </button>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "8px 12px", background: "linear-gradient(transparent, rgba(0,0,0,0.75))", color: overlay && overlay.tone === "warn" ? "#fbbf24" : "#e2e8f0", fontSize: 12, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {overlay ? overlay.text : t("scan.aim", "Skieruj aparat na kod kreskowy")}
        </div>
      </>}
    </div>
  );
}

/**
 * Skanowanie kodów do kolekcji.
 *  mode "batch": seria — każdy kod trafia na listę (tytuł szuka się w tle), na końcu „Dodaj”.
 *  mode "single": jeden kod do formularza pozycji — onPick({ code, title, creator, format, year, discogs }).
 */
function ScanModal({ hobby, items, setItems, today, mode = "batch", initialStatus = "owned", salesHint = null, onPick, onAdded, onClose }) {
  const lang = getLang();
  const kind = collectionKind(hobby);
  const formats = KINDS[kind].formats[lang] || KINDS[kind].formats.en;
  const mine = items.filter(it => it.hobbyId === hobby.id);
  const [rows, setRows] = useState([]);   // { code, status: pending|found|notfound|error, data, title, include, dup }
  const [status, setStatus] = useState(initialStatus);
  const [useMedian, setUseMedian] = useState(false);
  const [manual, setManual] = useState("");
  const [manualErr, setManualErr] = useState("");
  const [overlay, setOverlay] = useState(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const lastRef = useRef({ code: null, at: 0 });
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const [tick, setTick] = useState(0);

  const dupOf = (code, data) => {
    const it = mine.find(x => (x.barcode && x.barcode === code) || (data && data.discogs && x.discogs && x.discogs.r === data.discogs.r));
    return it ? itemTitle(it) : null;
  };

  const flash = (text, tone = "ok") => setOverlay({ text, tone, at: Date.now() });

  const addCode = (code) => {
    if (doneRef.current) return;
    const now = Date.now();
    // Aparat czyta ten sam kod kilka razy na sekundę — liczymy go raz
    if (lastRef.current.code === code && now - lastRef.current.at < 3000) return;
    lastRef.current = { code, at: now };
    if (rowsRef.current.some(r => r.code === code)) { flash(t("scan.already", "Ten kod jest już na liście"), "warn"); return; }
    scanFeedback();
    const dup = dupOf(code, null);
    flash(dup ? t("scan.youHave", "Już masz: {title}").replace("{title}", dup) : `${code} · ${t("scan.searching", "szukam…")}`, dup ? "warn" : "ok");
    setRows(prev => [{ code, status: "pending", data: null, title: "", include: !dup, dup }, ...prev]);
  };

  const onCode = (raw) => {
    const code = normalizeCode(raw);
    if (code) addCode(code);
  };

  const submitManual = () => {
    const code = normalizeCode(manual, true);
    if (!code) { setManualErr(t("scan.err.code", "To nie wygląda na kod ISBN/EAN — sprawdź cyfry.")); return; }
    setManualErr(""); setManual("");
    lastRef.current = { code: null, at: 0 };
    addCode(code);
  };

  // Kolejka wyszukiwania: po jednym kodzie (limity darmowych baz)
  useEffect(() => {
    if (busyRef.current) return;
    const next = rows.find(r => r.status === "pending");
    if (!next) return;
    busyRef.current = true;
    lookupCode(next.code, kind, lang).then(res => {
      if (mode === "single" && !doneRef.current) {
        doneRef.current = true;
        onPick({ code: next.code, found: res.status === "found", dup: next.dup || (res.data ? dupOf(next.code, res.data) : null), ...(res.data || {}) });
        return;
      }
      setRows(prev => prev.map(r => {
        if (r.code !== next.code) return r;
        if (res.status !== "found") return { ...r, status: res.status };
        const dup = r.dup || dupOf(r.code, res.data);
        return { ...r, status: "found", data: res.data, title: res.data.title, dup, include: r.include && !dup };
      }));
      if (res.status === "found" && rowsRef.current[0] && rowsRef.current[0].code === next.code) {
        flash(`✓ ${res.data.creator ? `${res.data.title} – ${res.data.creator}` : res.data.title}`);
      }
    }).finally(() => { busyRef.current = false; setTick(x => x + 1); });
  }, [rows, tick]);

  const patchRow = (code, patch) => setRows(prev => prev.map(r => r.code === code ? { ...r, ...patch } : r));
  const ready = rows.filter(r => r.include && (r.status === "found" || r.status === "notfound" || r.status === "error") && r.title.trim());
  const pending = rows.filter(r => r.status === "pending").length;

  const add = () => {
    if (!ready.length) return;
    const currency = getDisplayCurrency();
    const owned = status === "owned";
    const fresh = ready.map(r => {
      const d = r.data || {};
      const median = owned && useMedian && salesHint && !d.discogs;
      return {
        id: newId(), hobbyId: hobby.id, status,
        title: r.title.trim(), creator: d.creator || "", format: formats.includes(d.format) ? d.format : "",
        condition: owned ? "good" : null, currency,
        buyPrice: null, buyDate: null, buyTxId: null, buyTxOwned: false,
        value: median ? salesHint.median : null, targetPrice: null, createdAt: today,
        ...(median ? { valueSource: "sales", valueAt: today, valueCur: currency } : {}),
        barcode: r.code,
        ...(d.year ? { year: d.year } : {}),
        ...(d.discogs ? { discogs: d.discogs } : {}),
      };
    });
    doneRef.current = true;
    setItems(prev => [...fresh, ...prev]);
    onAdded(fresh.length);
  };

  const close = () => {
    const unsaved = rows.filter(r => r.include).length;
    if (mode === "batch" && unsaved > 0 && !window.confirm(t("scan.confirmClose", "Zamknąć? Zeskanowane pozycje ({n}) nie zostaną dodane.").replace("{n}", unsaved))) return;
    doneRef.current = true;
    onClose();
  };

  const single = mode === "single";
  return (
    <Modal open onClose={close} title={single ? t("scan.titleOne", "Skanuj kod") : t("scan.title", "Skanuj kody")}>
      <BarcodeScanner onCode={onCode} overlay={single && rows.length ? { text: t("scan.searching", "szukam…"), tone: "ok" } : overlay}/>

      <div style={{ display: "flex", gap: 8, marginBottom: manualErr ? 6 : 14 }}>
        <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submitManual(); }}
          inputMode="numeric" placeholder={t("scan.manualPh", "albo wpisz ISBN / EAN")} aria-label={t("scan.manualPh", "albo wpisz ISBN / EAN")}
          style={{ flex: 1, minWidth: 0, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "11px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "inherit", outline: "none" }}/>
        <button type="button" onClick={submitManual} disabled={!manual.trim()} style={{ flex: "none", background: ACCENT + "18", border: `1px solid ${ACCENT}55`, color: ACCENT, borderRadius: 10, padding: "0 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: manual.trim() ? 1 : 0.5 }}>
          {t("scan.find", "Szukaj")}
        </button>
      </div>
      {manualErr && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{manualErr}</div>}

      {!single && <>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#64748b", marginRight: 2 }}>{t("scan.addAs", "Dodaj jako:")}</span>
          <Chip on={status === "owned"} color={ACCENT} onClick={() => setStatus("owned")}>{t("coll.shelf.owned", "Mam")}</Chip>
          <Chip on={status === "wishlist"} color="#f59e0b" onClick={() => setStatus("wishlist")}>{t("coll.shelf.wishlist", "Lista życzeń")}</Chip>
        </div>

        {rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 14 }}>
            {t("scan.hint", "Skanuj po kolei — każdy kod od razu trafia na listę, a tytuł i autor uzupełniają się same. Kod, który już masz w kolekcji, oznaczymy.")}
          </div>
        ) : <>
          <div style={fieldLabel}>{t("scan.list", "Zeskanowane")} · {rows.length}{pending > 0 ? ` · ${t("scan.searching", "szukam…")}` : ""}</div>
          <div style={{ ...card, background: "#060b14", padding: "2px 12px", marginBottom: 12 }}>
            {rows.map((r, i) => (
              <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < rows.length - 1 ? "1px solid #0f1a2e" : "none" }}>
                <button type="button" role="checkbox" aria-checked={r.include} onClick={() => patchRow(r.code, { include: !r.include })} aria-label={t("scan.include", "Dodaj tę pozycję")}
                  style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${r.include ? ACCENT : "#475569"}`, background: r.include ? ACCENT : "transparent", cursor: "pointer", padding: 0, color: "white", fontSize: 12, fontWeight: 800, lineHeight: "17px" }}>
                  {r.include ? "✓" : ""}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.status === "found" ? <>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[r.data.creator, formats.includes(r.data.format) ? r.data.format : null, r.data.year].filter(Boolean).join(" · ") || r.code}
                    </div>
                  </> : r.status === "pending" ? <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{r.code}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{t("scan.searching", "szukam…")}</div>
                  </> : <>
                    <input value={r.title} onChange={e => patchRow(r.code, { title: e.target.value, include: e.target.value.trim() ? true : r.include })}
                      placeholder={r.status === "error" ? t("scan.offlinePh", "Brak połączenia — wpisz tytuł") : t("scan.notFoundPh", "Nie znaleziono — wpisz tytuł")}
                      style={{ width: "100%", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8, padding: "7px 9px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}/>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, display: "flex", gap: 8, alignItems: "center" }}>
                      {r.code}
                      {r.status === "error" && (
                        <button type="button" onClick={() => patchRow(r.code, { status: "pending" })} style={{ background: "none", border: "none", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "inherit" }}>
                          <RotateCw size={11}/> {t("scan.retry", "Ponów")}
                        </button>
                      )}
                    </div>
                  </>}
                  {r.dup && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>{t("scan.youHave", "Już masz: {title}").replace("{title}", r.dup)}</div>}
                </div>
                <button type="button" onClick={() => setRows(prev => prev.filter(x => x.code !== r.code))} aria-label={t("scan.remove", "Usuń z listy")}
                  style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}>
                  <X size={15}/>
                </button>
              </div>
            ))}
          </div>
        </>}

        {!canReachRestricted && rows.some(r => r.status === "notfound" || r.status === "error") && (
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5, margin: "-4px 0 12px" }}>
            {t("scan.webLimit", "Wiele gier i polskich książek nie ma w bazach dostępnych z przeglądarki. W aplikacji na Androida szukamy też w Bibliotece Narodowej i w dużej bazie kodów produktów. Wpisz tytuł — kod zapiszemy.")}
          </div>
        )}
        {status === "owned" && salesHint && rows.length > 0 && (
          <CheckRow checked={useMedian} onChange={setUseMedian}>
            {t("scan.median", "Wpisz wartość {amount} — medianę Twoich sprzedaży ({n}) — pozycjom bez wyceny. Zmienisz ją w każdej chwili.")
              .replace("{amount}", fmtCurrency(salesHint.median, getDisplayCurrency())).replace("{n}", salesHint.n)}
          </CheckRow>
        )}

        <button onClick={add} disabled={!ready.length} style={{ ...primaryBtn, opacity: ready.length ? 1 : 0.5, cursor: ready.length ? "pointer" : "default" }}>
          {t("scan.add", "Dodaj do kolekcji ({n})").replace("{n}", ready.length)}
        </button>
      </>}

      {single && (
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          {t("scan.singleHint", "Po odczytaniu kodu tytuł i autor wpiszą się w formularz.")}
        </div>
      )}
    </Modal>
  );
}

export { ScanModal };
