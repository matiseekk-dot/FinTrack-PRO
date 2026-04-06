const DEMO_TRANSACTIONS = [
  { id: 1,  date: "2026-03-01", desc: "Wynagrodzenie",     amount: 5800,   cat: "przychód",  acc: 1 },
  { id: 2,  date: "2026-03-02", desc: "Biedronka",         amount: -112,   cat: "zakupy",    acc: 1 },
  { id: 3,  date: "2026-03-03", desc: "Paliwo",            amount: -245,   cat: "transport", acc: 1 },
  { id: 4,  date: "2026-03-05", desc: "Restauracja",       amount: -95,    cat: "jedzenie",  acc: 1 },
  { id: 5,  date: "2026-03-07", desc: "Netflix",           amount: -49,    cat: "rozrywka",  acc: 1 },
  { id: 6,  date: "2026-03-08", desc: "Kawa",              amount: -22,    cat: "kawiarnia", acc: 1 },
  { id: 7,  date: "2026-03-10", desc: "Apteka",            amount: -67,    cat: "zdrowie",   acc: 1 },
  { id: 8,  date: "2026-03-11", desc: "Lidl",              amount: -143,   cat: "zakupy",    acc: 1 },
  { id: 9,  date: "2026-03-12", desc: "Kawa",              amount: -18,    cat: "kawiarnia", acc: 1 },
  { id: 10, date: "2026-03-13", desc: "Transport miejski", amount: -110,   cat: "transport", acc: 1 },
  { id: 11, date: "2026-03-14", desc: "Zabka",             amount: -38,    cat: "zakupy",    acc: 1 },
  { id: 12, date: "2026-03-15", desc: "Premia",            amount: 900,    cat: "dodatkowe", acc: 1 },
  { id: 13, date: "2026-03-16", desc: "Fryzjer",           amount: -70,    cat: "inne",      acc: 1 },
  { id: 14, date: "2026-03-17", desc: "Allegro",           amount: -189,   cat: "zakupy",    acc: 1 },
  { id: 15, date: "2026-03-18", desc: "Spotify",           amount: -23,    cat: "muzyka",    acc: 1 },
  { id: 16, date: "2026-03-19", desc: "Kebab",             amount: -32,    cat: "jedzenie",  acc: 1 },
  { id: 17, date: "2026-03-20", desc: "Silownia",          amount: -89,    cat: "zdrowie",   acc: 1 },
  { id: 18, date: "2026-03-22", desc: "Paliwo",            amount: -230,   cat: "transport", acc: 1 },
  { id: 19, date: "2026-03-24", desc: "Kino",              amount: -55,    cat: "rozrywka",  acc: 1 },
  { id: 20, date: "2026-03-26", desc: "Biedronka",         amount: -98,    cat: "zakupy",    acc: 1 },
  { id: 21, date: "2026-03-27", desc: "McDonald's",        amount: -44,    cat: "jedzenie",  acc: 1 },
  { id: 22, date: "2026-03-28", desc: "Sprzedaz OLX",      amount: 350,    cat: "sprzedaz",  acc: 1 },
  { id: 23, date: "2026-03-29", desc: "Ubrania",           amount: -210,   cat: "ubrania",   acc: 1 },
  { id: 24, date: "2026-03-30", desc: "Kawa",              amount: -19,    cat: "kawiarnia", acc: 1 },
];

const DEMO_PAYMENTS = [
  { id: 101, name: "Czynsz",   amount: -1800, cat: "rachunki", acc: 1, freq: "monthly", dueDay: 10, type: "bill", shared: true,  trackPaid: true },
  { id: 102, name: "Prad",     amount: -160,  cat: "rachunki", acc: 1, freq: "monthly", dueDay: 15, type: "bill", shared: true,  trackPaid: true },
  { id: 103, name: "Internet", amount: -70,   cat: "rachunki", acc: 1, freq: "monthly", dueDay: 5,  type: "bill", shared: false, trackPaid: true },
  { id: 104, name: "Netflix",  amount: -49,   cat: "rozrywka", acc: 1, freq: "monthly", dueDay: 7,  type: "sub",  shared: false, trackPaid: true },
  { id: 105, name: "Spotify",  amount: -23,   cat: "muzyka",   acc: 1, freq: "monthly", dueDay: 22, type: "sub",  shared: false, trackPaid: true },
  { id: 106, name: "Silownia", amount: -89,   cat: "zdrowie",  acc: 1, freq: "monthly", dueDay: 1,  type: "bill", shared: false, trackPaid: true },
];

const DEMO_ACCOUNTS = [
  { id: 1, name: "Konto biezace", type: "checking", bank: "PKO BP", balance: 6240.50, color: "#3b82f6", iban: "" },
  { id: 2, name: "Oszczednosci",  type: "savings",  bank: "mBank",  balance: 12500,   color: "#10b981", iban: "" },
];

export { DEMO_TRANSACTIONS, DEMO_PAYMENTS, DEMO_ACCOUNTS };
