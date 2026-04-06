const DEMO_TRANSACTIONS = [
  { id: 1, date: "2026-03-03", desc: "Biedronka", amount: -87.50, cat: "zakupy", acc: 1 },
  { id: 2, date: "2026-03-04", desc: "Wynagrodzenie", amount: 6500, cat: "przychód", acc: 1 },
  { id: 3, date: "2026-03-05", desc: "Paliwo Orlen", amount: -280, cat: "transport", acc: 1 },
  { id: 4, date: "2026-03-07", desc: "Netflix", amount: -49, cat: "rozrywka", acc: 1 },
  { id: 5, date: "2026-03-08", desc: "Restauracja", amount: -120, cat: "jedzenie", acc: 1 },
  { id: 6, date: "2026-03-10", desc: "Kawa", amount: -16, cat: "kawiarnia", acc: 1 },
  { id: 7, date: "2026-03-12", desc: "Siłownia", amount: -89, cat: "zdrowie", acc: 1 },
  { id: 8, date: "2026-03-13", desc: "Allegro zakupy", amount: -230, cat: "zakupy", acc: 1 },
  { id: 9, date: "2026-03-15", desc: "Premia kwartalna", amount: 1200, cat: "dodatkowe", acc: 1 },
  { id: 10, date: "2026-03-16", desc: "Żabka", amount: -34, cat: "zakupy", acc: 1 },
  { id: 11, date: "2026-03-18", desc: "Kawa", amount: -18, cat: "kawiarnia", acc: 1 },
  { id: 12, date: "2026-03-19", desc: "McDonald's", amount: -42, cat: "jedzenie", acc: 1 },
  { id: 13, date: "2026-03-20", desc: "Bukmacher STS", amount: -100, cat: "bukmacher", acc: 1 },
  { id: 14, date: "2026-03-21", desc: "Wygrana STS", amount: 340, cat: "bukmacherka", acc: 1 },
  { id: 15, date: "2026-03-22", desc: "Spotify", amount: -23, cat: "muzyka", acc: 1 },
  { id: 16, date: "2026-03-23", desc: "Lidl", amount: -95, cat: "zakupy", acc: 1 },
  { id: 17, date: "2026-03-25", desc: "Fryzjer", amount: -60, cat: "inne", acc: 1 },
  { id: 18, date: "2026-03-26", desc: "Paliwo BP", amount: -260, cat: "transport", acc: 1 },
  { id: 19, date: "2026-03-27", desc: "Apteka", amount: -48, cat: "zdrowie", acc: 1 },
  { id: 20, date: "2026-03-28", desc: "Pizza na wynos", amount: -58, cat: "jedzenie", acc: 1 },
];

const DEMO_PAYMENTS = [
  { id: 101, name: "Czynsz", amount: -2100, cat: "rachunki", acc: 1, freq: "monthly", dueDay: 10, type: "bill", shared: true, trackPaid: true },
  { id: 102, name: "Prąd", amount: -180, cat: "rachunki", acc: 1, freq: "monthly", dueDay: 15, type: "bill", shared: true, trackPaid: true },
  { id: 103, name: "Netflix", amount: -49, cat: "rozrywka", acc: 1, freq: "monthly", dueDay: 7, type: "sub", shared: false, trackPaid: true },
  { id: 104, name: "Spotify", amount: -23, cat: "muzyka", acc: 1, freq: "monthly", dueDay: 22, type: "sub", shared: false, trackPaid: true },
  { id: 105, name: "Siłownia", amount: -89, cat: "zdrowie", acc: 1, freq: "monthly", dueDay: 1, type: "bill", shared: false, trackPaid: true },
];

const DEMO_ACCOUNTS = [
  { id: 1, name: "PKO BP — bieżące", type: "checking", bank: "PKO BP", balance: 8420.50, color: "#3b82f6", iban: "" },
  { id: 2, name: "Oszczędności", type: "savings", bank: "mBank", balance: 15800, color: "#10b981", iban: "" },
];



export { DEMO_TRANSACTIONS, DEMO_PAYMENTS, DEMO_ACCOUNTS };
