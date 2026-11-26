// Formateurs d'affichage des écrans Missions › Factures / Encaissements — UN endroit (GA-26).

/** Des centimes, en euros entiers et dans la langue du lecteur. Les centimes
 *  d'une facture de douze mille euros n'aident personne à décider. */
export function formatEuros(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

/** `YYYY-MM-DD` → le mois, dans la langue du lecteur. */
export function formatMonth(periodMonth: string, locale: string): string {
  const date = new Date(`${periodMonth.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? periodMonth
    : date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/**
 * `YYYY-MM-DD` → date locale.
 *
 * Midi et non minuit : `new Date('2026-10-05')` est lu en UTC, et affiché dans
 * un fuseau en retard il rend le 4 octobre. Une échéance datée de la veille fait
 * douter du calcul entier.
 */
export function formatDay(day: string, locale: string): string {
  const date = new Date(`${day.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(locale)
}
