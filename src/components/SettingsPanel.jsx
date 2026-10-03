import { useState } from "react";
import {
  Wallet, X, Settings, Edit2, Trash2
} from "lucide-react";
import { Card } from "./ui/Card.jsx";
import { CATEGORIES } from "../constants.js";
import { todayLocal, fmtCurrency } from "../utils.js";
import { PinSettings } from "./PinLock.jsx";
import { positionValues } from "../lib/accountTypes.js";
import { getLang, setLang, t, getLocale, LANGUAGES } from "../i18n.js";
import { getProStatus } from "../lib/tier.js";
import { useBackHandler } from "../lib/backButton.js";
import { isNative, sitePage, linkProps, shareFile } from "../lib/native.js";
import { Crown } from "lucide-react";
import { getCurrentRates, refreshRates, getDisplayCurrency, setDisplayCurrency, SUPPORTED_CURRENCIES } from "../lib/fx.js";

const currencyName = (code) => {
  try { return new Intl.DisplayNames([getLocale()], { type: "currency" }).of(code); } catch { return code; }
};

function SettingsPanel({ open, onClose, accounts, transactions, budgets, payments, paid,
                         goals, customCats, defaultAcc, setDefaultAcc,
                         setTransactions, setAccounts, setBudgets, setCycleDay, setCustomCats,
                         setPayments, setPaid, setGoals,
                         cycleDay, cycleDayHistory = [], setCycleDayHistory,
                         vacationArchive = [], partnerName = "Partner", onClearData,
                         proStatus = null, user = null,
                         // v1.5.1: nowe dane do pełnego exportu XLSX (trips/hobbies/portfolio)
                         trips = [], hobbies = [], portfolio = [],
                         // v2.1.0: przedmioty Sprzedaży + pełne przywracanie backupu przez applyData w App
                         resaleItems = [], modules = null, onRestoreFull,
                         // v2.2.0: katalog Kolekcji i zlecenia Freelance
                         collectionItems = [], gigs = [] }) {
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("#06b6d4");
  const [newCatType,  setNewCatType]  = useState("expense"); // expense | income
  const [newCatExpenseType, setNewCatExpenseType] = useState("variable"); // fixed | variable | lifestyle (tylko dla expense)

  // v1.2.12: edit istniejącej custom cat. Pozwala zmienić label/color/expenseType
  // ale NIE id (bo wszystkie tx mają t.cat = id, zmiana = utrata historii) ani type
  // (expense ↔ income - bo amount sign jest semantycznie powiązany).
  const [editingCatId, setEditingCatId] = useState(null);
  const [editForm, setEditForm] = useState({ label: "", color: "", expenseType: "variable" });

  const startEditCat = (cat) => {
    setEditingCatId(cat.id);
    setEditForm({
      label: cat.label || "",
      color: cat.color || "#06b6d4",
      expenseType: cat.expenseType || "variable",
    });
  };
  const cancelEditCat = () => {
    setEditingCatId(null);
    setEditForm({ label: "", color: "", expenseType: "variable" });
  };
  const saveEditCat = () => {
    const trimmed = editForm.label.trim();
    if (!trimmed) return;
    const capLabel = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    setCustomCats(c => c.map(x => x.id === editingCatId ? {
      ...x,
      label: capLabel,
      color: editForm.color,
      // expenseType tylko gdy expense (income tego nie używa)
      expenseType: x.type === "expense" ? editForm.expenseType : null,
    } : x));
    cancelEditCat();
  };
  const [importStatus, setImportStatus] = useState(null); // null | "ok" | "err" | "loading"
  const [importMsg, setImportMsg]       = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  // FX status: "" | "ok" | "err"
  const [fxRefreshStatus, setFxRefreshStatus] = useState("");
  // v1.5.0: display currency (główna waluta wyświetlania majątku/sum)
  const [displayCur, setDisplayCur] = useState(getDisplayCurrency());
  useBackHandler(open, onClose);
  useBackHandler(open && confirmClear, () => setConfirmClear(false));

  if (!open) return null;

  //    EXPORT (lazy-load XLSX - 137KB gzipped, 415KB raw)
  //    v1.5.1: kolumny rozszerzone o multi-currency + osobne arkusze Wyjazdy/Hobby
  //    + pełny Backup_JSON v:2 zawierający WSZYSTKO co potrzebne do restore.
  const handleExport = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Transakcje (z multi-currency, tripId, linkedPayment)
    const txRows = transactions.map(t => ({
      ID:               t.id,
      Data:             t.date,
      Opis:             t.desc,
      Kwota_PLN:        t.amount,
      Kategoria:        t.cat,
      Konto_ID:         t.acc,
      Konto_Nazwa:      (accounts.find(a => a.id === t.acc) || {}).name || "",
      Kwota_oryg:       t.origAmount != null ? t.origAmount : "",
      Waluta_oryg:      t.origCurrency || "",
      Kurs_NBP:         t.fxRate != null ? t.fxRate : "",
      Data_kursu:       t.fxDate || "",
      Wyjazd_ID:        t.tripId != null ? t.tripId : "",
      Wyjazd_Nazwa:     t.tripId != null
        ? ((trips || []).find(tr => tr.id === t.tripId) || {}).name || ""
        : "",
      Linked_Payment:   t.linkedPaymentId != null ? t.linkedPaymentId : "",
    }));
    const wsTx = XLSX.utils.json_to_sheet(txRows);
    wsTx["!cols"] = [
      {wch:8},{wch:12},{wch:34},{wch:12},{wch:14},{wch:10},{wch:20},
      {wch:12},{wch:10},{wch:10},{wch:12},{wch:10},{wch:20},{wch:14},
    ];
    XLSX.utils.book_append_sheet(wb, wsTx, "Transakcje");

    // Sheet 2: Konta (z currency, color, kontrybucja)
    const accRows = accounts.map(a => ({
      ID:                    a.id,
      Nazwa:                 a.name,
      Typ:                   a.type,
      Bank:                  a.bank,
      Saldo:                 a.balance,
      Waluta:                a.currency || "PLN",
      IBAN:                  a.iban,
      Kolor:                 a.color || "",
      Wpłata_roczna:         a.annualContribution || "",
      Dopłata_pracodawcy:    a.employerContribution || "",
    }));
    const wsAcc = XLSX.utils.json_to_sheet(accRows);
    wsAcc["!cols"] = [{wch:6},{wch:22},{wch:12},{wch:14},{wch:14},{wch:8},{wch:32},{wch:10},{wch:14},{wch:18}];
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

    // Sheet 9: Wyjazdy (v1.5.1) — z defaultCurrency, dateFrom/To, budget, archived
    if (trips && trips.length) {
      const tripRows = trips.map(tr => ({
        ID:                tr.id,
        Nazwa:             tr.name,
        Od:                tr.dateFrom || "",
        Do:                tr.dateTo || "",
        Budget_PLN:        tr.budget || 0,
        Waluta_domyślna:   tr.defaultCurrency || "PLN",
        Kolor:             tr.color || "",
        Notatki:           tr.notes || "",
        Zarchiwizowany:    tr.archived ? "tak" : "nie",
        Utworzony:         tr.createdAt || "",
      }));
      const wsTrips = XLSX.utils.json_to_sheet(tripRows);
      wsTrips["!cols"] = [{wch:14},{wch:24},{wch:12},{wch:12},{wch:12},{wch:10},{wch:10},{wch:34},{wch:8},{wch:24}];
      XLSX.utils.book_append_sheet(wb, wsTrips, "Wyjazdy");
    }

    // Sheet 10: Hobby (v1.5.1)
    if (hobbies && hobbies.length) {
      const hobbyRows = hobbies.map(h => ({
        ID:           h.id,
        Nazwa:        h.name,
        Kolor:        h.color || "",
        Kategorie:    (h.categories || []).join(", "),
        Słowa_klucz:  (h.keywords || []).join(", "),
        Roczny_limit: h.yearlyTarget || "",
        Zarchiwizowane: h.archived ? "tak" : "nie",
        Utworzone:    h.createdAt || "",
      }));
      const wsHobby = XLSX.utils.json_to_sheet(hobbyRows);
      wsHobby["!cols"] = [{wch:14},{wch:24},{wch:10},{wch:30},{wch:30},{wch:14},{wch:10},{wch:24}];
      XLSX.utils.book_append_sheet(wb, wsHobby, "Hobby");
    }

    // Sheet 11: Portfolio (v1.5.1) — pozycje inwestycyjne (już istniały w state ale nie były exportowane)
    if (portfolio && portfolio.length) {
      const portRows = portfolio.map(p => ({
        ID:           p.id,
        Ticker:       p.ticker || "",
        Nazwa:        p.name || "",
        Ilość:        p.qty || 0,
        Cena_średnia: p.avgPrice || 0,
        Cena_aktualna:p.currentPrice || 0,
        Wartość_PLN:  +positionValues(p).valuePLN.toFixed(2),
        PnL_PLN:      +positionValues(p).pnlPLN.toFixed(2),
        PnL_proc:     p.pnlPct != null ? p.pnlPct.toFixed(2) + "%" : "",
        Konto:        p.account || "",
        Waluta:       p.currency || "PLN",
        Linked_Acc:   p.linkedAccId != null ? p.linkedAccId : "",
      }));
      const wsPort = XLSX.utils.json_to_sheet(portRows);
      XLSX.utils.book_append_sheet(wb, wsPort, "Inwestycje");
    }

    // Sheet: Zakłady (v2.1.0) — kupony z modułu Zakłady
    const betTxs = transactions.filter(tx => tx.bet);
    if (betTxs.length) {
      const wsBets = XLSX.utils.json_to_sheet(betTxs.map(tx => ({
        Data:        tx.date,
        Bukmacher:   tx.bet.bookmaker || "",
        Zdarzenie:   tx.bet.event || "",
        Dyscyplina:  tx.bet.sport || "",
        Kurs:        tx.bet.odds,
        Stawka:      tx.bet.stake,
        Waluta:      tx.bet.currency || "PLN",
        Podatek_PL:  tx.bet.taxed ? "tak" : "nie",
        Status:      tx.bet.status,
        Wypłata:     tx.bet.payout ?? "",
        Wynik_PLN:   tx.amount,
        Rozliczony:  tx.bet.settledAt || "",
      })));
      XLSX.utils.book_append_sheet(wb, wsBets, "Zakłady");
    }

    // Sheet: Sprzedaż (v2.1.0) — przedmioty z modułu Sprzedaż
    if (resaleItems && resaleItems.length) {
      const wsResale = XLSX.utils.json_to_sheet(resaleItems.map(it => ({
        Nazwa:          it.name,
        Kategoria:      it.category || "",
        Status:         it.status,
        Waluta:         it.currency || "PLN",
        Koszt_zakupu:   it.buyPrice ?? "",
        Data_zakupu:    it.buyDate || "",
        Platforma:      it.platform || "",
        Cena_wystawienia: it.listPrice ?? "",
        Cena_sprzedaży: it.sellPrice ?? "",
        Prowizja:       it.fees ?? "",
        Wysyłka:        it.shipping ?? "",
        Data_sprzedaży: it.sellDate || "",
      })));
      XLSX.utils.book_append_sheet(wb, wsResale, "Sprzedaż");
    }

    // Sheet: Kolekcje (v2.2.0) — katalog pozycji
    if (collectionItems && collectionItems.length) {
      const hobbyName = (id) => ((hobbies || []).find(h => h.id === id) || {}).name || "";
      const wsColl = XLSX.utils.json_to_sheet(collectionItems.map(it => ({
        Kolekcja:     hobbyName(it.hobbyId),
        Tytuł:        it.title,
        Twórca:       it.creator || "",
        Format:       it.format || "",
        Stan:         it.condition || "",
        Status:       it.status,
        Waluta:       it.currency || "PLN",
        Cena_zakupu:  it.buyPrice ?? "",
        Data_zakupu:  it.buyDate || "",
        Wartość:      it.value ?? "",
        Kupię_do:     it.targetPrice ?? "",
      })));
      XLSX.utils.book_append_sheet(wb, wsColl, "Kolekcje");
    }

    // Sheet: Freelance (v2.2.0) — zlecenia
    if (gigs && gigs.length) {
      const wsGigs = XLSX.utils.json_to_sheet(gigs.map(g => ({
        Klient:      g.client || "",
        Opis:        g.title || "",
        Kwota:       g.amount,
        Waluta:      g.currency || "PLN",
        Godziny:     g.hours ?? "",
        Wykonane:    g.date || "",
        Termin:      g.dueDate || "",
        Status:      g.status,
        Zapłacone:   g.paidDate || "",
      })));
      XLSX.utils.book_append_sheet(wb, wsGigs, "Freelance");
    }

    // Sheet 12: Full JSON backup v:2 — KOMPLET danych do restore
    // (v:1 nie miał trips/hobbies/portfolio/cycleDayHistory/tombstones/partnerName)
    const templates = (() => { try { return JSON.parse(localStorage.getItem("ft_templates") || "null"); } catch(_) { return null; } })();
    const vacation  = (() => { try { return JSON.parse(localStorage.getItem("ft_vacation")  || "null"); } catch(_) { return null; } })();
    const displayCurrency = (() => { try { return localStorage.getItem("ft_display_currency") || "PLN"; } catch(_) { return "PLN"; } })();
    const backupData = {
      v: 2,
      // Wszystkie dane finansowe
      accounts, transactions, budgets, payments, paid, goals,
      customCats, cycleDay, cycleDayHistory, defaultAcc, partnerName,
      portfolio, trips, hobbies, resaleItems, collectionItems, gigs, modules,
      // Legacy/templates
      templates, vacation, vacationArchiveData: vacationArchive,
      // Preferencje per device (mogą być przydatne przy restore na tym samym urządzeniu)
      displayCurrency,
      // Tombstones (delete tracking) — bez tego restore mógłby wskrzesić usunięte
      tombstones: (() => { try {
        const raw = JSON.parse(localStorage.getItem("fintrack_v1") || "{}");
        return raw.tombstones || {};
      } catch { return {}; } })(),
      exportedAt: new Date().toISOString(),
      appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
    };
    const wsBackup = XLSX.utils.json_to_sheet([{ JSON_backup: JSON.stringify(backupData) }]);
    wsBackup["!cols"] = [{wch:200}];
    XLSX.utils.book_append_sheet(wb, wsBackup, "_Backup_JSON");

    const today = todayLocal();
    const filename = `Sidegig_export_${today}.xlsx`;
    if (isNative) {
      try { await shareFile({ filename, base64: XLSX.write(wb, { bookType: "xlsx", type: "base64" }), title: filename }); }
      catch (e) { console.error("[FT] export share error", e); alert(t("settings.export.shareErr", "Nie udało się zapisać pliku. Spróbuj ponownie.")); }
      return;
    }
    XLSX.writeFile(wb, filename);
  };

  //    IMPORT                                                                  
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("loading");
    setImportMsg(t("settings.import.loading", "Wczytuję plik…"));

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
              if (d && onRestoreFull) {
                // v2.1.0: pełne przywrócenie przez applyData w App — także wyjazdy, hobby,
                // portfel, przedmioty Sprzedaży i moduły (wcześniej import je pomijał)
                onRestoreFull(d);
                setImportStatus("ok");
                setImportMsg(
                  t("settings.import.restored", "Przywrócono kopię: wpisy {tx}, konta {acc}, wyjazdy {trips}, kolekcje {hobbies}, przedmioty {items}, pozycje katalogu {catalog}, zlecenia {gigs}")
                    .replace("{tx}", (d.transactions||[]).length).replace("{acc}", (d.accounts||[]).length)
                    .replace("{trips}", (d.trips||[]).length).replace("{hobbies}", (d.hobbies||[]).length)
                    .replace("{items}", (d.resaleItems||[]).length).replace("{catalog}", (d.collectionItems||[]).length)
                    .replace("{gigs}", (d.gigs||[]).length)
                );
                return;
              }
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
        setImportMsg(t("settings.import.error", "Błąd wczytywania pliku. Upewnij się, że to plik .xlsx z Sidegig lub FinTrack."));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // reset input
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
            <div style={{ background: "linear-gradient(135deg,#059669,#10b981)", borderRadius: 10,
                          padding: 8, display: "flex" }}>
              <Settings size={16} color="white"/>
            </div>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{t("settings.title", "Ustawienia")}</span>
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
                      Sidegig PRO
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                    {pro.type === "lifetime" && t("settings.pro.lifetime", "Dożywotni dostęp · dziękuję za wsparcie!")}
                    {pro.type === "yearly" && pro.expiresAt && `${t("settings.pro.validUntil", "Ważny do")} ${new Date(pro.expiresAt).toLocaleDateString(getLocale())}`}
                    {pro.type === "trial" && t("settings.pro.trial", "Wersja próbna")}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <button onClick={() => { onClose(); setTimeout(() => { if (window.__openUpgrade) window.__openUpgrade("settings"); }, 300); }} style={{
              width: "100%", background: "linear-gradient(135deg,#059669,#10b981)",
              border: "none", borderRadius: 16, padding: "16px 18px",
              marginBottom: 22, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Crown size={14} color="#fbbf24"/>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                    {t("settings.upgrade.cta", "Upgrade do PRO")}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                  {t("settings.upgrade.subtitle", "99 zł/rok · bez limitów · bez reklam")}
                </div>
              </div>
              <div style={{ background: "white", color: "#1e40af", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800 }}>
                {t("settings.upgrade.buy", "Kup")}
              </div>
            </button>
          );
        })()}

        {/* ── DOMYSLNE KONTO ── */}
        <SectionTitle>💳 {t("settings.defaultAcc.title", "Domyślne konto transakcji")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings.defaultAcc.help", "Konto wypełniane automatycznie przy dodawaniu transakcji.")}
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
              {t("settings.defaultAcc.empty", "Brak konta osobistego. Dodaj konto typu \"Rachunek bieżący\" w zakładce Portfel.")}
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
                <div style={{ fontSize: 11, color: acc.color, fontWeight: 700 }}>{t("settings.default", "Domyślne")}</div>
              )}
            </button>
          ))}
        </div>

        <Divider/>

        {/* EXPORT SECTION */}
        <SectionTitle>🏷️ {t("settings.cats.title", "Moje kategorie")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          {t("settings.cats.help", "Dodaj własne kategorie wydatków lub przychodów.")}
        </p>

        {/* Existing custom cats */}
        {customCats.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {customCats.map(cat => {
              const isEditing = editingCatId === cat.id;

              if (isEditing) {
                // Inline edit form
                return (
                  <div key={cat.id} style={{
                    background: "#0d1628", border: "1px solid #2563eb44",
                    borderRadius: 10, padding: "12px 14px",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t("settings.cats.editing", "Edytuj kategorię")} · ID: {cat.id}
                    </div>

                    {/* Label */}
                    <input
                      value={editForm.label}
                      onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                      placeholder={t("settings.cats.namePh", "Nazwa kategorii")}
                      style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                        borderRadius: 8, padding: "9px 11px", color: "#e2e8f0", fontSize: 14,
                        fontFamily: "'Space Grotesk', sans-serif", outline: "none",
                        WebkitAppearance: "none" }}
                    />

                    {/* Color picker */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b",
                        marginBottom: 6, textTransform: "uppercase" }}>{t("common.color", "Kolor")}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4",
                          "#ec4899","#f97316","#14b8a6","#a855f7","#84cc16","#f43f5e"].map(c => (
                          <div key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))}
                            style={{ width: 24, height: 24, borderRadius: 6, background: c,
                              cursor: "pointer",
                              border: editForm.color === c ? "2px solid white" : "2px solid transparent" }}/>
                        ))}
                      </div>
                    </div>

                    {/* Expense type (tylko dla expense cat) */}
                    {cat.type === "expense" && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b",
                          marginBottom: 6, textTransform: "uppercase" }}>
                          {t("settings.cats.expenseType", "Typ w strukturze wydatków")}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[
                            ["fixed",     t("exptype.fixed",     "Stałe"),     "#3b82f6"],
                            ["variable",  t("exptype.variable", "Zmienne"),   "#f59e0b"],
                            ["lifestyle", t("exptype.lifestyle", "Lifestyle"), "#ec4899"],
                          ].map(([v, l, col]) => (
                            <button key={v}
                              onClick={() => setEditForm(f => ({ ...f, expenseType: v }))}
                              style={{
                                flex: 1, padding: "6px 0", borderRadius: 6, cursor: "pointer",
                                fontSize: 11, fontWeight: 700,
                                fontFamily: "'Space Grotesk', sans-serif",
                                background: editForm.expenseType === v ? col + "22" : "transparent",
                                border: `1px solid ${editForm.expenseType === v ? col : "#1a2744"}`,
                                color: editForm.expenseType === v ? col : "#475569",
                              }}>{l}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Save / Cancel */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={cancelEditCat} style={{
                        flex: 1, background: "#1a2744", border: "1px solid #334155",
                        color: "#94a3b8", borderRadius: 8, padding: "9px 0",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>{t("common.cancel", "Anuluj")}</button>
                      <button onClick={saveEditCat} style={{
                        flex: 2, background: "linear-gradient(135deg,#1e40af,#3b82f6)",
                        border: "none", color: "white",
                        borderRadius: 8, padding: "9px 0",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>{t("tx.saveChanges", "Zapisz zmiany")}</button>
                    </div>
                  </div>
                );
              }

              // Default row (z Edit + Delete buttons)
              return (
                <div key={cat.id} style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  background: "#060b14", border: "1px solid #1a2744",
                  borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {cat.label ? cat.label.charAt(0).toUpperCase() + cat.label.slice(1) : cat.label}
                    </span>
                    <span style={{ fontSize: 11, color: "#334155" }}>
                      {cat.type === "income" ? t("settings.cats.income", "przychód") : t("settings.cats.expense", "wydatek")}
                    </span>
                    {/* Pokaż expenseType jako mały badge */}
                    {cat.type === "expense" && cat.expenseType && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        background: cat.expenseType === "fixed"     ? "#3b82f622"
                                  : cat.expenseType === "variable"  ? "#f59e0b22"
                                  :                                   "#ec489922",
                        color:      cat.expenseType === "fixed"     ? "#60a5fa"
                                  : cat.expenseType === "variable"  ? "#fbbf24"
                                  :                                   "#f472b6",
                      }}>
                        {cat.expenseType === "fixed" ? t("settings.cats.fixed", "Stałe")
                         : cat.expenseType === "variable" ? t("exptype.variable", "Zmienne")
                         : t("exptype.lifestyle", "Lifestyle")}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => startEditCat(cat)}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        color: "#475569", padding: 4 }}
                      title={t("common.edit", "Edytuj")}>
                      <Edit2 size={13}/>
                    </button>
                    <button onClick={() => {
                      if (confirm(`${t("settings.cats.deleteConfirm1", "Usunąć kategorię")} "${cat.label}"?\n\n${t("settings.cats.deleteConfirm2", "Uwaga: transakcje z tą kategorią pozostaną, ale stracą kolor i nazwę.")}`)) {
                        setCustomCats(c => c.filter(x => x.id !== cat.id));
                      }
                    }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 4 }}
                      title={t("common.delete", "Usuń")}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new custom cat */}
        <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: "14px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[["expense", t("settings.cats.expense2", "Wydatek")],["income", t("settings.cats.income2", "Przychód")]].map(([v,l]) => (
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
            placeholder={t("settings.cats.namePlaceholder", "Nazwa kategorii (np. Siłownia)")}
            style={{ width: "100%", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8,
              padding: "10px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "'Space Grotesk', sans-serif",
              outline: "none", marginBottom: 10, WebkitAppearance: "none" }}
          />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>{t("common.color", "Kolor")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899","#f97316","#14b8a6","#a855f7","#84cc16","#f43f5e"].map(c => (
                <div key={c} onClick={() => setNewCatColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                    border: newCatColor === c ? "2px solid white" : "2px solid transparent" }}/>
              ))}
            </div>
          </div>

          {/* v1.2.10: typ wydatku dla custom expense cat - żeby user mógł powiedzieć
              "Kredyt Dom = Stałe" zamiast fallback do Variable. */}
          {newCatType === "expense" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                {t("settings.cats.expenseType", "Typ w strukturze wydatków")}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  ["fixed",     t("exptype.fixed",     "Stałe"),     "#3b82f6"],
                  ["variable",  t("exptype.variable", "Zmienne"),   "#f59e0b"],
                  ["lifestyle", t("exptype.lifestyle", "Lifestyle"), "#ec4899"],
                ].map(([v, l, c]) => (
                  <button key={v} onClick={() => setNewCatExpenseType(v)} style={{
                    flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    fontFamily: "'Space Grotesk', sans-serif",
                    background: newCatExpenseType === v ? c + "22" : "transparent",
                    border: `1px solid ${newCatExpenseType === v ? c : "#1a2744"}`,
                    color: newCatExpenseType === v ? c : "#475569",
                  }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4, lineHeight: 1.4 }}>
                {t("settings.cats.typeHelp", "Stałe = miesięczne (kredyt, czynsz). Zmienne = potrzebne (jedzenie, zdrowie). Lifestyle = przyjemności.")}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (!newCatLabel.trim()) return;
              const id = newCatLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_ąćęłńóśźż]/gi, "");
              if (CATEGORIES.find(c => c.id === id)) { alert(t("settings.cats.alreadyExists", "Kategoria o tej nazwie już istnieje")); return; }
              const capLabel = newCatLabel.trim().charAt(0).toUpperCase() + newCatLabel.trim().slice(1);
              setCustomCats(c => [...c, {
                id, label: capLabel,
                iconName: "Wallet", color: newCatColor,
                type: newCatType, custom: true,
                group: newCatType === "income" ? "income" : "lifestyle",
                // v1.2.10: expenseType dla user-defined classification
                expenseType: newCatType === "expense" ? newCatExpenseType : null,
              }]);
              setNewCatLabel("");
              setNewCatExpenseType("variable");
            }}
            style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none",
              borderRadius: 10, padding: "11px 0", color: "white", fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
            + {t("settings.cats.addBtn", "Dodaj kategorię")}
          </button>
        </div>

        <Divider/>

        {/* Język / Language */}
        <SectionTitle>📤 {t("settings.export.title", "Eksport danych")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.6 }}>
          {t("settings.export.help", "Pobierz wszystkie swoje dane jako plik Excel (.xlsx) z 7 arkuszami: Transakcje, Konta, Budżety, Płatności, Podsumowanie, Cele + pełny backup JSON.")}
        </p>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { label: t("settings.stats.tx",       "Transakcji"),  val: transactions.length, color: "#3b82f6" },
            { label: t("settings.stats.accounts", "Kont"),        val: accounts.length,     color: "#10b981" },
            { label: t("settings.stats.budgets", "Budżetów"),    val: budgets.length,      color: "#8b5cf6" },
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
          <span style={{ fontSize: 18 }}>⬇</span> {t("settings.export.btn", "Eksportuj do Excel (.xlsx)")}
        </button>

        <div style={{ height: 10 }}/>
        <button onClick={() => {
          // Raport bieżącego miesiąca do druku / PDF — w języku i formacie apki
          const now = new Date();
          const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
          const monthTx = transactions.filter(tx => tx.date.startsWith(ym) && tx.cat !== "inne");
          const cats = {};
          monthTx.filter(tx => tx.amount < 0).forEach(tx => { cats[tx.cat] = (cats[tx.cat]||0) + Math.abs(tx.amount); });
          const income = monthTx.filter(tx => tx.amount > 0).reduce((sum,tx) => sum+tx.amount,0);
          const expense = Object.values(cats).reduce((sum,v) => sum+v, 0);
          const pln = (v) => fmtCurrency(v, "PLN");
          const catLabel = (id) => ([...CATEGORIES, ...(customCats || [])].find(c => c.id === id) || {}).label || id;
          const period = now.toLocaleDateString(getLocale(), { month: "long", year: "numeric" });
          const rows = Object.entries(cats).sort((x,y) => y[1]-x[1]).map(([cat,val]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #eee">${catLabel(cat)}</td><td style="padding:4px 12px;text-align:right;border-bottom:1px solid #eee">${pln(val)}</td></tr>`).join("");
          const html = `<!DOCTYPE html><html lang="${getLang()}"><head><meta charset="utf-8"><title>Sidegig – ${period}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:600px;margin:0 auto}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;color:#555;font-weight:400;margin-bottom:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:6px 12px;background:#f5f5f5;font-size:13px}td{font-size:13px}.summary{display:flex;gap:32px;margin-bottom:24px}.box{background:#f9f9f9;padding:12px 20px;border-radius:8px}.label{font-size:11px;color:#888;text-transform:uppercase}.val{font-size:20px;font-weight:700;margin-top:4px}.green{color:#16a34a}.red{color:#dc2626}</style></head><body><h1>Sidegig — ${t("report.title", "Raport miesięczny")}</h1><h2>${period}</h2><div class="summary"><div class="box"><div class="label">${t("report.income", "Przychody")}</div><div class="val green">${pln(income)}</div></div><div class="box"><div class="label">${t("report.expenses", "Wydatki")}</div><div class="val red">${pln(expense)}</div></div><div class="box"><div class="label">${t("report.balance", "Bilans")}</div><div class="val ${income-expense>=0?"green":"red"}">${pln(income-expense)}</div></div></div><table><thead><tr><th>${t("report.category", "Kategoria")}</th><th style="text-align:right">${t("report.amount", "Kwota")}</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:24px;font-size:11px;color:#aaa">${t("report.generated", "Wygenerowano")}: ${now.toLocaleDateString(getLocale())} · Sidegig</p></body></html>`;
          if (isNative) {
            // WebView nie drukuje — plik HTML do udostępnienia (np. Chrome → Drukuj → PDF)
            shareFile({ filename: `Sidegig_report_${ym}.html`, text: html, title: `Sidegig – ${period}` }).catch(e => console.error("[FT] report share error", e));
            return;
          }
          const w = window.open("","_blank"); w.document.write(html); w.document.close(); w.print();
        }} style={{
          width: "100%", background: "#060b14", border: "1px solid #1a2744",
          borderRadius: 12, padding: "12px 0", color: "#94a3b8",
          fontWeight: 700, fontSize: 14, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🖨</span> {t("settings.report.btn", "Drukuj raport miesiąca (PDF)")}
        </button>

        <Divider/>

        {/* IMPORT SECTION */}
        <SectionTitle>📥 {t("settings.import.title", "Import danych")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 6, lineHeight: 1.6 }}>
          {t("settings.import.help1", "Wczytaj plik .xlsx wyeksportowany z Sidegig lub FinTrack. Dane zostaną")}
          <span style={{ color: "#f59e0b", fontWeight: 700 }}> {t("settings.import.replaced", "zastąpione")}</span>{t("settings.import.help2", " — zrób eksport przed importem jeśli chcesz zachować kopię.")}
        </p>

        {/* Column legend */}
        <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 10,
                      padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("settings.import.columns", "Wymagane kolumny (arkusz „Transakcje”)")}
          </div>
          {[
            ["Data",      t("settings.import.colDate", "RRRR-MM-DD"),  "#3b82f6"],
            ["Opis",      t("settings.import.colText", "tekst"),       "#10b981"],
            ["Kwota",     t("settings.import.colNumber", "+/- liczba"),  "#f59e0b"],
            ["Kategoria", t("settings.import.colCategory", "np. jedzenie"),"#8b5cf6"],
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
          <span style={{ fontSize: 20 }}>📂</span> {t("settings.import.btnXlsx", "Wybierz plik .xlsx (kopia zapasowa)")}
          <input type="file" accept=".xlsx,.xls" onChange={handleImport}
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
                {importStatus === "ok" ? t("settings.import.statusOk", "Import zakończony!") : importStatus === "err" ? t("settings.import.statusErr", "Błąd importu") : t("settings.import.statusLoading", "Wczytuję…")}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{importMsg}</div>
            </div>
          </div>
        )}

        <Divider/>

        {/* v1.5.0: Główna waluta wyświetlania. Internal storage zawsze PLN —
            zmiana tylko zmienia jak są pokazywane sumy/Dashboard/budżety. */}
        <SectionTitle>🌍 {t("settings.currency.title", "Waluta główna")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10, lineHeight: 1.6 }}>
          {t("settings.currency.help", "W niej pokazujemy sumy i bilans. Każdy wpis zachowuje swoją walutę — przeliczamy po kursie z dnia wpisu.")}
        </p>
        <div style={{ marginBottom: 14 }}>
          <select
            value={displayCur}
            onChange={(e) => {
              const code = e.target.value;
              if (setDisplayCurrency(code)) {
                setDisplayCur(code);
                // v2.1.0: bez reloadu. App słucha 'ft:display-currency-changed', przerysowuje
                // widoki i zapisuje nową walutę (reload ją gubił — stary snapshot ją nadpisywał).
              }
            }}
            style={{
              width: "100%", padding: "12px 14px",
              background: "#060b14", border: "1px solid #1e3a5f",
              borderRadius: 10, color: "#e2e8f0", fontSize: 14,
              fontFamily: "'DM Mono', monospace", outline: "none",
              WebkitAppearance: "none", appearance: "none",
              boxSizing: "border-box", cursor: "pointer",
            }}>
            {["PLN", ...SUPPORTED_CURRENCIES].map(c => (
              <option key={c} value={c}>{c} — {currencyName(c)}</option>
            ))}
          </select>
          {displayCur !== "PLN" && (
            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, lineHeight: 1.5 }}>
              ⚠️ {t("settings.currency.drift", "Przeliczamy po kursach średnich NBP. Między dwiema walutami obcymi (np. EUR↔USD) różnica może wynieść ok. 0,1%.")}
            </div>
          )}
        </div>

        <Divider/>

        {/* FX rates — NBP Tabela A */}
        <SectionTitle>💱 {t("settings.fx.title", "Kursy walut")}</SectionTitle>
        {(() => {
          const fx = getCurrentRates();
          const sourceLabel = fx.source === "nbp" || fx.source === "cache"
            ? t("settings.fx.table", "Tabela NBP A z {date}").replace("{date}", fx.date)
            : t("settings.fx.offline", "Offline — kursy z {date}").replace("{date}", fx.date);
          const sourceColor = fx.source === "fallback" ? "#f59e0b" : "#94a3b8";
          return (
            <div style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 12,
              padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{t("settings.fx.source", "Źródło: NBP (Narodowy Bank Polski)")}</div>
                  <div style={{ fontSize: 11, color: sourceColor, marginTop: 3 }}>{sourceLabel}</div>
                </div>
                <button
                  onClick={async () => {
                    setFxRefreshStatus("loading");
                    const result = await refreshRates();
                    setFxRefreshStatus(result && result.source === "nbp" ? "ok" : "err");
                    setTimeout(() => setFxRefreshStatus(""), 3000);
                  }}
                  disabled={fxRefreshStatus === "loading"}
                  style={{
                    background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa",
                    borderRadius: 10, padding: "6px 12px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700,
                    fontFamily: "'Space Grotesk', sans-serif",
                    opacity: fxRefreshStatus === "loading" ? 0.6 : 1,
                  }}>
                  {fxRefreshStatus === "loading" ? t("settings.fx.refreshing", "Odświeżam…") : t("settings.fx.refresh", "Odśwież")}
                </button>
              </div>
              {fxRefreshStatus === "ok" && (
                <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✓ {t("settings.fx.ok", "Pobrano świeże kursy")}</div>
              )}
              {fxRefreshStatus === "err" && (
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>⚠ {t("settings.fx.err", "Brak połączenia — używam ostatnio pobranych kursów")}</div>
              )}
              {/* Lista 5 najpopularniejszych kursów dla podglądu */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 10 }}>
                {["EUR", "USD", "GBP", "CHF", "CZK"].map(code => {
                  const r = fx.rates[code];
                  return (
                    <div key={code} style={{ background: "#0a1120", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.05em" }}>{code}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>
                        {r ? r.toLocaleString(getLocale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 8, lineHeight: 1.5 }}>
                {t("settings.fx.note", "Średnie kursy NBP (Tabela A), odświeżane raz na dobę. Twój bank ma własny kurs i spread — Sidegig to tracker, nie księgowość.")}
              </div>
            </div>
          );
        })()}

        <Divider/>

        {/* Custom categories */}
        <SectionTitle>🌍 {t("settings.language", "Język")} / Language</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {LANGUAGES.map(({ code, name, flag }) => (
            <button key={code} onClick={() => code !== getLang() && setLang(code)} aria-pressed={getLang() === code} style={{
              padding: "11px 10px", borderRadius: 12, cursor: "pointer", textAlign: "left",
              fontWeight: 700, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
              background: getLang() === code ? "#10b98122" : "#0d1628",
              border: getLang() === code ? "1px solid #10b981" : "1px solid #1e3a5f66",
              color: getLang() === code ? "#34d399" : "#94a3b8",
            }}>{flag} {name}</button>
          ))}
        </div>
        <Divider/>

        {/* PIN Lock */}
        <SectionTitle>🔒 {t("settings.security.title", "Bezpieczeństwo")}</SectionTitle>
        <PinSettings/>
        <Divider/>

        {/* Data reset */}
        <Divider/>
        <SectionTitle>♻️ {t("settings.reset.title", "Resetowanie danych")}</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          {t("settings.reset.help", "Usuń wszystkie dane z tego urządzenia i z chmury.")}
        </p>
        <button
          onClick={() => setConfirmClear(true)}
          style={{
            width: "100%", background: "#1a0808", border: "1px solid #7f1d1d44",
            borderRadius: 12, padding: "12px 0", color: "#ef4444",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
          🗑 {t("settings.reset.wipe", "Wyczyść wszystkie dane")}
        </button>

      </div>

      {/* Confirm: wyczyść dane */}
      {confirmClear && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ background: "#0a1120", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, fontFamily: "'Space Grotesk', sans-serif" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", textAlign: "center", marginBottom: 8 }}>{t("settings.wipe.title", "Wyczyścić wszystkie dane?")}</div>
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
              {t("settings.wipe.desc", "Tej operacji nie można cofnąć. Wszystkie transakcje, konta, cele i płatności zostaną usunięte.")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmClear(false)} style={{ flex: 1, background: "#0d1628", border: "1px solid #1a2744", borderRadius: 12, padding: "12px 0", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("common.cancel", "Anuluj")}
              </button>
              <button onClick={() => {
                if (typeof onClearData === "function") onClearData();
                setConfirmClear(false);
                onClose();
              }} style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 12, padding: "12px 0", color: "#fca5a5", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("settings.wipe.confirm", "Usuń wszystko")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linki prawne */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, padding: "16px 0 4px" }}>
        <a {...linkProps(sitePage("privacy.html"))}
          style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Grotesk', sans-serif",
            textDecoration: "none", borderBottom: "1px solid #1a2744", paddingBottom: 1 }}>
          {t("settings.privacy", "Polityka prywatności")}
        </a>
        <a {...linkProps(sitePage("terms.html"))}
          style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Grotesk', sans-serif",
            textDecoration: "none", borderBottom: "1px solid #1a2744", paddingBottom: 1 }}>
          {t("settings.terms", "Regulamin")}
        </a>
      </div>

      {/* Wersja apki — czytana z package.json przez Vite define (vite.config.js) */}
      <div style={{ textAlign: "center", padding: "4px 0 4px",
        fontSize: 11, color: "#1e2d45", fontFamily: "'DM Mono', sans-serif" }}>
        Sidegig · v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} · 2025–{new Date().getFullYear()}
      </div>


    </div>
  );
};



export { SettingsPanel };
