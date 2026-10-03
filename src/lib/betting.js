// Moduł Zakłady: bukmacherzy, podatek, wynik kuponu i statystyki.
//
// Zakład to zwykła transakcja (module: "betting") z polem `bet`. Kwota transakcji =
// wynik netto kuponu: otwarty/przegrany = −stawka, wygrany/cash-out/zwrot = wypłata − stawka.
// Dzięki temu Start, salda kont i sync liczą zakłady bez osobnej logiki.
// Stare wpisy (kategorie bukmacher/bukmacherka bez pola `bet`) wchodzą do wyniku i obrotu.

import { round2, makeTx } from "./ledger.js";
import { amountForDisplay, txAmountForDisplay } from "./fx.js";

// Polska (bukmacherzy z licencją MF): 12% podatku od stawki, 10% od wygranej powyżej 2280 zł
const PL_TAX = { stakeTax: 0.12, winTaxRate: 0.10, winTaxThreshold: 2280 };

const BOOKMAKERS = [
  { id: "sts",         name: "STS",          pl: true },
  { id: "fortuna",     name: "Fortuna",      pl: true },
  { id: "betclic",     name: "Betclic",      pl: true },
  { id: "superbet",    name: "Superbet",     pl: true },
  { id: "lvbet",       name: "LV BET",       pl: true },
  { id: "totolotek",   name: "Totolotek",    pl: true },
  { id: "forbet",      name: "Forbet",       pl: true },
  { id: "etoto",       name: "eToto",        pl: true },
  { id: "fuksiarz",    name: "Fuksiarz",     pl: true },
  { id: "betfan",      name: "Betfan",       pl: true },
  { id: "noblebet",    name: "Noblebet",     pl: true },
  { id: "comeon",      name: "ComeOn",       pl: true },
  { id: "bet365",      name: "bet365" },
  { id: "pinnacle",    name: "Pinnacle" },
  { id: "betfair",     name: "Betfair" },
  { id: "williamhill", name: "William Hill" },
  { id: "paddypower",  name: "Paddy Power" },
  { id: "skybet",      name: "Sky Bet" },
  { id: "bwin",        name: "bwin" },
  { id: "unibet",      name: "Unibet" },
  { id: "betsson",     name: "Betsson" },
  { id: "betway",      name: "Betway" },
  { id: "betano",      name: "Betano" },
  { id: "1xbet",       name: "1xBet" },
  { id: "22bet",       name: "22Bet" },
  { id: "draftkings",  name: "DraftKings" },
  { id: "fanduel",     name: "FanDuel" },
  { id: "betmgm",      name: "BetMGM" },
];
const BOOKMAKER_BY_ID = Object.fromEntries(BOOKMAKERS.map(b => [b.id, b]));

const SPORTS = [
  { id: "football",   label: { en: "Football",   pl: "Piłka nożna" } },
  { id: "tennis",     label: { en: "Tennis",     pl: "Tenis" } },
  { id: "basketball", label: { en: "Basketball", pl: "Koszykówka" } },
  { id: "hockey",     label: { en: "Hockey",     pl: "Hokej" } },
  { id: "volleyball", label: { en: "Volleyball", pl: "Siatkówka" } },
  { id: "esports",    label: { en: "Esports",    pl: "E-sport" } },
  { id: "mma",        label: { en: "MMA / boxing", pl: "MMA / boks" } },
  { id: "other",      label: { en: "Other",      pl: "Inne" } },
];

const STATUSES = ["pending", "won", "lost", "void", "cashout"];

/** bet.bookmaker to id z listy albo własna nazwa wpisana przez użytkownika. */
function bookmakerName(idOrName) {
  if (!idOrName) return "";
  return BOOKMAKER_BY_ID[idOrName]?.name || String(idOrName);
}

function isPolishBookmaker(idOrName) {
  return !!BOOKMAKER_BY_ID[idOrName]?.pl;
}

/** Dla starych wpisów: "Kupon STS" → "sts". */
function detectBookmaker(desc) {
  const d = ` ${(desc || "").toLowerCase()} `;
  const hit = BOOKMAKERS.find(b => {
    const n = b.name.toLowerCase();
    return n.length >= 3 && new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`).test(d);
  });
  return hit ? hit.id : null;
}

function sportLabel(id, lang) {
  const s = SPORTS.find(x => x.id === id);
  return s ? (s.label[lang] || s.label.en) : "";
}

/** Potencjalna wypłata. Podatek PL: 12% od stawki, 10% od wygranej > 2280 zł (tylko w PLN). */
function potentialPayout({ stake, odds, taxed, currency = "PLN" }) {
  const s = Number(stake) || 0;
  const o = Number(odds) || 0;
  let payout = s * (taxed ? 1 - PL_TAX.stakeTax : 1) * o;
  if (taxed && currency === "PLN" && payout > PL_TAX.winTaxThreshold) payout *= 1 - PL_TAX.winTaxRate;
  return round2(payout);
}

/** Domyślna wypłata dla statusu — użytkownik może ją poprawić. */
function defaultPayout(status, bet) {
  if (status === "won")  return potentialPayout(bet);
  if (status === "void") return round2((Number(bet.stake) || 0) * (bet.taxed ? 1 - PL_TAX.stakeTax : 1));
  return null;
}

function usesPayout(status) {
  return status === "won" || status === "void" || status === "cashout";
}

/** Wynik netto kuponu w walucie zakładu. */
function betNet(bet) {
  const stake = Number(bet.stake) || 0;
  if (usesPayout(bet.status)) return round2((Number(bet.payout) || 0) - stake);
  return -stake; // otwarty albo przegrany
}

/**
 * Transakcja dla zakładu. `bet`: { bookmaker, event, sport, odds, stake, taxed, status,
 * payout, currency, settledAt }. rate = kurs waluty zakładu z dnia `date`.
 */
function buildBetTx(bet, { id, date, acc, rate }) {
  const net = betNet(bet);
  const clean = {
    bookmaker: bet.bookmaker || "",
    event: bet.event || "",
    sport: bet.sport || "other",
    odds: round2(bet.odds),
    stake: round2(bet.stake),
    taxed: !!bet.taxed,
    status: STATUSES.includes(bet.status) ? bet.status : "pending",
    payout: usesPayout(bet.status) ? round2(bet.payout) : null,
    currency: (bet.currency || "PLN").toUpperCase(),
    settledAt: bet.status === "pending" ? null : (bet.settledAt || date),
  };
  const name = bookmakerName(clean.bookmaker);
  return makeTx({
    id, date, acc, rate,
    desc: clean.event ? `${clean.event}${name ? ` · ${name}` : ""}` : (name || "Bet"),
    amount: net,
    currency: clean.currency,
    cat: net > 0 ? "bukmacherka" : "bukmacher",
    module: "betting",
    bet: clean,
  });
}

/**
 * Statystyki dla listy transakcji modułu Zakłady (już przefiltrowanej po okresie).
 * Kwoty w PLN-ekwiwalencie gotowym do fmtDisplay (waluta główna bez dryfu kursu).
 */
function bettingStats(txs) {
  const s = {
    net: 0, turnover: 0, settled: 0, wins: 0, losses: 0,
    pending: 0, exposure: 0, oddsSum: 0, oddsCount: 0, legacy: 0,
    byBookmaker: {}, bySport: {}, series: [],
  };
  const group = (map, key, stake, net) => {
    const g = map[key] || (map[key] = { key, count: 0, turnover: 0, net: 0 });
    g.count += 1; g.turnover += stake; g.net += net;
  };
  const settledRows = [];

  for (const tx of txs) {
    const b = tx.bet;
    if (b) {
      const stake = amountForDisplay(b.stake, b.currency, tx.fxRate);
      if (b.status === "pending") { s.pending += 1; s.exposure += stake; continue; }
      const net = txAmountForDisplay(tx);
      s.settled += 1; s.turnover += stake; s.net += net;
      if (b.status === "won" || (b.status === "cashout" && net > 0)) s.wins += 1;
      else if (b.status === "lost" || (b.status === "cashout" && net < 0)) s.losses += 1;
      if (b.status === "won" || b.status === "lost") { s.oddsSum += Number(b.odds) || 0; s.oddsCount += 1; }
      group(s.byBookmaker, b.bookmaker || "other", stake, net);
      group(s.bySport, b.sport || "other", stake, net);
      settledRows.push({ date: b.settledAt || tx.date, id: tx.id, net });
    } else {
      // Stary wpis: wydatek = stawka, przychód = wygrana
      const net = txAmountForDisplay(tx);
      const stake = net < 0 ? -net : 0;
      s.legacy += 1; s.turnover += stake; s.net += net;
      group(s.byBookmaker, detectBookmaker(tx.desc) || "other", stake, net);
      settledRows.push({ date: tx.date, id: tx.id, net });
    }
  }

  settledRows.sort((a, b) => a.date.localeCompare(b.date) || (a.id - b.id));
  let cum = 0;
  s.series = settledRows.map(r => { cum += r.net; return cum; });

  const finish = (map) => Object.values(map)
    .map(g => ({ ...g, roi: g.turnover > 0 ? g.net / g.turnover : null }))
    .sort((a, b) => b.turnover - a.turnover);
  return {
    ...s,
    roi: s.turnover > 0 ? s.net / s.turnover : null,
    winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null,
    avgOdds: s.oddsCount > 0 ? s.oddsSum / s.oddsCount : null,
    byBookmaker: finish(s.byBookmaker),
    bySport: finish(s.bySport),
  };
}

export {
  PL_TAX, BOOKMAKERS, SPORTS, STATUSES,
  bookmakerName, isPolishBookmaker, detectBookmaker, sportLabel,
  potentialPayout, defaultPayout, usesPayout, betNet, buildBetTx, bettingStats,
};
