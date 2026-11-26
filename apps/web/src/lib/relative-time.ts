import { i18n } from '@/i18n'

/**
 * Locale-aware "time ago" for REAL timestamps (ISO strings / epoch ms).
 *
 * `timeAgo` from `@bellum/utils` hardcodes French ("il y a 3j", "hier"), so it
 * rendered French into the English UI. `Intl.RelativeTimeFormat` handles both
 * languages — including plural forms and the "yesterday"/"hier" special case —
 * without a translation key per unit.
 *
 * For the LLM's free-text signal dates use `formatSignalDate` instead: those
 * are not timestamps and must not be coerced into one.
 */
export function formatTimeAgo(value: string | number | Date, nowMs: number = Date.now()): string {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(ms)) return ''

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const elapsedSeconds = Math.round((ms - nowMs) / 1000)
  const magnitude = Math.abs(elapsedSeconds)

  for (const [unit, seconds] of UNITS) {
    if (magnitude >= seconds || unit === 'second') {
      return format.format(Math.round(elapsedSeconds / seconds), unit)
    }
  }
  return format.format(elapsedSeconds, 'second')
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]
