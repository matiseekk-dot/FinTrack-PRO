/**
 * Kalkulatory polskiego systemu emerytalnego - limity 2026.
 * 
 * Źródło limitów:
 * - IKE/IKZE: obwieszczenie Ministra Rodziny, Pracy i Polityki Społecznej
 *   z 10/17 listopada 2025 (Monitor Polski). Limit obowiązuje od 1 stycznia 2026.
 * - Minimum wynagrodzenie 2026: rozporządzenie Rady Ministrów z 11 września 2025
 *   (Dz.U. 2025 poz. 1242), 4806 zł brutto/mies.
 * - Limity zmieniają się co rok - aktualizuj w listopadzie po obwieszczeniu MRPiPS.
 */

// === LIMITY 2026 === (oficjalne wartości z Monitora Polskiego)
const LIMITS_2026 = {
  // IKE = 3x prognozowane przeciętne miesięczne wynagrodzenie (9420 zł × 3)
  ike: 28260,        // 2025 było 26 019

  // IKZE standardowy = 1.2x przeciętne miesięczne wynagrodzenie (9420 × 1.2)
  ikze: 11304,       // 2025 było 10 407,60

  // IKZE dla samozatrudnionych = 1.8x przeciętne (9420 × 1.8)
  ikzeSelfEmployed: 16956,  // 2025 było 15 611,40

  // PPK - państwo dokłada rocznie
  ppkGovAnnual: 240,  // "dopłata roczna" - stała kwota
  ppkGovWelcome: 250, // "wpłata powitalna" - jednorazowo po 3 msc

  // Progi podatkowe 2026 (bez zmian od 2022)
  taxLow: 0.12,       // 12% do 120k
  taxHigh: 0.32,      // 32% powyżej 120k
  ikzeTaxOnWithdrawal: 0.10,  // zryczałtowany 10% przy wypłacie z IKZE po 65 r.ż.
};

// Minimum wynagrodzenie 2026 = 4806 zł brutto (Dz.U. 2025 poz. 1242).
// Minimalne wymagane wpłaty żeby dostać dopłatę roczną PPK = 3,5% × 6 × min wynagrodzenie.
const MIN_WAGE_2026 = 4806;
const PPK_MIN_FOR_BONUS = Math.round(0.035 * 6 * MIN_WAGE_2026);  // ~1009 zł/rok

/**
 * Kalkulator oszczędności podatkowej z IKZE.
 * IKZE pozwala odliczyć wpłaty od dochodu → zmniejsza podatek PIT.
 */
function calculateIKZETaxSavings(annualContribution, taxBracket = "low") {
  const limit = LIMITS_2026.ikze;
  const actualContribution = Math.min(annualContribution, limit);
  const overLimit = Math.max(0, annualContribution - limit);
  
  const taxRate = taxBracket === "high" ? LIMITS_2026.taxHigh : LIMITS_2026.taxLow;
  const taxSavings = Math.round(actualContribution * taxRate);
  
  // Net cost = wpłacasz X, ale odzyskujesz Y przy zeznaniu rocznym
  const netCost = actualContribution - taxSavings;
  
  // Przy wypłacie po 65 r.ż. - 10% ryczałt
  const futureTaxOnWithdrawal = Math.round(actualContribution * LIMITS_2026.ikzeTaxOnWithdrawal);
  
  return {
    contribution: actualContribution,
    overLimit,
    taxBracket,
    taxRate,
    taxSavings,                  // ile "zarabiasz" na tym że wpłaciłeś
    netCost,                     // faktyczny koszt wpłaty
    futureTaxOnWithdrawal,       // ile zapłacisz podatku przy wypłacie
    netBenefit: taxSavings - futureTaxOnWithdrawal,  // netto zysk
    limit,
    remainingLimit: Math.max(0, limit - actualContribution),
  };
}

/**
 * Kalkulator IKE - brak odliczenia od dochodu, ale zwolnienie z 19% Belki przy wypłacie.
 */
function calculateIKEBenefit(currentBalance, expectedReturnRate = 0.05, yearsUntilWithdrawal = 30) {
  const limit = LIMITS_2026.ike;
  // Przybliżone zyski z inwestycji po X latach
  const futureValue = currentBalance * Math.pow(1 + expectedReturnRate, yearsUntilWithdrawal);
  const profit = futureValue - currentBalance;
  const belkaIfNotIKE = Math.round(profit * 0.19);  // co zapłaciłbyś bez IKE
  
  return {
    currentBalance,
    futureValue: Math.round(futureValue),
    profit: Math.round(profit),
    belkaTaxAvoided: belkaIfNotIKE,
    limit,
    remainingLimit: Math.max(0, limit - currentBalance),  // uwaga: to nie rocznie, to życiowe
    note: "IKE ma limit roczny na wpłaty, nie na saldo",
  };
}

/**
 * Kalkulator PPK - ile dostałeś "darmowo" od pracodawcy i państwa.
 */
function calculatePPKBonus(yourContribution, employerContribution, yearsActive = 1) {
  // Państwo dokłada 240 zł rocznie + 250 zł one-time welcome
  const governmentTotal = (yearsActive * LIMITS_2026.ppkGovAnnual) + LIMITS_2026.ppkGovWelcome;
  const employerTotal = employerContribution * yearsActive;
  const yourTotal = yourContribution * yearsActive;
  
  // "Free money" - co byś stracił gdybyś się wypisał
  const freeMoney = employerTotal + governmentTotal;
  const freeMoneyRatio = yourTotal > 0 ? (freeMoney / yourTotal) : 0;
  
  return {
    yourContribution: yourTotal,
    employerContribution: employerTotal,
    governmentContribution: governmentTotal,
    freeMoney,
    freeMoneyRatio,    // np. 1.75 = na każdą Twoją złotówkę dostajesz 1.75 zł
    totalInvested: yourTotal + freeMoney,
  };
}

/**
 * Główny generator insightów emerytalnych - dla Dashboardu / Analizy.
 */
function generateRetirementInsights(accounts, salary = null) {
  if (!Array.isArray(accounts)) return [];
  
  const insights = [];
  
  const ppk  = accounts.find(a => a.type === "ppk");
  const ike  = accounts.find(a => a.type === "ike");
  const ikze = accounts.find(a => a.type === "ikze");
  
  // IKE - ile jeszcze można wpłacić
  if (ike) {
    const ikeAnnual = ike.annualContribution || 0;
    const remaining = Math.max(0, LIMITS_2026.ike - ikeAnnual);
    if (remaining > 1000) {
      insights.push({
        type: "ike_limit_not_used",
        priority: 7,
        icon: "🏛️",
        title: `Limit IKE: wykorzystano ${Math.round(ikeAnnual / LIMITS_2026.ike * 100)}%`,
        desc: `Możesz dopłacić jeszcze ${remaining.toLocaleString("pl-PL")} zł w 2026. Zyski będą zwolnione z 19% podatku Belki.`,
        color: "#14b8a6",
      });
    }
  } else {
    // User nie ma IKE wcale
    insights.push({
      type: "ike_missing",
      priority: 5,
      icon: "💡",
      title: "Nie masz IKE?",
      desc: `Możesz wpłacić do ${LIMITS_2026.ike.toLocaleString("pl-PL")} zł rocznie i uniknąć 19% podatku od zysków z inwestycji.`,
      color: "#14b8a6",
    });
  }
  
  // IKZE - oszczędność podatkowa
  if (ikze) {
    const ikzeAnnual = ikze.annualContribution || 0;
    if (ikzeAnnual > 0) {
      const calc = calculateIKZETaxSavings(ikzeAnnual, "low");
      insights.push({
        type: "ikze_savings",
        priority: 8,
        icon: "💰",
        title: `IKZE: zaoszczędzisz ${calc.taxSavings.toLocaleString("pl-PL")} zł na podatku`,
        desc: `Wpłacając ${ikzeAnnual.toLocaleString("pl-PL")} zł odliczysz to od dochodu w PIT. Faktyczny koszt: ${calc.netCost.toLocaleString("pl-PL")} zł.`,
        color: "#0891b2",
      });
    }
    
    const remaining = Math.max(0, LIMITS_2026.ikze - ikzeAnnual);
    if (remaining > 500) {
      insights.push({
        type: "ikze_limit_not_used",
        priority: 6,
        icon: "📊",
        title: `IKZE: jeszcze ${remaining.toLocaleString("pl-PL")} zł do wykorzystania`,
        desc: "Każda wpłata zmniejsza Twój podatek PIT za 2026.",
        color: "#0891b2",
      });
    }
  } else {
    insights.push({
      type: "ikze_missing",
      priority: 6,
      icon: "💡",
      title: "Nie masz IKZE?",
      desc: `Wpłata do ${LIMITS_2026.ikze.toLocaleString("pl-PL")} zł rocznie zmniejsza podatek PIT o 12-32%. To jak rabat od państwa za oszczędzanie.`,
      color: "#0891b2",
    });
  }
  
  // PPK - darmowa kasa
  if (ppk && ppk.balance > 0) {
    const ppkBonus = ppk.freeMoneySoFar || 0;
    if (ppkBonus > 500) {
      insights.push({
        type: "ppk_free_money",
        priority: 9,
        icon: "🎁",
        title: `Z PPK dostałeś ${ppkBonus.toLocaleString("pl-PL")} zł "za darmo"`,
        desc: "Tyle dodał pracodawca i państwo. Jeśli się wypiszesz z PPK, to wszystko przepada.",
        color: "#06b6d4",
      });
    }
  }
  
  return insights;
}

export {
  LIMITS_2026,
  calculateIKZETaxSavings,
  calculateIKEBenefit,
  calculatePPKBonus,
  generateRetirementInsights,
};
