import { assert, checkDefinedAndNotNull } from '@bellum/errors'
import { z } from 'zod'
import { DateTime, type DurationLikeObject } from 'luxon'
import { leftPad } from './string.js'
import { LOCALE, PARIS } from './constant.js'

export const formatToDate = (date: string | Date) => new Date(date)

export const calendarMonthSchema = z.object({
  year: z.number().int(),
  oneBasedMonth: z.number().int(),
})

/**
 * This utility type represents a month in the calendar.
 */
export type CalendarMonth = z.infer<typeof calendarMonthSchema>

export function isCalendarMonth(value: unknown): value is CalendarMonth {
  return calendarMonthSchema.safeParse(value).success
}

export function getLastDayOfMonth(month: CalendarMonth): CalendarDate {
  return getCalendarDateFromTimestamp(
    getStartOfCalendarDate({ ...month, oneBasedDay: 1 }, PARIS)
      .plus({ months: 1 })
      .minus({ days: 1 })
      .toMillis(),
    PARIS,
  )
}

export const calendarDateSchema = z.object({
  year: z.number().int(),
  oneBasedMonth: z.number().int(),
  oneBasedDay: z.number().int(),
})

/**
 * This utility type represents a date in the calendar, as opposed to a timestamp which represents a specific point in time.
 *
 * The type is not defined using the schema, because we need it to work with TSOA
 */
export type CalendarDate = {
  year: number
  oneBasedMonth: number
  oneBasedDay: number
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  return calendarDateSchema.safeParse(value).success
}

export class InvalidDateInputError extends Error {
  constructor(timestamp: number, zone: string) {
    super(`Invalid input timestamp=${timestamp}, zone=${zone}`)
  }
}

export function getCalendarDateFromTimestamp(timestamp: number, zone: string): CalendarDate {
  const date = getZonedDateTimeFromMillis(timestamp, zone)
  if (!date.isValid) {
    throw new InvalidDateInputError(timestamp, zone)
  }
  return {
    year: date.year,
    oneBasedMonth: date.month,
    oneBasedDay: date.day,
  }
}

export function getCalendarMonthFromTimestamp(timestamp: number, zone: string): CalendarMonth {
  const date = getZonedDateTimeFromMillis(timestamp, zone)
  if (!date.isValid) {
    throw new InvalidDateInputError(timestamp, zone)
  }
  return {
    year: date.year,
    oneBasedMonth: date.month,
  }
}

export class InvalidCalendarDateInputError extends Error {
  constructor(calendarDate: CalendarDate, zone: string) {
    super(
      `Invalid input calendarDate=${calendarDate.year},${calendarDate.oneBasedMonth},${calendarDate.oneBasedDay}, zone=${zone}`,
    )
  }
}

/**
 * @deprecated use getStartOfCalendarDate, which is clearer to understand and to find
 */
export const calendarDateToDateTime = getStartOfCalendarDate

export function getStartOfCalendarDate(calendarDate: CalendarDate, zone: string): DateTime {
  const date = DateTime.local(calendarDate.year, calendarDate.oneBasedMonth, calendarDate.oneBasedDay, { zone })
  if (!date.isValid) {
    throw new InvalidCalendarDateInputError(calendarDate, zone)
  }
  return date
}

export function formatYyyyMmDd({ year, oneBasedMonth, oneBasedDay }: CalendarDate): string {
  const yyyy = leftPad(year, 4)
  const mm = leftPad(oneBasedMonth, 2)
  const dd = leftPad(oneBasedDay, 2)
  return `${yyyy}-${mm}-${dd}`
}

export function formatDdMmYyyy({ year, oneBasedMonth, oneBasedDay }: CalendarDate): string {
  const yyyy = leftPad(year, 4)
  const mm = leftPad(oneBasedMonth, 2)
  const dd = leftPad(oneBasedDay, 2)
  return `${dd}/${mm}/${yyyy}`
}

export function formatYyyyMm({ year, oneBasedMonth }: CalendarMonth): string {
  const yyyy = leftPad(year, 4)
  const mm = leftPad(oneBasedMonth, 2)
  return `${yyyy}-${mm}`
}

export class InvalidCalendarDateFormatError extends Error {
  constructor(str: string) {
    super(`Attempted to parse a string that doesn't match required format yyyy-mm-dd: "${str}"`)
  }
}

export function parseYyyyMm(str: string): CalendarMonth {
  if (!/^[0-9]{4}-[0-9]{2}/g.test(str)) {
    throw new InvalidCalendarDateFormatError(str)
  }

  const numbers = str
    .split('-')
    .map(str => parseInt(str, 10))
    .filter(n => !Number.isNaN(n) && Number.isSafeInteger(n))

  const [year, oneBasedMonth] = numbers
  assert(year != null, 'year should be defined')
  assert(oneBasedMonth != null, 'oneBasedMonth should be defined')
  return { year, oneBasedMonth }
}

export function parseYyyyMmDd(str: string): CalendarDate {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}/g.test(str)) {
    throw new InvalidCalendarDateFormatError(str)
  }

  const numbers = str
    .split('-')
    .map(str => parseInt(str, 10))
    .filter(n => !Number.isNaN(n) && Number.isSafeInteger(n))

  const [year, oneBasedMonth, oneBasedDay] = numbers
  assert(year != null, 'year should be defined')
  assert(oneBasedMonth != null, 'oneBasedMonth should be defined')
  assert(oneBasedDay != null, 'oneBasedDay should be defined')
  return { year, oneBasedMonth, oneBasedDay }
}

export function calendarDateEqual(date1: CalendarDate, date2: CalendarDate): boolean {
  return (
    date1.oneBasedDay === date2.oneBasedDay && date1.oneBasedMonth === date2.oneBasedMonth && date1.year === date2.year
  )
}

/**
 * date1 < date2
 * */
export function calendarDateLt(date1: CalendarDate, date2: CalendarDate): boolean {
  return getStartOfCalendarDate(date1, PARIS) < getStartOfCalendarDate(date2, PARIS)
}

/**
 * date1 <= date2
 * */
export function calendarDateLte(date1: CalendarDate, date2: CalendarDate): boolean {
  return getStartOfCalendarDate(date1, PARIS) <= getStartOfCalendarDate(date2, PARIS)
}

/**
 * date1 > date2
 * */
export function calendarDateGt(date1: CalendarDate, date2: CalendarDate): boolean {
  return getStartOfCalendarDate(date1, PARIS) > getStartOfCalendarDate(date2, PARIS)
}

/**
 * date1 >= date2
 * */
export function calendarDateGte(date1: CalendarDate, date2: CalendarDate): boolean {
  return getStartOfCalendarDate(date1, PARIS) >= getStartOfCalendarDate(date2, PARIS)
}

export function calendarDateToString(
  calendarDate: CalendarDate,
  zone: string,
  format: 'DATE_FULL' | 'DATE_SHORT' | 'DATE_MED',
  language: string,
): string {
  const dateTime = getStartOfCalendarDate(calendarDate, zone)

  let luxonFormat
  switch (format) {
    case 'DATE_FULL':
      luxonFormat = DateTime.DATE_FULL
      break
    case 'DATE_SHORT':
      luxonFormat = DateTime.DATE_SHORT
      break
    case 'DATE_MED':
      luxonFormat = DateTime.DATE_MED
      break
  }

  return dateTime.setLocale(language).toLocaleString(luxonFormat)
}

export function addDurationToCalendarDate(
  calendarDate: CalendarDate,
  duration: DurationLikeObject,
  zone: string,
): CalendarDate {
  const luxonDate = getStartOfCalendarDate(calendarDate, zone)
  const luxonDatePlusDuration = luxonDate.plus(duration)
  return getCalendarDateFromTimestamp(luxonDatePlusDuration.toMillis(), zone)
}

export function getMinCalendarDate(date1: CalendarDate, date2: CalendarDate): CalendarDate {
  return calendarDateLt(date1, date2) ? date1 : date2
}

export function getMaxCalendarDate(date1: CalendarDate, date2: CalendarDate): CalendarDate {
  return calendarDateGt(date1, date2) ? date1 : date2
}

export function computeAgeFromCalendarDate(calendarDate: CalendarDate): number {
  return Math.abs(Math.trunc(getStartOfCalendarDate(calendarDate, PARIS).diffNow('years').years))
}

export function computeAgeFromFutureCalendarDate(birthDate: CalendarDate, futureDate: CalendarDate): number {
  return Math.abs(
    Math.trunc(getStartOfCalendarDate(futureDate, PARIS).diff(getStartOfCalendarDate(birthDate, PARIS), 'years').years),
  )
}

/**
 * Use this method rather than directly using `DateTime.fromMillis` to ensure that a zone is always used.
 * @param timestamp timestamp in milliseconds
 * @param zone optional zone to defined, if not defined, default zone is PARIS
 * @returns
 */
export function getZonedDateTimeFromMillis(timestamp: number, zone?: string): DateTime {
  return DateTime.fromMillis(timestamp, { zone: zone ?? PARIS })
}

export function formatTimestampDdMmYyyyAHhMm(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale('fr').toFormat('dd/MM/yyyy à HH:mm')
}

export function formatTimestampDdMmYyyy(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale('fr').toFormat('dd/MM/yyyy')
}

export function formatShortDate(date: Date | CalendarDate): string {
  if (isCalendarDate(date)) {
    return formatShortDate(getStartOfCalendarDate(date, PARIS).toJSDate())
  }
  return DateTime.fromJSDate(date).setZone(PARIS).setLocale('fr').toLocaleString(DateTime.DATE_SHORT)
}

export function formatPaymentRecurrence(paymentRecurrence: 'yearly' | 'monthly', gender: 'M' | 'F'): string {
  return paymentRecurrenceLabels[paymentRecurrence][gender]
}

const paymentRecurrenceLabels: Record<'yearly' | 'monthly', Record<'M' | 'F', string>> = {
  yearly: {
    M: 'annuel',
    F: 'annuelle',
  },
  monthly: {
    M: 'mensuel',
    F: 'mensuelle',
  },
}

export function formatTimestampYyyyMmDd(timestamp: number): string {
  return formatYyyyMmDd(getCalendarDateFromTimestamp(timestamp, PARIS))
}

export function formatTimestampDdMmYyyyHhMm(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale(LOCALE).toFormat('dd/MM/yyyy HH:mm')
}

export function formatTimestampDdMm(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale(LOCALE).toFormat('dd/MM')
}

export function formatTimestampMmYyyy(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale(LOCALE).toFormat('MM/yyyy')
}

export function formatTimestampToMonth(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale(LOCALE).toFormat('MMMM')
}

export function formatTimestampToYear(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).setLocale(LOCALE).toFormat('y')
}

export function formatTimestampToIso(timestamp: number): string {
  return checkDefinedAndNotNull(
    DateTime.fromMillis(timestamp).toUTC().startOf('second').toISO({ suppressMilliseconds: true }),
  )
}

export function getPreviousDay(timestamp: number): number {
  return DateTime.fromMillis(timestamp, { zone: PARIS }).minus({ day: 1 }).toMillis()
}

/**
 * Format a date as a relative date string (Aujourd'hui, Hier, Il y a Xj, or short date)
 * @param dateInput - The date to format (string or Date)
 * @returns The formatted relative date string
 */
export function formatRelativeDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
