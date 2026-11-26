import { describe, expect, it } from 'vitest'
import {
  isCalendarDate,
  parseRelativeDeadline,
  relativeDeadlineDays,
  resolveRelativeDeadline,
} from './relative-deadline.js'

/** Une base FIXE : un test qui lit l'horloge ne mesure plus ce qu'il croit. */
const BASE = new Date('2026-08-27T00:00:00.000Z')

describe('parseRelativeDeadline', () => {
  it('lit les trois unités', () => {
    expect(parseRelativeDeadline('J+1')).toEqual({ months: 0, weeks: 0, days: 1 })
    expect(parseRelativeDeadline('J+10')).toEqual({ months: 0, weeks: 0, days: 10 })
    expect(parseRelativeDeadline('S+5')).toEqual({ months: 0, weeks: 5, days: 0 })
    expect(parseRelativeDeadline('M+9')).toEqual({ months: 9, weeks: 0, days: 0 })
  })

  it('lit les formes composées, dans les deux ordres', () => {
    expect(parseRelativeDeadline('M+3S+2')).toEqual({ months: 3, weeks: 2, days: 0 })
    expect(parseRelativeDeadline('S+2 J+3')).toEqual({ months: 0, weeks: 2, days: 3 })
    expect(parseRelativeDeadline('M+1 S+1 J+1')).toEqual({ months: 1, weeks: 1, days: 1 })
  })

  it('tolère la casse, les espaces et les unités anglaises', () => {
    expect(parseRelativeDeadline('  j + 10 ')).toEqual({ months: 0, weeks: 0, days: 10 })
    expect(parseRelativeDeadline('D+10')).toEqual({ months: 0, weeks: 0, days: 10 })
    expect(parseRelativeDeadline('W+2')).toEqual({ months: 0, weeks: 2, days: 0 })
  })

  it('accepte J+0 — « aujourd’hui » est une échéance, pas une absence', () => {
    expect(parseRelativeDeadline('J+0')).toEqual({ months: 0, weeks: 0, days: 0 })
  })

  it('REFUSE tout ce qui n’est pas un jeton relatif — jamais de repli deviné', () => {
    for (const value of [
      '',
      '   ',
      'Semaine 1',
      'ASAP',
      'J+',
      'J-3',
      'X+3',
      'J+3 puis relancer',
      '2026-08-29',
      'J+999',
    ]) {
      expect(parseRelativeDeadline(value), value).toBeNull()
    }
    expect(parseRelativeDeadline(null)).toBeNull()
    expect(parseRelativeDeadline(undefined)).toBeNull()
  })

  it('refuse la même unité deux fois — « J+1J+2 » ne veut rien dire de sûr', () => {
    expect(parseRelativeDeadline('J+1J+2')).toBeNull()
  })
})

describe('relativeDeadlineDays', () => {
  it('rend un horizon en jours, pour le dire en clair sans inventer de date', () => {
    expect(relativeDeadlineDays('J+10')).toBe(10)
    expect(relativeDeadlineDays('S+2')).toBe(14)
    // Un mois est CALENDAIRE : l'horizon en jours est une approximation
    // assumée, employée pour dire « sous ~3 mois », jamais pour poser une date.
    expect(relativeDeadlineDays('M+1')).toBe(30)
    expect(relativeDeadlineDays('M+3S+2')).toBe(104)
    expect(relativeDeadlineDays('Semaine 1')).toBeNull()
  })
})

describe('resolveRelativeDeadline', () => {
  it('ajoute des jours calendaires', () => {
    expect(resolveRelativeDeadline('J+1', BASE)).toBe('2026-08-28')
    expect(resolveRelativeDeadline('J+10', BASE)).toBe('2026-09-06')
    expect(resolveRelativeDeadline('J+0', BASE)).toBe('2026-08-27')
  })

  it('compte une semaine pour sept jours', () => {
    expect(resolveRelativeDeadline('S+5', BASE)).toBe('2026-10-01')
  })

  it('ajoute des mois CALENDAIRES, puis les semaines et les jours', () => {
    expect(resolveRelativeDeadline('M+9', BASE)).toBe('2027-05-27')
    expect(resolveRelativeDeadline('M+3S+2', BASE)).toBe('2026-12-11')
  })

  it('borne un jour de mois qui n’existe pas sur le mois d’arrivée', () => {
    // 31/01 + 1 mois : le 31 février n'existe pas — on rend le 28, jamais un
    // débordement silencieux sur mars (ce que fait `setMonth`).
    expect(resolveRelativeDeadline('M+1', new Date('2026-01-31T00:00:00.000Z'))).toBe('2026-02-28')
  })

  it('un jeton illisible ne produit JAMAIS de date', () => {
    expect(resolveRelativeDeadline('Semaine 1', BASE)).toBeNull()
    expect(resolveRelativeDeadline('J+14 ou plus', BASE)).toBeNull()
    expect(resolveRelativeDeadline(null, BASE)).toBeNull()
  })

  it('une base illisible ne produit JAMAIS de date — même sur un jeton valide', () => {
    expect(resolveRelativeDeadline('J+10', new Date('pas une date'))).toBeNull()
    expect(resolveRelativeDeadline('J+10', null)).toBeNull()
  })
})

describe('isCalendarDate', () => {
  it('ne reconnaît qu’une date calendaire ISO RÉELLE', () => {
    expect(isCalendarDate('2026-08-29')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false) // 2026 n'est pas bissextile
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('J+10')).toBe(false)
    // La forme que produisait `String(new Date(…)).slice(0, 10)` — c'est elle
    // qui affichait des échéances en 2001.
    expect(isCalendarDate('Fri Aug 29')).toBe(false)
    expect(isCalendarDate(null)).toBe(false)
  })
})
