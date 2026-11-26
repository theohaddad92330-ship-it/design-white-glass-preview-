/**
 * Format a number with Intl.NumberFormat
 */
export function formatNumber(value: number, locale: string = 'fr-FR', options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

/**
 * Format with 1 decimal (useful for percentages, ratios, etc.)
 */
export function formatOneDecimal(value: number, locale: string = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}

/**
 * Format as currency
 */
export function formatCurrency(value: number, currency: string = 'EUR', locale: string = 'fr-FR'): string {
  if (isNaN(value)) return '-'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value)
}

/**
 * Format as percentage
 */
export function formatPercentage(value: number, locale: string = 'fr-FR'): string {
  const normalized = value > 1 ? value / 100 : value
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(normalized)
}

/**
 * Format a price in cents as a currency
 */
export function formatPriceCents(value: number, locale: string = 'fr-FR'): string {
  return formatCurrency(value / 100, 'EUR', locale)
}
