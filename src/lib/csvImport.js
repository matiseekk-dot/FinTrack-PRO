// CSV import wyciągów bankowych — pluggable parsery dla 8 polskich banków.
//
// Wcześniej (v1.3.9): handleImportCSV w SettingsPanel miał ~270 linii inline logiki
// z 5x skopiowaną funkcją detectCategory (PKO/mBank/ING/Revolut/Generic). Teraz:
//   - jedno detectCategory tutaj
//   - per-bank parser jako prosty obiekt { id, name, detectHeader, parseRow }
//   - SettingsPanel zostaje przy ~30 liniach orchestracji
//
// Wspierane banki:
//   PKO BP, mBank, ING, Santander Polska, Pekao SA, BNP Paribas, Millennium, Revolut.
//
// Format wszystkich PL banków: CSV `;` separated, "Data;Opis;Kwota;Saldo".
// Różnice są w nazwach kolumn i kolejności — stąd per-bank `parseRow`.
//
// Revolut: ',' separated, EN-language headers, kwoty z odpowiednim znakiem.

// === Helpers ===
function parseDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}[.\-/]\d{2}[.\-/]\d{4}/.test(s)) {
    const p = s.split(/[.\-/]/);
    return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  }
  // ISO bez time już obsłużone wyżej; obsłuż "2026-04-15T...":
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return "";
}

function parseAmount(raw) {
  if (raw == null || raw === "") return NaN;
  // PL banki: "−1 234,56" lub "+1 234,56" lub "1234.56"
  // Czasem "−" (minus typograficzny U+2212) zamiast "-"
  const cleaned = String(raw)
    .replace(/−/g, "-")     // typographic minus
    .replace(/\s| /g, "")   // spacje, NBSP
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : NaN;
}

// CSV split z obsługą przecinków/średników w cudzysłowach.
// Banki nie używają escape'owania przecinków per se, ale Revolut może mieć "," w opisie.
function splitCsvRow(line, sep) {
  const cols = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Toggle quote, ale obsłuż "" jako escaped quote
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

// Wykrywanie kategorii z opisu — ta sama logika dla wszystkich banków.
// Lista keyword → category. Łatwa do rozszerzenia.
const CATEGORY_KEYWORDS = [
  // Zakłady
  ["bukmacher", ["superbet", "sts", "fortuna", "betclic", "bukmacher", "zakłady", "totolotek", "lotto", "totalbet"]],
  // Jedzenie - sklepy
  ["jedzenie", ["biedronka", "lidl", "aldi", "kaufland", "carrefour", "auchan", "tesco",
                "żabka", "zabka", "dino", "stokrotka", "polomarket", "spar",
                "sklep", "spożyw", "grocery", "market"]],
  // Jedzenie - restauracje
  ["jedzenie", ["restaur", "bistro", "kebab", "pizza", "mcdo", "mcdonald", "kfc",
                "burger", "sushi", "delivery", "wolt", "glovo", "pyszne", "uber eats", "bolt food"]],
  // Transport - paliwo
  ["transport", ["orlen", "shell", "paliwo", "lotos", "circle k", "circle-k", "petrol", "fuel",
                 "moya", "amic", "bp ", "stacja"]],
  // Transport - przejazdy
  ["transport", ["uber", "bolt", "pkp", "mzk", "ztm", "wkm", "bilet", "taxi", "parking",
                 "freenow", "mytaxi", "intercity", "polregio", "flixbus", "blablacar"]],
  // Subskrypcje / rozrywka
  ["rozrywka", ["netflix", "hbo", "disney", "youtube premium", "apple", "steam", "playstation",
                "xbox", "epic games", "twitch", "patreon", "cinema", "kino", "multikino", "helios"]],
  ["muzyka", ["spotify", "tidal", "apple music", "deezer"]],
  // Zakupy online
  ["zakupy", ["allegro", "amazon", "zalando", "empik", "ikea", "decathlon",
              "media markt", "mediaexpert", "rtv euro", "x-kom", "morele", "ceneo",
              "vinted", "olx", "shein", "temu", "aliexpress"]],
  // Zdrowie
  ["zdrowie", ["apteka", "pharmacy", "drugstore", "lekarz", "szpital", "clinic", "klinika",
               "dentysta", "medical", "luxmed", "medicover", "enel-med", "lekiczne"]],
  // Rachunki
  ["rachunki", ["prąd", "prad", "energia", "tauron", "pgnig", "gaz", "czynsz", "rent", "spółdzielnia",
                "wspólnota", "woda", "internet", "telefon", "orange", "play", "t-mobile",
                "plus ", "netia", "vectra", "upc", "inea"]],
  // Kawiarnia
  ["kawiarnia", ["kawa", "coffee", "starbucks", "cafe", "costa", "green caffe", "tchibo"]],
  // Inwestycje
  ["inwestycje", ["xtb", "invest", "stock", "etf", "dividend", "dywidenda", "obligacje", "fundusz",
                  "trading 212", "interactive brokers", "saxo"]],
];

// Słowa kluczowe transferów (idą jako "inne" — nie wchodzą w analizę wydatków)
const TRANSFER_KEYWORDS = [
  "depositing savings", "saving", "savings", "transfer wewnętrzny", "przelew wewn",
  "top-up", "doładowanie konta", "wpłata własna", "wypłata własna",
];

// Słowa wskazujące przychód (gdy amount > 0)
const INCOME_KEYWORDS = ["salary", "wynagrodzenie", "premia", "wypłata", "pensja", "honorarium"];

function detectCategory(desc, amount) {
  const d = String(desc || "").toLowerCase();
  if (amount > 0) {
    if (INCOME_KEYWORDS.some(kw => d.includes(kw))) return "przychód";
    return "inne";
  }
  // Transfery wewnętrzne najpierw — żeby nie myliły się z zakupami
  if (TRANSFER_KEYWORDS.some(kw => d.includes(kw))) return "inne";
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => d.includes(kw))) return cat;
  }
  return "inne";
}

// === Bank parsers ===
//
// Każdy bank to:
//   id        — string id
//   name      — display name
//   sep       — separator CSV (";" lub ",")
//   detect    — (lowerHeader: string) => boolean — heurystyka czy nasz format
//   parse     — (cols: string[]) => { date, desc, amount } | null
//
// Wszystkie kolejne mapowania na podstawie publicznych specyfikacji eksportów
// banków lub plików testowych. Nie używamy private ID'ków transakcji — tylko
// data, opis, kwota.

const BANK_PARSERS = [
  {
    id: "pko",
    name: "PKO BP",
    sep: ";",
    // Header: "Data operacji";"Data waluty";"Typ transakcji";"Kwota";"Waluta";"Saldo po transakcji";"Opis transakcji"
    detect: h => h.includes("data operacji") && (h.includes("opis transakcji") || h.includes("typ transakcji")),
    parse: cols => {
      const date = parseDate(cols[0]);
      // PKO ma kwotę zwykle w col[3], opis w col[6] (a czasem col[2] dla pre-2023 formatu)
      const amount = parseAmount(cols[3]);
      const desc = (cols[6] || cols[2] || cols[1] || "").replace(/\s+/g, " ").trim() || "Import PKO";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "mbank",
    name: "mBank",
    sep: ";",
    // Header: #Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
    detect: h => h.includes("nadawca") || (h.includes("tytuł") && h.includes("opis operacji")),
    parse: cols => {
      const date = parseDate(cols[0]);
      const amount = parseAmount(cols[6]);
      const desc = (cols[3] || cols[2] || "").replace(/\s+/g, " ").trim() || "Import mBank";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "ing",
    name: "ING Bank Śląski",
    sep: ";",
    // Header: "Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta";"Kwota blokady/zwolnienie blokady";"Saldo po transakcji";"Konto"
    detect: h => h.includes("dane kontrahenta") || (h.includes("nr transakcji") && h.includes("waluta rachunku")),
    parse: cols => {
      const date = parseDate(cols[0]);
      const amount = parseAmount(cols[8]);
      const desc = (cols[2] || cols[3] || "").replace(/\s+/g, " ").trim() || "Import ING";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "santander",
    name: "Santander Polska",
    sep: ";",
    // Format: "Data operacji";"Data księgowania";"Opis";"Kwota";"Saldo";"Waluta"
    // Nieco trudniej rozróżnić od PKO — "santander" w nagłówku metadanych na początku pliku
    // jest zmienne, więc patrzymy na charakterystyczną kolejność.
    detect: h => (h.includes("data operacji") && h.includes("data księgowania") && h.includes("opis"))
              || h.includes("santander"),
    parse: cols => {
      const date = parseDate(cols[0]);
      const amount = parseAmount(cols[3]);
      const desc = (cols[2] || "").replace(/\s+/g, " ").trim() || "Import Santander";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "pekao",
    name: "Pekao SA",
    sep: ";",
    // Pekao eksport: "Data operacji";"Waluta";"Opis operacji";"Kwota operacji";"Saldo";"..."
    detect: h => (h.includes("data operacji") && h.includes("opis operacji") && h.includes("kwota operacji"))
              || h.includes("pekao"),
    parse: cols => {
      const date = parseDate(cols[0]);
      // Pekao: kwota w col[3]
      const amount = parseAmount(cols[3]);
      const desc = (cols[2] || "").replace(/\s+/g, " ").trim() || "Import Pekao";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "bnp",
    name: "BNP Paribas",
    sep: ";",
    // BNP eksport: "Data transakcji";"Data księgowania";"Typ transakcji";"Dane drugiej strony";"Opis";"Kwota";"Waluta";"Saldo"
    detect: h => (h.includes("dane drugiej strony") || h.includes("typ transakcji"))
              && h.includes("data transakcji"),
    parse: cols => {
      const date = parseDate(cols[0]);
      const amount = parseAmount(cols[5]);
      const desc = (cols[4] || cols[3] || cols[2] || "").replace(/\s+/g, " ").trim() || "Import BNP";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "millennium",
    name: "Bank Millennium",
    sep: ";",
    // Millennium: "Numer konta";"Data";"Data księgowania";"Rodzaj operacji";"Na konto/Z konta";"Odbiorca/Nadawca";"Opis";"Obciążenia";"Uznania";"Saldo"
    // Charakterystyczne: dwie osobne kolumny "Obciążenia" i "Uznania" (jedna wypełniona)
    detect: h => h.includes("obciążenia") && h.includes("uznania"),
    parse: cols => {
      const date = parseDate(cols[1]);
      // Millennium ma OSOBNE kolumny: 7 = Obciążenia (debit, dodatnia liczba), 8 = Uznania (credit)
      const debit = parseAmount(cols[7]);
      const credit = parseAmount(cols[8]);
      let amount;
      if (isFinite(debit) && debit !== 0) amount = -Math.abs(debit);
      else if (isFinite(credit) && credit !== 0) amount = Math.abs(credit);
      else return null;
      const desc = (cols[6] || cols[5] || cols[3] || "").replace(/\s+/g, " ").trim() || "Import Millennium";
      if (!date || isNaN(amount)) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "revolut",
    name: "Revolut",
    sep: ",",
    // Revolut EN: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
    detect: h => (h.includes("started date") || h.includes("completed date") || h.includes("type,product"))
              && (h.includes("amount") || h.includes("kwota")),
    parse: cols => {
      const date = parseDate(cols[2] || cols[3]);
      const desc = (cols[4] || "Import Revolut").replace(/\s+/g, " ").trim();
      let amount = parseAmount(cols[5]);
      const txType = (cols[0] || "").toUpperCase();
      const state = (cols[8] || "").toUpperCase();
      // Pomiń niesfinalizowane
      if (state === "FAILED" || state === "REVERTED" || state === "PENDING") return null;
      // Revolut zwykle daje amount z odpowiednim znakiem; ale niektóre eksporty
      // (płatności kartą) bywają bez znaku — wtedy ustaw debit ręcznie.
      if (!isNaN(amount) && amount > 0 &&
          (txType.includes("CARD") || txType.includes("PAYMENT") ||
           txType.includes("PLATNOSC") || txType.includes("PŁATNOŚĆ") ||
           txType.includes("ATM"))) {
        amount = -Math.abs(amount);
      }
      if (!date || !isFinite(amount) || amount === 0) return null;
      return { date, desc, amount };
    },
  },
  {
    id: "generic",
    name: "Inny (auto-wykrywanie)",
    sep: null, // zostanie wykryty
    detect: () => true, // zawsze last-resort
    parse: cols => {
      // Heurystyka: znajdź pierwszą kolumnę wyglądającą jak data, pierwszą jak kwota,
      // pierwszą która jest tekstem dłuższym niż 3 znaki = opis.
      const date = parseDate(cols.find(c => /^\d{4}-\d{2}-\d{2}/.test(c) || /^\d{2}[.\-/]\d{2}[.\-/]\d{4}/.test(c)) || "");
      const amtStr = cols.find(c => /^-?\d+([\s ]\d{3})*[.,]\d{2}$/.test(c.trim()));
      if (!date || !amtStr) return null;
      const amount = parseAmount(amtStr);
      const desc = (cols.find(c => c.length > 3 && !/^\d/.test(c) && c !== amtStr) || "Import CSV").trim();
      if (!isFinite(amount)) return null;
      return { date, desc, amount };
    },
  },
];

/**
 * Wybierz parser dla danego pliku. Można wymusić konkretny bank przez `forceBankId`.
 */
function chooseParser(headerLine, forceBankId = null) {
  if (forceBankId) {
    const found = BANK_PARSERS.find(p => p.id === forceBankId);
    if (found) return found;
  }
  const cleanHeader = String(headerLine).replace(/^﻿/, "").toLowerCase().trim();
  for (const p of BANK_PARSERS) {
    if (p.id === "generic") continue; // generic zawsze na końcu
    if (p.detect(cleanHeader)) return p;
  }
  return BANK_PARSERS.find(p => p.id === "generic");
}

/**
 * Główna funkcja importu CSV.
 *
 * @param {string} text — treść pliku
 * @param {{ accId: number|string, forceBankId?: string }} options
 * @returns {{
 *   ok: boolean,
 *   parser: { id: string, name: string },
 *   transactions: Array<{ id, date, desc, amount, cat, acc }>,
 *   error?: string
 * }}
 */
function importCSV(text, { accId, forceBankId = null }) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { ok: false, transactions: [], parser: null, error: "Plik pusty lub brak nagłówka." };
  }

  const parser = chooseParser(lines[0], forceBankId);
  // Generic ma sep=null — wykryj na podstawie headera
  const sep = parser.sep || (lines[0].includes(";") ? ";" : ",");

  const out = [];
  // Pomiń linię nagłówka. Niektóre banki mają sekcję metadanych na górze
  // (np. PKO ma kilka linii z opisem konta) — jeśli pierwsza linia po nagłówku
  // nie parsuje się sensownie, próbujemy też linii 2-5 jako możliwe nagłówki.
  // Dla uproszczenia zostawiamy klasyczne "skip 1 line" — większość banków OK.
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i], sep).map(c => c.replace(/^"|"$/g, "").trim());
    const row = parser.parse(cols);
    if (!row) continue;
    out.push({
      id: Date.now() + i, // unikalne ID
      date: row.date,
      desc: row.desc,
      amount: row.amount,
      cat: detectCategory(row.desc, row.amount),
      acc: accId,
    });
  }

  if (out.length === 0) {
    return {
      ok: false,
      transactions: [],
      parser: { id: parser.id, name: parser.name },
      error: `Rozpoznano ${parser.name}, ale żadnej linii nie udało się sparsować.`,
    };
  }

  return { ok: true, transactions: out, parser: { id: parser.id, name: parser.name } };
}

// Lista banków do UI dropdown (ukryj 'generic' — pokazuje się jako "Inny")
const SUPPORTED_BANKS = BANK_PARSERS.map(p => ({ id: p.id, name: p.name }));

export { importCSV, detectCategory, SUPPORTED_BANKS };
