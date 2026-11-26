/**
 * La période de l'écran Finance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST TOUJOURS VISIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le seul défaut que le dossier du 26/08 qualifie de GRAVE sur les neuf
 * maquettes : « aucun sélecteur de période visible. Un écran financier dont on
 * ne voit pas la période se lit de travers dès qu'il est partagé ou exporté. »
 *
 * Il rejette aussi sa forme la plus lourde — « le sélecteur de période en
 * grande carte coûte une rangée entière » —, d'où une simple liste déroulante
 * dans la barre d'outils.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUT EN UTC
 * ─────────────────────────────────────────────────────────────────────────────
 * Un calcul de mois en heure locale décale d'un cran pour tout navigateur à
 * l'ouest de Greenwich le premier jour du mois : le 1er août à 00:00 UTC est le
 * 31 juillet à Los Angeles, et l'écran ouvrirait sur juillet en annonçant août.
 */

/** Douze mois : au-delà, la liste déroulante devient une archive, et l'écran
 *  n'est pas fait pour ça. */
const DEFAULT_PERIOD_COUNT = 12

/** Les mois sélectionnables, du plus récent au plus ancien, en `AAAA-MM`. */
export function financePeriods(now: Date, count: number = DEFAULT_PERIOD_COUNT): string[] {
  const months: string[] = []
  for (let back = 0; back < count; back += 1) {
    months.push(monthKey(now, back))
  }
  return months
}

/**
 * Le mois sur lequel l'écran s'ouvre : le PRÉCÉDENT.
 *
 * C'est exactement le défaut du serveur (`previousMonth()` dans
 * `finance.controller.ts`). Ouvrir sur le mois en cours ferait dire à cet écran
 * autre chose que le panneau du cockpit, sur les mêmes chiffres et sans que
 * rien ne l'explique — la façon la plus sûre de faire douter des deux.
 */
export function defaultFinancePeriod(now: Date): string {
  return monthKey(now, 1)
}

/** « août 2026 ». Une valeur illisible sort telle quelle : « Invalid Date »
 *  ferait chercher un défaut d'affichage là où c'est la donnée qui manque. */
export function formatFinancePeriod(month: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  if (Number.isNaN(date.getTime())) return month
  // `timeZone: 'UTC'` : sans lui, le formateur reconvertit en heure locale et
  // rend « juillet 2026 » pour la clé « 2026-08 » à l'ouest de Greenwich.
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

/**
 * Le mois qui précède un mois DONNÉ — pas « maintenant », un mois choisi.
 *
 * C'est la seule brique qui manquait au delta période/période de
 * `FinancePanel` (manque n°2 du lot du 30/08) : le panneau interroge déjà le
 * serveur avec `month`, il lui suffit de le refaire avec `previousMonthOf(month)`
 * pour obtenir la période de comparaison — sans dupliquer le calcul de date.
 *
 * ⚠️ Une valeur illisible sort telle quelle, comme `formatFinancePeriod` : un
 * mois mal formé doit rester repérable, jamais devenir un « Invalid Date »
 * silencieux qui décale toute la comparaison.
 */
export function previousMonthOf(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 - 1, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthKey(now: Date, monthsBack: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
