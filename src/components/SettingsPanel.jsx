import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft, ChevronRight,
  Home, List, PiggyBank, BarChart2, Settings, ArrowUpRight, ArrowDownLeft,
  CreditCard, Briefcase, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Eye, EyeOff, Edit2, Trash2, Check,
  Bell, BellOff, CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
  ClipboardList, RefreshCw, AlarmClock, Copy
} from "lucide-react";
import { Card } from "./ui/Card.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { TemplatesEditor } from "./TemplatesEditor.jsx";
import { BASE_CATEGORIES, CATEGORIES, getCat, getAllCats, INITIAL_ACCOUNTS, INITIAL_TEMPLATES } from "../constants.js";
import { downloadJSON, loadSnapshotFromJSON } from "../data/storage.js";
import { DEMO_TRANSACTIONS, DEMO_PAYMENTS, DEMO_ACCOUNTS } from "../data/demo.js";
import { PinSettings, PIN_ENABLED_KEY } from "./PinLock.jsx";
import { getLang, setLang } from "../i18n.js";
import { getProStatus, deactivatePro } from "../lib/tier.js";
import { Crown } from "lucide-react";

function SettingsPanel({ open, onClose, accounts, transactions, budgets, payments, paid,
                         goals, customCats, defaultAcc, setDefaultAcc,
                         setTransactions, setAccounts, setBudgets, setCycleDay, setCustomCats,
                         setPayments, setPaid, setGoals,
                         cycleDay, vacationArchive = [], partnerName = "Partner", setPartnerName, onLoadDemo, onClearData }) {
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("#06b6d4");
  const [newCatType,  setNewCatType]  = useState("expense"); // expense | income
  const [importStatus, setImportStatus] = useState(null); // null | "ok" | "err" | "loading"
  const [importMsg, setImportMsg]       = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDemo,  setConfirmDemo]  = useState(false);

  if (!open) return null;

  //    EXPORT (lazy-load XLSX - 137KB gzipped, 415KB raw)
  const handleExport = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Transakcje
    const txRows = transactions.map(t => ({
      ID:          t.id,
      Data:        t.date,
      Opis:        t.desc,
      Kwota:       t.amount,
      Kategoria:   t.cat,
      Konto_ID:    t.acc,
      Konto_Nazwa: (accounts.find(a => a.id === t.acc) || {}).name || "",
    }));
    const wsTx = XLSX.utils.json_to_sheet(txRows);
    wsTx["!cols"] = [
      {wch:8},{wch:12},{wch:34},{wch:12},{wch:14},{wch:10},{wch:20}
    ];
    XLSX.utils.book_append_sheet(wb, wsTx, "Transakcje");

    // Sheet 2: Konta
    const accRows = accounts.map(a => ({
      ID:    a.id,
      Nazwa: a.name,
      Typ:   a.type,
      Bank:  a.bank,
      Saldo: a.balance,
      IBAN:  a.iban,
    }));
    const wsAcc = XLSX.utils.json_to_sheet(accRows);
    wsAcc["!cols"] = [{wch:6},{wch:22},{wch:12},{wch:14},{wch:14},{wch:32}];
    XLSX.utils.book_append_sheet(wb, wsAcc, "Konta");

    // Sheet 3: Bud ety
    const budRows = budgets.map(b => ({
      Kategoria: b.cat,
      Limit_PLN: b.limit,
    }));
    const wsBud = XLSX.utils.json_to_sheet(budRows);
    wsBud["!cols"] = [{wch:16},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsBud, "Budżety");

    // Sheet 4: P atno ci
    const billRows = payments.map(b => ({
      ID:           b.id,
      Nazwa:        b.name,
      Typ:          b.type || "bill",
      Kwota:        b.amount,
      Termin:       b.dueDay || "",
      Częstotliwość:b.freq || "monthly",
      Kategoria:    b.cat,
      Konto_ID:     b.acc,
    }));
    const wsBill = XLSX.utils.json_to_sheet(billRows);
    wsBill["!cols"] = [{wch:8},{wch:24},{wch:14},{wch:12},{wch:8},{wch:14},{wch:14},{wch:10}];
    XLSX.utils.book_append_sheet(wb, wsBill, "Płatności");

    // Sheet 5: Podsumowanie miesi czne
    const months = [...new Set(transactions.map(t => t.date.slice(0,7)))].sort();
    const sumRows = months.map(m => {
      const mTx = transactions.filter(t => t.date.startsWith(m) && t.cat !== "inne");
      const income  = mTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
      const expense = mTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
      return { Miesiąc: m, Przychody: +income.toFixed(2), Wydatki: +expense.toFixed(2), Bilans: +(income-expense).toFixed(2) };
    });
    const wsSum = XLSX.utils.json_to_sheet(sumRows);
    wsSum["!cols"] = [{wch:10},{wch:14},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsSum, "Podsumowanie");

    // Sheet 6: Cele oszcz dno ciowe
    if (goals && goals.length) {
      const goalRows = goals.map(g => ({
        Nazwa: g.name, Cel_PLN: g.target, Odłożone_PLN: g.saved,
        Postęp: g.target > 0 ? `${(g.saved/g.target*100).toFixed(0)}%` : "0%",
        Emoji: g.emoji || "",
      }));
      const wsGoals = XLSX.utils.json_to_sheet(goalRows);
      wsGoals["!cols"] = [{wch:24},{wch:12},{wch:14},{wch:10},{wch:6}];
      XLSX.utils.book_append_sheet(wb, wsGoals, "Cele");
    }

    // Sheet 7: CustomCats
    if (customCats && customCats.length) {
      const wsCats = XLSX.utils.json_to_sheet(customCats.map(c => ({
        ID: c.id, Nazwa: c.label, Grupa: c.group, Kolor: c.color,
      })));
      XLSX.utils.book_append_sheet(wb, wsCats, "Moje kategorie");
    }

    // Sheet 8: Paid status
    const paidRows = Object.entries(paid).map(([key, val]) => ({ Klucz: key, Zaplacono: val ? "tak" : "nie" }));
    if (paidRows.length) {
      const wsPaid = XLSX.utils.json_to_sheet(paidRows);
      XLSX.utils.book_append_sheet(wb, wsPaid, "Status platnosci");
    }

    // Sheet 9: Full JSON backup (all data incl. templates, vacation)
    const templates = (() => { try { return JSON.parse(localStorage.getItem("ft_templates") || "null"); } catch(_) { return null; } })();
    const vacation  = (() => { try { return JSON.parse(localStorage.getItem("ft_vacation")  || "null"); } catch(_) { return null; } })();
    const backupData = {
      v: 1,
      accounts, transactions, budgets, payments, paid, goals,
      customCats, cycleDay, defaultAcc,
      templates, vacation, vacationArchiveData: vacationArchive,
    };
    const wsBackup = XLSX.utils.json_to_sheet([{ JSON_backup: JSON.stringify(backupData) }]);
    wsBackup["!cols"] = [{wch:200}];
    XLSX.utils.book_append_sheet(wb, wsBackup, "_Backup_JSON");

    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `FinTrack_export_${today}.xlsx`);
  };

  //    IMPORT                                                                  
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("loading");
    setImportMsg("Wczytuję plik…");

    // Lazy-load XLSX (137 KB gzipped)
    const XLSX = await import("xlsx");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });

        // ── Priorytet 1: pełny backup JSON (arkusz _Backup_JSON) ─────────
        if (wb.SheetNames.includes("_Backup_JSON")) {
          try {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets["_Backup_JSON"]);
            if (rows.length > 0 && rows[0].JSON_backup) {
              const d = JSON.parse(rows[0].JSON_backup);
              if (d) {
                // Zastosuj wszystkie dane z pełnego backupu
                if (Array.isArray(d.accounts))     setAccounts(d.accounts);
                if (Array.isArray(d.transactions) && d.transactions.length) setTransactions(d.transactions);
                if (Array.isArray(d.budgets))       setBudgets(d.budgets);
                if (Array.isArray(d.payments))      setPayments(d.payments);
                if (d.paid && typeof d.paid === "object") setPaid(d.paid);
                if (Array.isArray(d.goals))         setGoals(d.goals);
                if (Array.isArray(d.customCats))    setCustomCats(d.customCats);
                if (d.cycleDay != null)             setCycleDay(d.cycleDay);
                if (d.defaultAcc != null)           setDefaultAcc(d.defaultAcc);
                if (d.templates) try { localStorage.setItem("ft_templates", JSON.stringify(d.templates)); } catch(_) {}
                if (d.vacation)  try { localStorage.setItem("ft_vacation",  JSON.stringify(d.vacation));  } catch(_) {}
                setImportStatus("ok");
                setImportMsg(
                  `Przywrócono pełny backup: ${(d.transactions||[]).length} transakcji, ` +
                  `${(d.accounts||[]).length} kont, ${(d.payments||[]).length} płatności, ` +
                  `${(d.goals||[]).length} celów`
                );
                return;
              }
            }
          } catch(_) { /* fallback to sheet parsing */ }
        }

        // ── Priorytet 2: parsowanie poszczególnych arkuszy ───────────────
        let imported = { tx: 0, acc: 0, bud: 0, pay: 0 };

        if (wb.SheetNames.includes("Transakcje")) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Transakcje"]);
          const newTx = rows
            .filter(r => r.Data && r.Opis && r.Kwota !== undefined)
            .map((r, i) => ({
              id:     r.ID || Date.now() + i,
              date:   String(r.Data).slice(0, 10),
              desc:   String(r.Opis),
              amount: isFinite(parseFloat(r.Kwota)) ? parseFloat(r.Kwota) : 0,
              cat:    String(r.Kategoria || "inne"),
              acc:    parseInt(r.Konto_ID) || 1,
            }))
            .filter(tx => tx.amount !== 0);  // usuń transakcje z zerową kwotą (były NaN)
          if (newTx.length > 0) { setTransactions(newTx); imported.tx = newTx.length; }
        }

        if (wb.SheetNames.includes("Konta")) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Konta"]);
          const newAcc = rows
            .filter(r => r.Nazwa && r.Saldo !== undefined)
            .map((r, i) => ({
              id:      parseInt(r.ID) || (Date.now() + i),
              name:    String(r.Nazwa),
              type:    String(r.Typ || "checking"),
              bank:    String(r.Bank || ""),
              balance: isFinite(parseFloat(r.Saldo)) ? parseFloat(r.Saldo) : 0,
              color:   r.Kolor || "#3b82f6",
              iban:    String(r.IBAN || ""),
            }));
          if (newAcc.length > 0) { setAccounts(newAcc); imported.acc = newAcc.length; }
        }

        if (wb.SheetNames.includes("Budżety")) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Budżety"]);
          const newBud = rows
            .filter(r => r.Kategoria && r.Limit_PLN !== undefined)
            .map(r => ({ cat: String(r.Kategoria), limit: isFinite(parseFloat(r.Limit_PLN)) ? parseFloat(r.Limit_PLN) : 0, color: "#3b82f6" }));
          if (newBud.length > 0) { setBudgets(newBud); imported.bud = newBud.length; }
        }

        // ── Płatności (wcześniej pomijane!) ───────────────────────────────
        if (wb.SheetNames.includes("Płatności")) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Płatności"]);
          const newPay = rows
            .filter(r => r.Nazwa && r.Kwota !== undefined)
            .map(r => ({
              id:       parseInt(r.ID) || Date.now() + Math.random(),
              name:     String(r.Nazwa),
              type:     String(r.Typ || "bill"),
              amount:   parseFloat(r.Kwota),
              dueDay:   parseInt(r.Termin) || 1,
              freq:     String(r.Częstotliwość || "monthly"),
              cat:      String(r.Kategoria || "rachunki"),
              acc:      parseInt(r.Konto_ID) || 1,
              color:    "#f59e0b",
              trackPaid: true,
              shared:   false,
            }));
          if (newPay.length > 0) { setPayments(newPay); imported.pay = newPay.length; }
        }

        setImportStatus("ok");
        setImportMsg(
          `Zaimportowano: ${imported.tx} transakcji` +
          (imported.acc ? `, ${imported.acc} kont` : "") +
          (imported.pay ? `, ${imported.pay} płatności` : "") +
          (imported.bud ? `, ${imported.bud} budżetów` : "")
        );
      } catch (err) {
        console.error("Import error:", err);
        setImportStatus("err");
        setImportMsg("Błąd wczytywania pliku. Upewnij się, że to plik .xlsx z FinTrack.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // reset input
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("loading");
    setImportMsg("Wczytuję CSV…");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        // Helper: konwertuj datę do YYYY-MM-DD
        const parseDate = (raw) => {
          if (!raw) return '';
          const s = String(raw).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
          if (/^\d{2}[.-]\d{2}[.-]\d{4}/.test(s)) {
            const p = s.split(/[.-]/);
            return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
          }
          return s.slice(0,10);
        };
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error("Pusty plik");

        // Auto-detect bank format from header
        const header = lines[0].replace(/^\uFEFF/, '').toLowerCase().trim();
        let imported = 0;
        const newTx = [];

        // PKO BP format: "Data operacji";"Opis operacji";"Rachunek";"Kategoria";"Kwota";"Saldo"
        // Oczyść BOM i whitespace z nagłówka
        const cleanHeader = lines[0].replace(/^\uFEFF/, '').toLowerCase().trim();
        if (cleanHeader.includes("data operacji") || (cleanHeader.includes("data księgowania") && !cleanHeader.includes("tytuł"))) {
          lines.slice(1).forEach((line, i) => {
            const cols = line.split(";").map(c => c.replace(/"/g, "").trim());
            const date = parseDate(cols[0]);
            const desc = cols[1] || cols[2] || "Import PKO";
            const amt  = parseFloat((cols[4] || cols[3] || "0").replace(",", ".").replace(/\s/g, ""));
            if (!date || isNaN(amt)) return;
            const detectCat = (desc, amt) => {
              const d = desc.toLowerCase();
              if (amt > 0) {
                if (d.includes("salary") || d.includes("wynagrodzenie") || d.includes("premia")) return "wynagrodzenie";
                return "inne";
              }
              // Zakłady / bukmacher
              if (d.includes("superbet") || d.includes("sts") || d.includes("fortuna") || d.includes("betclic") || d.includes("bukmacher") || d.includes("zakłady") || d.includes("totolotek") || d.includes("lotto")) return "bukmacher";
              // Jedzenie
              if (d.includes("biedronka") || d.includes("lidl") || d.includes("aldi") || d.includes("kaufland") || d.includes("żabka") || d.includes("zabka") || d.includes("sklep") || d.includes("spożyw") || d.includes("grocery") || d.includes("market")) return "jedzenie";
              // Restauracje
              if (d.includes("restaur") || d.includes("bistro") || d.includes("kebab") || d.includes("pizza") || d.includes("mcdo") || d.includes("mcdonald") || d.includes("kfc") || d.includes("burger") || d.includes("sushi") || d.includes("delivery") || d.includes("wolt") || d.includes("glovo") || d.includes("pyszne")) return "jedzenie";
              // Transport
              if (d.includes("orlen") || d.includes("shell") || d.includes("paliwo") || d.includes("lotos") || d.includes("circle k") || d.includes("petrol") || d.includes("fuel")) return "transport";
              if (d.includes("uber") || d.includes("bolt") || d.includes("pkp") || d.includes("mzk") || d.includes("ztm") || d.includes("bilet") || d.includes("taxi") || d.includes("parking")) return "transport";
              // Rozrywka/subskrypcje
              if (d.includes("netflix") || d.includes("spotify") || d.includes("hbo") || d.includes("disney") || d.includes("youtube") || d.includes("apple") || d.includes("steam") || d.includes("gaming") || d.includes("cinema") || d.includes("kino")) return "rozrywka";
              // Zakupy
              if (d.includes("allegro") || d.includes("amazon") || d.includes("zalando") || d.includes("empik") || d.includes("ikea") || d.includes("decathlon") || d.includes("media markt") || d.includes("rtv euro")) return "zakupy";
              // Zdrowie
              if (d.includes("apteka") || d.includes("pharmacy") || d.includes("lekarz") || d.includes("szpital") || d.includes("clinic") || d.includes("dentysta") || d.includes("medical")) return "zdrowie";
              // Rachunki
              if (d.includes("prąd") || d.includes("prad") || d.includes("gaz") || d.includes("czynsz") || d.includes("rent") || d.includes("woda") || d.includes("internet") || d.includes("telefon") || d.includes("orange") || d.includes("play") || d.includes("t-mobile") || d.includes("plus ")) return "rachunki";
              // Kawiarnia
              if (d.includes("kawa") || d.includes("coffee") || d.includes("starbucks") || d.includes("cafe") || d.includes("costa")) return "kawiarnia";
              // Transfery wewnętrzne - nie wchodzą w analizę
              if (d.includes("depositing savings") || d.includes("saving") || d.includes("transfer") || d.includes("przelew wewnętrzny") || d.includes("top-up")) return "inne";
              // Inwestycje
              if (d.includes("xtb") || d.includes("invest") || d.includes("stock") || d.includes("etf") || d.includes("dividend")) return "inwestycje";
              return "inne";
            };
            newTx.push({ id: Date.now() + i, date, desc, amount: amt, cat: detectCat(desc, amt), acc: 1 });
          });
        }
        // mBank format: "Data operacji";"Data księgowania";"Opis operacji";"Tytuł";"Nadawca/Odbiorca";"Konto";"Kwota";"Saldo po operacji"
        else if (header.includes("tytuł") || header.includes("nadawca")) {
          lines.slice(1).forEach((line, i) => {
            const cols = line.split(";").map(c => c.replace(/"/g, "").trim());
            const date = parseDate(cols[0]);
            const desc = cols[3] || cols[2] || "Import mBank";
            const amt  = parseFloat((cols[6] || "0").replace(",", ".").replace(/\s/g, ""));
            if (!date || isNaN(amt)) return;
            const detectCat = (desc, amt) => {
              const d = desc.toLowerCase();
              if (amt > 0) {
                if (d.includes("salary") || d.includes("wynagrodzenie") || d.includes("premia")) return "wynagrodzenie";
                return "inne";
              }
              // Zakłady / bukmacher
              if (d.includes("superbet") || d.includes("sts") || d.includes("fortuna") || d.includes("betclic") || d.includes("bukmacher") || d.includes("zakłady") || d.includes("totolotek") || d.includes("lotto")) return "bukmacher";
              // Jedzenie
              if (d.includes("biedronka") || d.includes("lidl") || d.includes("aldi") || d.includes("kaufland") || d.includes("żabka") || d.includes("zabka") || d.includes("sklep") || d.includes("spożyw") || d.includes("grocery") || d.includes("market")) return "jedzenie";
              // Restauracje
              if (d.includes("restaur") || d.includes("bistro") || d.includes("kebab") || d.includes("pizza") || d.includes("mcdo") || d.includes("mcdonald") || d.includes("kfc") || d.includes("burger") || d.includes("sushi") || d.includes("delivery") || d.includes("wolt") || d.includes("glovo") || d.includes("pyszne")) return "jedzenie";
              // Transport
              if (d.includes("orlen") || d.includes("shell") || d.includes("paliwo") || d.includes("lotos") || d.includes("circle k") || d.includes("petrol") || d.includes("fuel")) return "transport";
              if (d.includes("uber") || d.includes("bolt") || d.includes("pkp") || d.includes("mzk") || d.includes("ztm") || d.includes("bilet") || d.includes("taxi") || d.includes("parking")) return "transport";
              // Rozrywka/subskrypcje
              if (d.includes("netflix") || d.includes("spotify") || d.includes("hbo") || d.includes("disney") || d.includes("youtube") || d.includes("apple") || d.includes("steam") || d.includes("gaming") || d.includes("cinema") || d.includes("kino")) return "rozrywka";
              // Zakupy
              if (d.includes("allegro") || d.includes("amazon") || d.includes("zalando") || d.includes("empik") || d.includes("ikea") || d.includes("decathlon") || d.includes("media markt") || d.includes("rtv euro")) return "zakupy";
              // Zdrowie
              if (d.includes("apteka") || d.includes("pharmacy") || d.includes("lekarz") || d.includes("szpital") || d.includes("clinic") || d.includes("dentysta") || d.includes("medical")) return "zdrowie";
              // Rachunki
              if (d.includes("prąd") || d.includes("prad") || d.includes("gaz") || d.includes("czynsz") || d.includes("rent") || d.includes("woda") || d.includes("internet") || d.includes("telefon") || d.includes("orange") || d.includes("play") || d.includes("t-mobile") || d.includes("plus ")) return "rachunki";
              // Kawiarnia
              if (d.includes("kawa") || d.includes("coffee") || d.includes("starbucks") || d.includes("cafe") || d.includes("costa")) return "kawiarnia";
              // Transfery wewnętrzne - nie wchodzą w analizę
              if (d.includes("depositing savings") || d.includes("saving") || d.includes("transfer") || d.includes("przelew wewnętrzny") || d.includes("top-up")) return "inne";
              // Inwestycje
              if (d.includes("xtb") || d.includes("invest") || d.includes("stock") || d.includes("etf") || d.includes("dividend")) return "inwestycje";
              return "inne";
            };
            newTx.push({ id: Date.now() + i, date, desc, amount: amt, cat: detectCat(desc, amt), acc: 1 });
          });
        }
        // ING format: "Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji";"Saldo po transakcji"
        else if (header.includes("dane kontrahenta") || header.includes("nr transakcji")) {
          lines.slice(1).forEach((line, i) => {
            const cols = line.split(";").map(c => c.replace(/"/g, "").trim());
            const date = parseDate(cols[0]);
            const desc = cols[2] || cols[3] || "Import ING";
            const amt  = parseFloat((cols[8] || "0").replace(",", ".").replace(/\s/g, ""));
            if (!date || isNaN(amt)) return;
            const detectCat = (desc, amt) => {
              const d = desc.toLowerCase();
              if (amt > 0) {
                if (d.includes("salary") || d.includes("wynagrodzenie") || d.includes("premia")) return "wynagrodzenie";
                return "inne";
              }
              // Zakłady / bukmacher
              if (d.includes("superbet") || d.includes("sts") || d.includes("fortuna") || d.includes("betclic") || d.includes("bukmacher") || d.includes("zakłady") || d.includes("totolotek") || d.includes("lotto")) return "bukmacher";
              // Jedzenie
              if (d.includes("biedronka") || d.includes("lidl") || d.includes("aldi") || d.includes("kaufland") || d.includes("żabka") || d.includes("zabka") || d.includes("sklep") || d.includes("spożyw") || d.includes("grocery") || d.includes("market")) return "jedzenie";
              // Restauracje
              if (d.includes("restaur") || d.includes("bistro") || d.includes("kebab") || d.includes("pizza") || d.includes("mcdo") || d.includes("mcdonald") || d.includes("kfc") || d.includes("burger") || d.includes("sushi") || d.includes("delivery") || d.includes("wolt") || d.includes("glovo") || d.includes("pyszne")) return "jedzenie";
              // Transport
              if (d.includes("orlen") || d.includes("shell") || d.includes("paliwo") || d.includes("lotos") || d.includes("circle k") || d.includes("petrol") || d.includes("fuel")) return "transport";
              if (d.includes("uber") || d.includes("bolt") || d.includes("pkp") || d.includes("mzk") || d.includes("ztm") || d.includes("bilet") || d.includes("taxi") || d.includes("parking")) return "transport";
              // Rozrywka/subskrypcje
              if (d.includes("netflix") || d.includes("spotify") || d.includes("hbo") || d.includes("disney") || d.includes("youtube") || d.includes("apple") || d.includes("steam") || d.includes("gaming") || d.includes("cinema") || d.includes("kino")) return "rozrywka";
              // Zakupy
              if (d.includes("allegro") || d.includes("amazon") || d.includes("zalando") || d.includes("empik") || d.includes("ikea") || d.includes("decathlon") || d.includes("media markt") || d.includes("rtv euro")) return "zakupy";
              // Zdrowie
              if (d.includes("apteka") || d.includes("pharmacy") || d.includes("lekarz") || d.includes("szpital") || d.includes("clinic") || d.includes("dentysta") || d.includes("medical")) return "zdrowie";
              // Rachunki
              if (d.includes("prąd") || d.includes("prad") || d.includes("gaz") || d.includes("czynsz") || d.includes("rent") || d.includes("woda") || d.includes("internet") || d.includes("telefon") || d.includes("orange") || d.includes("play") || d.includes("t-mobile") || d.includes("plus ")) return "rachunki";
              // Kawiarnia
              if (d.includes("kawa") || d.includes("coffee") || d.includes("starbucks") || d.includes("cafe") || d.includes("costa")) return "kawiarnia";
              // Transfery wewnętrzne - nie wchodzą w analizę
              if (d.includes("depositing savings") || d.includes("saving") || d.includes("transfer") || d.includes("przelew wewnętrzny") || d.includes("top-up")) return "inne";
              // Inwestycje
              if (d.includes("xtb") || d.includes("invest") || d.includes("stock") || d.includes("etf") || d.includes("dividend")) return "inwestycje";
              return "inne";
            };
            newTx.push({ id: Date.now() + i, date, desc, amount: amt, cat: detectCat(desc, amt), acc: 1 });
          });
        }
        // Revolut format: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
        else if (header.includes("started date") || header.includes("completed date") || header.includes("data rozpoczęcia") || header.includes("data rozp") || (header.includes("revolut") && (header.includes("amount") || header.includes("kwota")))) {
          lines.slice(1).forEach((line, i) => {
            // Rozdziel CSV z uwzględnieniem przecinków w cudzysłowach
            const cols = line.split(",").map(c => c.replace(/"/g, "").trim());
            // Data: col[2] = Data rozpoczęcia, col[3] = Data zakończenia
            const date = parseDate(cols[2] || cols[3]);
            // Opis: col[4]
            const desc = cols[4] || "Import Revolut";
            // Kwota: col[5], Waluta: col[7]
            let amt = parseFloat((cols[5] || "0").replace(",", ".").replace(/\s/g, ""));
            const currency = (cols[7] || "PLN").trim();
            const txType = (cols[0] || "").toUpperCase();
            const state = (cols[8] || "").toUpperCase();
            // Pomiń transakcje anulowane/oczekujące
            if (state === "FAILED" || state === "REVERTED" || state === "PENDING") return;
            // Revolut daje kwoty z odpowiednim znakiem (-/+)
            // Jeśli brak znaku i typ to płatność - ustaw ujemne
            if (!isNaN(amt) && amt > 0 && 
                (txType.includes("CARD") || txType.includes("PAYMENT") || 
                 txType.includes("PLATNOSC") || txType.includes("PŁATNOŚĆ"))) {
              amt = -Math.abs(amt);
            }
            if (!date || isNaN(amt) || amt === 0) return;
            const detectCat = (desc, amt) => {
              const d = desc.toLowerCase();
              if (amt > 0) {
                if (d.includes("salary") || d.includes("wynagrodzenie") || d.includes("premia")) return "wynagrodzenie";
                return "inne";
              }
              // Zakłady / bukmacher
              if (d.includes("superbet") || d.includes("sts") || d.includes("fortuna") || d.includes("betclic") || d.includes("bukmacher") || d.includes("zakłady") || d.includes("totolotek") || d.includes("lotto")) return "bukmacher";
              // Jedzenie
              if (d.includes("biedronka") || d.includes("lidl") || d.includes("aldi") || d.includes("kaufland") || d.includes("żabka") || d.includes("zabka") || d.includes("sklep") || d.includes("spożyw") || d.includes("grocery") || d.includes("market")) return "jedzenie";
              // Restauracje
              if (d.includes("restaur") || d.includes("bistro") || d.includes("kebab") || d.includes("pizza") || d.includes("mcdo") || d.includes("mcdonald") || d.includes("kfc") || d.includes("burger") || d.includes("sushi") || d.includes("delivery") || d.includes("wolt") || d.includes("glovo") || d.includes("pyszne")) return "jedzenie";
              // Transport
              if (d.includes("orlen") || d.includes("shell") || d.includes("paliwo") || d.includes("lotos") || d.includes("circle k") || d.includes("petrol") || d.includes("fuel")) return "transport";
              if (d.includes("uber") || d.includes("bolt") || d.includes("pkp") || d.includes("mzk") || d.includes("ztm") || d.includes("bilet") || d.includes("taxi") || d.includes("parking")) return "transport";
              // Rozrywka/subskrypcje
              if (d.includes("netflix") || d.includes("spotify") || d.includes("hbo") || d.includes("disney") || d.includes("youtube") || d.includes("apple") || d.includes("steam") || d.includes("gaming") || d.includes("cinema") || d.includes("kino")) return "rozrywka";
              // Zakupy
              if (d.includes("allegro") || d.includes("amazon") || d.includes("zalando") || d.includes("empik") || d.includes("ikea") || d.includes("decathlon") || d.includes("media markt") || d.includes("rtv euro")) return "zakupy";
              // Zdrowie
              if (d.includes("apteka") || d.includes("pharmacy") || d.includes("lekarz") || d.includes("szpital") || d.includes("clinic") || d.includes("dentysta") || d.includes("medical")) return "zdrowie";
              // Rachunki
              if (d.includes("prąd") || d.includes("prad") || d.includes("gaz") || d.includes("czynsz") || d.includes("rent") || d.includes("woda") || d.includes("internet") || d.includes("telefon") || d.includes("orange") || d.includes("play") || d.includes("t-mobile") || d.includes("plus ")) return "rachunki";
              // Kawiarnia
              if (d.includes("kawa") || d.includes("coffee") || d.includes("starbucks") || d.includes("cafe") || d.includes("costa")) return "kawiarnia";
              // Transfery wewnętrzne - nie wchodzą w analizę
              if (d.includes("depositing savings") || d.includes("saving") || d.includes("transfer") || d.includes("przelew wewnętrzny") || d.includes("top-up")) return "inne";
              // Inwestycje
              if (d.includes("xtb") || d.includes("invest") || d.includes("stock") || d.includes("etf") || d.includes("dividend")) return "inwestycje";
              return "inne";
            };
            newTx.push({ id: Date.now() + i, date, desc, amount: amt, cat: detectCat(desc, amt), acc: 1 });
          });
        }
        else {
          // Generic CSV — try to detect date, desc, amount columns
          lines.slice(1).forEach((line, i) => {
            const sep = line.includes(";") ? ";" : ",";
            const cols = line.split(sep).map(c => c.replace(/"/g, "").trim());
            const date = parseDate(cols.find(c => /^\d{4}-\d{2}-\d{2}/.test(c) || /^\d{2}[.-]\d{2}[.-]\d{4}/.test(c)));
            const amtStr = cols.find(c => /^-?\d+[.,]\d{2}$/.test(c.replace(/\s/g, "")));
            if (!date || !amtStr) return;
            const amt = parseFloat(amtStr.replace(",", ".").replace(/\s/g, ""));
            const desc = cols.find(c => c.length > 3 && !/^\d/.test(c) && c !== date) || "Import CSV";
            const detectCat = (desc, amt) => {
              const d = desc.toLowerCase();
              if (amt > 0) {
                if (d.includes("salary") || d.includes("wynagrodzenie") || d.includes("premia")) return "wynagrodzenie";
                return "inne";
              }
              // Zakłady / bukmacher
              if (d.includes("superbet") || d.includes("sts") || d.includes("fortuna") || d.includes("betclic") || d.includes("bukmacher") || d.includes("zakłady") || d.includes("totolotek") || d.includes("lotto")) return "bukmacher";
              // Jedzenie
              if (d.includes("biedronka") || d.includes("lidl") || d.includes("aldi") || d.includes("kaufland") || d.includes("żabka") || d.includes("zabka") || d.includes("sklep") || d.includes("spożyw") || d.includes("grocery") || d.includes("market")) return "jedzenie";
              // Restauracje
              if (d.includes("restaur") || d.includes("bistro") || d.includes("kebab") || d.includes("pizza") || d.includes("mcdo") || d.includes("mcdonald") || d.includes("kfc") || d.includes("burger") || d.includes("sushi") || d.includes("delivery") || d.includes("wolt") || d.includes("glovo") || d.includes("pyszne")) return "jedzenie";
              // Transport
              if (d.includes("orlen") || d.includes("shell") || d.includes("paliwo") || d.includes("lotos") || d.includes("circle k") || d.includes("petrol") || d.includes("fuel")) return "transport";
              if (d.includes("uber") || d.includes("bolt") || d.includes("pkp") || d.includes("mzk") || d.includes("ztm") || d.includes("bilet") || d.includes("taxi") || d.includes("parking")) return "transport";
              // Rozrywka/subskrypcje
              if (d.includes("netflix") || d.includes("spotify") || d.includes("hbo") || d.includes("disney") || d.includes("youtube") || d.includes("apple") || d.includes("steam") || d.includes("gaming") || d.includes("cinema") || d.includes("kino")) return "rozrywka";
              // Zakupy
              if (d.includes("allegro") || d.includes("amazon") || d.includes("zalando") || d.includes("empik") || d.includes("ikea") || d.includes("decathlon") || d.includes("media markt") || d.includes("rtv euro")) return "zakupy";
              // Zdrowie
              if (d.includes("apteka") || d.includes("pharmacy") || d.includes("lekarz") || d.includes("szpital") || d.includes("clinic") || d.includes("dentysta") || d.includes("medical")) return "zdrowie";
              // Rachunki
              if (d.includes("prąd") || d.includes("prad") || d.includes("gaz") || d.includes("czynsz") || d.includes("rent") || d.includes("woda") || d.includes("internet") || d.includes("telefon") || d.includes("orange") || d.includes("play") || d.includes("t-mobile") || d.includes("plus ")) return "rachunki";
              // Kawiarnia
              if (d.includes("kawa") || d.includes("coffee") || d.includes("starbucks") || d.includes("cafe") || d.includes("costa")) return "kawiarnia";
              // Transfery wewnętrzne - nie wchodzą w analizę
              if (d.includes("depositing savings") || d.includes("saving") || d.includes("transfer") || d.includes("przelew wewnętrzny") || d.includes("top-up")) return "inne";
              // Inwestycje
              if (d.includes("xtb") || d.includes("invest") || d.includes("stock") || d.includes("etf") || d.includes("dividend")) return "inwestycje";
              return "inne";
            };
            newTx.push({ id: Date.now() + i, date, desc, amount: amt, cat: detectCat(desc, amt), acc: 1 });
          });
        }

        imported = newTx.filter(t => t.date && !isNaN(t.amount)).length;
        if (imported === 0) throw new Error("Nie rozpoznano formatu");

        const validTx = newTx.filter(t => t.date && !isNaN(t.amount));
        setTransactions(prev => {
          const existingIds = new Set(prev.map(t => t.date + t.desc + t.amount));
          const unique = validTx.filter(t => !existingIds.has(t.date + t.desc + t.amount));
          return [...unique, ...prev].sort((a, b) => b.date.localeCompare(a.date));
        });

        setImportStatus("ok");
        setImportMsg(`Zaimportowano ${imported} transakcji z CSV. Sprawdź kategorie w zakładce Transakcje.`);
      } catch (err) {
        setImportStatus("err");
        setImportMsg(`Błąd: ${err.message}. Obsługiwane banki: PKO BP, mBank, ING, Revolut.`);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const Divider = () => (
    <div style={{ height: 1, background: "#1a2744", margin: "18px 0" }}/>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                  letterSpacing: "0.1em", marginBottom: 12 }}>{children}</div>
  );

  return (
    <div
         style={{
           position: "fixed", inset: 0, zIndex: 9999,
           background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
           display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-end",
         }}
         onClick={onClose}>
      <div style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: "20px 20px 0 0",
                    width: "100%",
                    paddingTop: "calc(24px + env(safe-area-inset-top, 0px))",
                    paddingLeft: 20, paddingRight: 20,
                    paddingBottom: "calc(48px + env(safe-area-inset-bottom, 0px))",
                    maxHeight: "100dvh", overflowY: "auto", boxSizing: "border-box" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg,#1e40af,#7c3aed)", borderRadius: 10,
                          padding: 8, display: "flex" }}>
              <Settings size={16} color="white"/>
            </div>
            <span style={{ fontWeight: 800, fontSize: 18 }}>Ustawienia</span>
          </div>
          <button onClick={onClose} style={{ background: "#1a2744", border: "none", borderRadius: 10,
                                             padding: 10, cursor: "pointer", color: "#94a3b8",
                                             minWidth: 40, minHeight: 40,
                                             display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={18}/>
          </button>
        </div>

        {/* PRO Status Card */}
        {(() => {
          const pro = getProStatus();
          if (pro.isPro) {
            return (
              <div style={{
                background: "linear-gradient(135deg,#1e40af 0%,#7c3aed 100%)",
                border: "1px solid #60a5fa",
                borderRadius: 16, padding: "16px 18px",
                marginBottom: 22,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Crown size={14} color="#fbbf24"/>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      FinTrack PRO
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                    {pro.type === "lifetime" && "Dożywotni dostęp · dziękuję za wsparcie!"}
                    {pro.type === "yearly" && pro.expiresAt && `Ważny do ${new Date(pro.expiresAt).toLocaleDateString("pl-PL")}`}
                    {pro.type === "trial" && "Wersja próbna"}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <button onClick={() => { onClose(); setTimeout(() => { if (window.__openUpgrade) window.__openUpgrade("settings"); }, 300); }} style={{
              width: "100%", background: "linear-gradient(135deg,#1e40af,#7c3aed)",
              border: "none", borderRadius: 16, padding: "16px 18px",
              marginBottom: 22, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Crown size={14} color="#fbbf24"/>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                    Upgrade do PRO
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                  99 zł/rok · bez limitów · bez reklam
                </div>
              </div>
              <div style={{ background: "white", color: "#1e40af", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800 }}>
                Kup
              </div>
            </button>
          );
        })()}

        {/* CYCLE SECTION */}
        {/* ── DOMYSLNE KONTO ── */}
        <SectionTitle>💳 Domyślne konto transakcji</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
          Konto wypełniane automatycznie przy dodawaniu transakcji.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {accounts.filter(acc => acc.type === "checking").length === 0 && (
            <div style={{
              padding: "14px 16px",
              background: "#1a1208",
              border: "1px solid #78350f",
              borderRadius: 12,
              fontSize: 12,
              color: "#fbbf24",
              lineHeight: 1.5,
              marginBottom: 8,
            }}>
              Brak konta osobistego. Dodaj konto typu "Rachunek bieżący" w zakładce Portfel.
            </div>
          )}
          {accounts.filter(acc => acc.type === "checking").map(acc => (
            <button key={acc.id} onClick={() => setCycleDay && setDefaultAcc && setDefaultAcc(acc.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: defaultAcc === acc.id ? acc.color + "22" : "#060b14",
              border: "1px solid " + (defaultAcc === acc.id ? acc.color : "#1a2744"),
              borderRadius: 12, cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: acc.color, flexShrink: 0 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{acc.name}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{acc.bank}</div>
              </div>
              {defaultAcc === acc.id && (
                <div style={{ fontSize: 11, color: acc.color, fontWeight: 700 }}>Domyslne</div>
              )}
            </button>
          ))}
        </div>

        <SectionTitle>📅 Cykl rozliczeniowy</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.6 }}>
          Ustaw dzień miesiąca, od którego zaczyna się Twój cykl. Dzień <strong style={{color:"#e2e8f0"}}>1</strong> = standardowy miesiąc kalendarzowy.
          Np. dzień <strong style={{color:"#e2e8f0"}}>25</strong> → cykl "Kwiecień" to 25 mar – 24 kwi.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1, background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>Mój miesiąc zaczyna się</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setCycleDay(d => Math.max(1, d - 1))}
                style={{ background: "#1a2744", border: "none", borderRadius: 8, width: 30, height: 30,
                         cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: "#60a5fa", minWidth: 32, textAlign: "center" }}>{cycleDay}</span>
              <button onClick={() => setCycleDay(d => Math.min(28, d + 1))}
                style={{ background: "#1a2744", border: "none", borderRadius: 8, width: 30, height: 30,
                         cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          {[1, 10, 15, 20, 25, 27].map(d => (
            <button key={d} onClick={() => setCycleDay(d)} style={{
              flex: 1, background: cycleDay === d ? "#1e3a5f" : "#060b14",
              border: `1px solid ${cycleDay === d ? "#2563eb" : "#1a2744"}`,
              borderRadius: 8, padding: "6px 0",
              color: cycleDay === d ? "#60a5fa" : "#475569",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
            }}>{d}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginBottom: 20, textAlign: "center" }}>
          {cycleDay === 1
            ? "Standardowy miesiąc kalendarzowy"
            : `Cykl: ${cycleDay} poprzedniego → ${cycleDay - 1} bieżącego miesiąca`}
        </div>

        <Divider/>

        {/* EXPORT SECTION */}
        <SectionTitle>🏷️ Moje kategorie</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          Dodaj własne kategorie wydatków lub przychodów.
        </p>

        {/* Existing custom cats */}
        {customCats.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {customCats.map(cat => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.label ? cat.label.charAt(0).toUpperCase() + cat.label.slice(1) : cat.label}</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>{cat.type === "income" ? "przychód" : "wydatek"}</span>
                </div>
                <button onClick={() => setCustomCats(c => c.filter(x => x.id !== cat.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new custom cat */}
        <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: "14px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[["expense","Wydatek"],["income","Przychód"]].map(([v,l]) => (
              <button key={v} onClick={() => setNewCatType(v)} style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12,
                fontFamily: "'Space Grotesk', sans-serif",
                background: newCatType === v ? "#1e3a5f" : "transparent",
                border: `1px solid ${newCatType === v ? "#2563eb" : "#1a2744"}`,
                color: newCatType === v ? "#60a5fa" : "#475569",
              }}>{l}</button>
            ))}
          </div>
          <input
            value={newCatLabel}
            onChange={e => setNewCatLabel(e.target.value)}
            placeholder="Nazwa kategorii (np. Siłownia)"
            style={{ width: "100%", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8,
              padding: "10px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "'Space Grotesk', sans-serif",
              outline: "none", marginBottom: 10, WebkitAppearance: "none" }}
          />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Kolor</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899","#f97316","#14b8a6","#a855f7","#84cc16","#f43f5e"].map(c => (
                <div key={c} onClick={() => setNewCatColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                    border: newCatColor === c ? "2px solid white" : "2px solid transparent" }}/>
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              if (!newCatLabel.trim()) return;
              const id = newCatLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_ąćęłńóśźż]/gi, "");
              if (CATEGORIES.find(c => c.id === id)) { alert("Kategoria o tej nazwie już istnieje"); return; }
              const capLabel = newCatLabel.trim().charAt(0).toUpperCase() + newCatLabel.trim().slice(1);
              setCustomCats(c => [...c, {
                id, label: capLabel,
                iconName: "Wallet", color: newCatColor,
                type: newCatType, custom: true,
                group: newCatType === "income" ? "income" : "lifestyle",
              }]);
              setNewCatLabel("");
            }}
            style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none",
              borderRadius: 10, padding: "11px 0", color: "white", fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
            + Dodaj kategorię
          </button>
        </div>

        <Divider/>

        {/* Język / Language */}
        <SectionTitle>📤 Eksport danych</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.6 }}>
          Pobierz wszystkie swoje dane jako plik Excel (.xlsx) z 7 arkuszami:
          Transakcje, Konta, Budżety, Płatności, Podsumowanie, Cele + pełny backup JSON.
        </p>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Transakcji",  val: transactions.length, color: "#3b82f6" },
            { label: "Kont",        val: accounts.length,     color: "#10b981" },
            { label: "Budżetów",    val: budgets.length,      color: "#8b5cf6" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#060b14", border: "1px solid #1a2744",
                                       borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 600,
                             color }}>{val}</div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600,
                             textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        <button onClick={handleExport} style={{
          width: "100%", background: "linear-gradient(135deg,#1e3a5f,#1e40af)",
          border: "1px solid #2563eb66", borderRadius: 12, padding: "14px 0",
          color: "#93c5fd", fontWeight: 700, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>⬇</span> Eksportuj do Excel (.xlsx)
        </button>

        <div style={{ height: 10 }}/>
        <button onClick={() => {
          const monthNames = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
          const cats = {};
          transactions.filter(t => t.date.startsWith(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`) && t.amount < 0 && t.cat !== "inne")
            .forEach(t => { cats[t.cat] = (cats[t.cat]||0) + Math.abs(t.amount); });
          const income = transactions.filter(t => t.date.startsWith(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`) && t.amount > 0 && t.cat !== "inne").reduce((s,t) => s+t.amount,0);
          const expense = Object.values(cats).reduce((s,v) => s+v, 0);
          const rows = Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([cat,val]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #eee">${cat}</td><td style="padding:4px 12px;text-align:right;border-bottom:1px solid #eee">${val.toLocaleString("pl-PL",{minimumFractionDigits:2})} zł</td></tr>`).join("");
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FinTrack – ${new Date().toLocaleDateString("pl-PL",{month:"long",year:"numeric"})}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:600px;margin:0 auto}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;color:#555;font-weight:400;margin-bottom:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:6px 12px;background:#f5f5f5;font-size:13px}td{font-size:13px}.summary{display:flex;gap:32px;margin-bottom:24px}.box{background:#f9f9f9;padding:12px 20px;border-radius:8px}.label{font-size:11px;color:#888;text-transform:uppercase}.val{font-size:20px;font-weight:700;margin-top:4px}.green{color:#16a34a}.red{color:#dc2626}</style></head><body><h1>FinTrack — Raport miesięczny</h1><h2>${new Date().toLocaleDateString("pl-PL",{month:"long",year:"numeric"})}</h2><div class="summary"><div class="box"><div class="label">Przychody</div><div class="val green">${income.toLocaleString("pl-PL",{minimumFractionDigits:2})} zł</div></div><div class="box"><div class="label">Wydatki</div><div class="val red">${expense.toLocaleString("pl-PL",{minimumFractionDigits:2})} zł</div></div><div class="box"><div class="label">Bilans</div><div class="val ${income-expense>=0?"green":"red"}">${(income-expense).toLocaleString("pl-PL",{minimumFractionDigits:2})} zł</div></div></div><table><thead><tr><th>Kategoria</th><th style="text-align:right">Kwota</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:24px;font-size:11px;color:#aaa">Wygenerowano: ${new Date().toLocaleDateString("pl-PL")} · FinTrack PRO</p></body></html>`;
          const w = window.open("","_blank"); w.document.write(html); w.document.close(); w.print();
        }} style={{
          width: "100%", background: "#060b14", border: "1px solid #1a2744",
          borderRadius: 12, padding: "12px 0", color: "#94a3b8",
          fontWeight: 700, fontSize: 14, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🖨</span> Drukuj / Zapisz PDF
        </button>

        <Divider/>

        {/* IMPORT SECTION */}
        <SectionTitle>📥 Import danych</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 6, lineHeight: 1.6 }}>
          Wczytaj plik .xlsx wcześniej wyeksportowany z FinTrack. Dane zostaną
          <span style={{ color: "#f59e0b", fontWeight: 700 }}> zastąpione</span> — zrób
          eksport przed importem jeśli chcesz zachować kopię.
        </p>

        {/* Column legend */}
        <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 10,
                      padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Wymagane kolumny (arkusz Transakcje)
          </div>
          {[
            ["Data",      "RRRR-MM-DD",  "#3b82f6"],
            ["Opis",      "tekst",       "#10b981"],
            ["Kwota",     "+/- liczba",  "#f59e0b"],
            ["Kategoria", "np. jedzenie","#8b5cf6"],
            ["Konto_ID",  "1, 2, 3…",   "#06b6d4"],
          ].map(([col, hint, color]) => (
            <div key={col} style={{ display: "flex", justifyContent: "space-between",
                                    padding: "3px 0", borderBottom: "1px solid #0f1a2e" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
                             color, fontWeight: 600 }}>{col}</span>
              <span style={{ fontSize: 11, color: "#475569" }}>{hint}</span>
            </div>
          ))}
        </div>

        {/* File input styled */}
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", background: "#060b14", border: "2px dashed #1e3a5f",
          borderRadius: 12, padding: "16px 0", cursor: "pointer",
          color: "#60a5fa", fontWeight: 700, fontSize: 14,
          fontFamily: "'Space Grotesk', sans-serif",
          transition: "border-color 0.2s",
        }}>
          <span style={{ fontSize: 20 }}>📂</span> Wybierz plik .xlsx (FinTrack backup)
          <input type="file" accept=".xlsx,.xls" onChange={handleImport}
                 style={{ display: "none" }}/>
        </label>

        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: "#060b14", border: "2px dashed #14532d",
          borderRadius: 12, padding: "14px 0", cursor: "pointer",
          color: "#10b981", fontWeight: 700, fontSize: 13,
          fontFamily: "'Space Grotesk', sans-serif", marginTop: 8,
        }}>
          <span style={{ fontSize: 18 }}>🏦</span> Import wyciągu CSV (PKO BP / mBank / ING / Revolut)
          <input type="file" accept=".csv,.txt" onChange={handleImportCSV}
                 style={{ display: "none" }}/>
        </label>

        {/* Import status */}
        {importStatus && (
          <div style={{
            marginTop: 12, borderRadius: 10, padding: "12px 14px",
            background: importStatus === "ok"      ? "#052e16"
                      : importStatus === "err"     ? "#1a0808"
                      : "#0d1628",
            border: `1px solid ${importStatus === "ok" ? "#14532d" : importStatus === "err" ? "#7f1d1d" : "#1a2744"}`,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>
              {importStatus === "ok" ? "✅" : importStatus === "err" ? "❌" : "⏳"}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600,
                            color: importStatus === "ok" ? "#86efac" : importStatus === "err" ? "#fca5a5" : "#94a3b8" }}>
                {importStatus === "ok" ? "Import zakończony!" : importStatus === "err" ? "Błąd importu" : "Wczytuję…"}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{importMsg}</div>
            </div>
          </div>
        )}

        <Divider/>

        {/* Notifications */}
        <SectionTitle>🔔 Przypomnienia</SectionTitle>
        <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>🔔 Automatyczne pop-upy</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
            Gdy otworzysz aplikację, automatycznie pojawi się żółty banner z listą płatności
            które są <strong style={{color:"#fcd34d"}}>dziś</strong>, <strong style={{color:"#fcd34d"}}>jutro</strong> lub <strong style={{color:"#fcd34d"}}>za 3 dni</strong>.
            Działa bez żadnych uprawnień — tylko zamknij banner klikając ×.
          </div>
        </div>

        <Divider/>

        {/* Custom categories */}
        {/* ── SZABLONY TRANSAKCJI ── */}
        <SectionTitle>⚡ Szablony transakcji</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          Szybkie dodawanie — widoczne nad listą transakcji.
        </p>
        <TemplatesEditor/>

        <SectionTitle>🌍 Język / Language</SectionTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["pl", "🇵🇱 Polski"], ["en", "🇬🇧 English"]].map(([code, label]) => (
            <button key={code} onClick={() => setLang(code)} style={{
              flex: 1, padding: "12px 0", borderRadius: 12, cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
              background: getLang() === code ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#0d1628",
              border: getLang() === code ? "1px solid #2563eb" : "1px solid #1e3a5f66",
              color: getLang() === code ? "white" : "#94a3b8",
            }}>{label}</button>
          ))}
        </div>
        <Divider/>

        {/* PIN Lock */}
        <SectionTitle>🔒 Bezpieczeństwo</SectionTitle>
        <PinSettings/>
        <Divider/>

        <SectionTitle>👫 Nazwa partnera / partnerki</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
          Wyświetlana w module wspólnych rachunków.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
          <input
            value={partnerName}
            onChange={e => setPartnerName && setPartnerName(e.target.value)}
            placeholder="np. Anna, Marek, Partner…"
            maxLength={30}
            style={{
              flex: 1, background: "#0a1120", border: "1px solid #1a2744",
              borderRadius: 10, padding: "10px 14px", color: "#e2e8f0",
              fontSize: 16, fontFamily: "inherit",
            }}
          />
        </div>

        {/* Data reset */}
        <Divider/>
        <SectionTitle>️ Resetowanie danych</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          Załaduj przykładowe dane żeby zobaczyć jak apka wygląda w pełni, lub zresetuj wszystko do czystego stanu.
        </p>
        <button
          onClick={() => setConfirmDemo(true)}
          style={{
            width: "100%", background: "#0a1e12", border: "1px solid #16a34a44",
            borderRadius: 12, padding: "12px 0", color: "#10b981",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10,
          }}>
          🎬 Załaduj dane demo
        </button>
        <button
          onClick={() => setConfirmClear(true)}
          style={{
            width: "100%", background: "#1a0808", border: "1px solid #7f1d1d44",
            borderRadius: 12, padding: "12px 0", color: "#ef4444",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
          🗑 Wyczyść wszystkie dane
        </button>

      </div>

      {/* Confirm: wyczyść dane */}
      {confirmClear && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ background: "#0a1120", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, fontFamily: "'Space Grotesk', sans-serif" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", textAlign: "center", marginBottom: 8 }}>Wyczyścić wszystkie dane?</div>
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
              Tej operacji nie można cofnąć. Wszystkie transakcje, konta, cele i płatności zostaną usunięte.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmClear(false)} style={{ flex: 1, background: "#0d1628", border: "1px solid #1a2744", borderRadius: 12, padding: "12px 0", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                Anuluj
              </button>
              <button onClick={() => {
                if (typeof onClearData === "function") onClearData();
                setConfirmClear(false);
                onClose();
              }} style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 12, padding: "12px 0", color: "#fca5a5", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                Usuń wszystko
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linki prawne */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, padding: "16px 0 4px" }}>
        <a href="/FinTrack-PRO/privacy.html" target="_blank" rel="noopener"
          style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Grotesk', sans-serif",
            textDecoration: "none", borderBottom: "1px solid #1a2744", paddingBottom: 1 }}>
          Polityka prywatności
        </a>
        <a href="/FinTrack-PRO/terms.html" target="_blank" rel="noopener"
          style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Grotesk', sans-serif",
            textDecoration: "none", borderBottom: "1px solid #1a2744", paddingBottom: 1 }}>
          Regulamin
        </a>
      </div>

      {/* Wersja apki */}
      <div style={{ textAlign: "center", padding: "4px 0 4px",
        fontSize: 11, color: "#1e2d45", fontFamily: "'DM Mono', sans-serif" }}>
        FinTrack PRO · v1.1.0 · 2025–{new Date().getFullYear()}
      </div>

      {/* Confirm: załaduj demo */}
      {confirmDemo && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ background: "#0a1120", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, fontFamily: "'Space Grotesk', sans-serif" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", textAlign: "center", marginBottom: 8 }}>Załadować dane demo?</div>
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
              Twoje obecne dane zostaną zastąpione przykładowymi transakcjami i płatnościami.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDemo(false)} style={{ flex: 1, background: "#0d1628", border: "1px solid #1a2744", borderRadius: 12, padding: "12px 0", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                Anuluj
              </button>
              <button onClick={() => {
                if (typeof onLoadDemo === "function") onLoadDemo();
                setConfirmDemo(false);
                onClose();
              }} style={{ flex: 1, background: "linear-gradient(135deg,#052e16,#14532d)", border: "1px solid #16a34a44", borderRadius: 12, padding: "12px 0", color: "#10b981", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                Załaduj demo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};



export { SettingsPanel };
