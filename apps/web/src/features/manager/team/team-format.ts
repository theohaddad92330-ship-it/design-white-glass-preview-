import { appLocale } from '@/lib/locale'

/** Un montant en euros, sans décimales. Un montant absent est géré par l'appelant — jamais « 0 € » par défaut. */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    amount,
  )
}

/** Le mois nommé d'un `YYYY-MM-01` (« octobre 2026 »). */
export function monthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number)
  if (!year || !month) return periodMonth
  return new Intl.DateTimeFormat(appLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

/** « M » pour « Maëlle Lorquin » — l'initiale d'un avatar. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
