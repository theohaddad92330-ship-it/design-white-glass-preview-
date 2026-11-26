import { describe, expect, it } from 'vitest'
import {
  formatYyyyMmDd,
  formatDdMmYyyy,
  parseYyyyMmDd,
  parseYyyyMm,
  calendarDateEqual,
  calendarDateLt,
  calendarDateGt,
  isCalendarDate,
  type CalendarDate,
} from './date.js'

describe('formatYyyyMmDd', () => {
  it('should format a calendar date', () => {
    expect(formatYyyyMmDd({ year: 2026, oneBasedMonth: 4, oneBasedDay: 15 })).toBe('2026-04-15')
  })
})

describe('formatDdMmYyyy', () => {
  it('should format a calendar date', () => {
    expect(formatDdMmYyyy({ year: 2026, oneBasedMonth: 4, oneBasedDay: 15 })).toBe('15/04/2026')
  })
})

describe('parseYyyyMmDd', () => {
  it('should parse a valid date string', () => {
    const date = parseYyyyMmDd('2026-04-15')
    expect(date).toEqual({ year: 2026, oneBasedMonth: 4, oneBasedDay: 15 })
  })

  it('should throw on invalid format', () => {
    expect(() => parseYyyyMmDd('not-a-date')).toThrow()
  })
})

describe('parseYyyyMm', () => {
  it('should parse a valid month string', () => {
    const month = parseYyyyMm('2026-04')
    expect(month).toEqual({ year: 2026, oneBasedMonth: 4 })
  })
})

describe('calendarDateEqual', () => {
  it('should compare equal dates', () => {
    const a: CalendarDate = { year: 2026, oneBasedMonth: 4, oneBasedDay: 15 }
    const b: CalendarDate = { year: 2026, oneBasedMonth: 4, oneBasedDay: 15 }
    expect(calendarDateEqual(a, b)).toBe(true)
  })

  it('should compare different dates', () => {
    const a: CalendarDate = { year: 2026, oneBasedMonth: 4, oneBasedDay: 15 }
    const b: CalendarDate = { year: 2026, oneBasedMonth: 4, oneBasedDay: 16 }
    expect(calendarDateEqual(a, b)).toBe(false)
  })
})

describe('calendarDateLt / calendarDateGt', () => {
  const earlier: CalendarDate = { year: 2026, oneBasedMonth: 1, oneBasedDay: 1 }
  const later: CalendarDate = { year: 2026, oneBasedMonth: 12, oneBasedDay: 31 }

  it('should detect earlier date', () => {
    expect(calendarDateLt(earlier, later)).toBe(true)
    expect(calendarDateLt(later, earlier)).toBe(false)
  })

  it('should detect later date', () => {
    expect(calendarDateGt(later, earlier)).toBe(true)
    expect(calendarDateGt(earlier, later)).toBe(false)
  })
})

describe('isCalendarDate', () => {
  it('should validate a valid calendar date', () => {
    expect(isCalendarDate({ year: 2026, oneBasedMonth: 4, oneBasedDay: 15 })).toBe(true)
  })

  it('should reject invalid values', () => {
    expect(isCalendarDate({ year: 2026 })).toBe(false)
    expect(isCalendarDate('not-a-date')).toBe(false)
  })
})
