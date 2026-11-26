import { describe, expect, it } from 'vitest'
import { isSignalArchived, signalDateMs } from './account.js'
import { isFutureSignalDate, isSignalDatedToTheDay, parseSignalDate, signalSortMs } from './signal-date.js'

// The IA emits `recent_signals[].date` as FREE TEXT (see the docstring of
// apps/ia/app/services/signal_freshness.py: "2021", "10 mars 2021",
// "2021-03-10", "2023-2024", "Non daté précisément"). Coercing that through
// `new Date()` INVENTS precision — `new Date('2026')` is 2026-01-01, which is
// why the Veille showed six signals dated "1 janv.". This parser keeps only the
// precision actually present in the source.
describe('parseSignalDate — keeps the precision actually present', () => {
  it('reads a full ISO date as day precision', () => {
    expect(parseSignalDate('2026-07-15')).toEqual({ kind: 'day', year: 2026, month: 7, day: 15 })
    expect(parseSignalDate('2026/07/15')).toEqual({ kind: 'day', year: 2026, month: 7, day: 15 })
  })

  it('reads a year-month as MONTH precision — never day', () => {
    expect(parseSignalDate('2026-07')).toEqual({ kind: 'month', year: 2026, month: 7 })
  })

  it('reads a bare year as YEAR precision — never 1 January', () => {
    expect(parseSignalDate('2026')).toEqual({ kind: 'year', year: 2026 })
    expect(parseSignalDate('2025')).toEqual({ kind: 'year', year: 2025 })
  })

  it('reads a French month name without inventing a day', () => {
    // `new Date('juillet 2026')` silently returns 1 January 2026 — the month is
    // DISCARDED. That is not just invented precision, it is wrong data.
    expect(parseSignalDate('juillet 2026')).toEqual({ kind: 'month', year: 2026, month: 7 })
    expect(parseSignalDate('mars 2021')).toEqual({ kind: 'month', year: 2021, month: 3 })
    expect(parseSignalDate('10 mars 2021')).toEqual({ kind: 'day', year: 2021, month: 3, day: 10 })
  })

  it('reads an English month name too', () => {
    expect(parseSignalDate('July 2026')).toEqual({ kind: 'month', year: 2026, month: 7 })
    expect(parseSignalDate('15 July 2026')).toEqual({ kind: 'day', year: 2026, month: 7, day: 15 })
  })

  it('reads a year range as a range, not as a month', () => {
    // The legacy regex read "2023-2024" as month=20 → Date.UTC(2023, 19, 1) →
    // August 2024. A range is a range.
    expect(parseSignalDate('2023-2024')).toEqual({ kind: 'range', from: 2023, to: 2024 })
  })

  it('reads an English relative expression instead of leaking it raw', () => {
    expect(parseSignalDate('3 days ago')).toEqual({ kind: 'relative', amount: 3, unit: 'day' })
    expect(parseSignalDate('2 weeks ago')).toEqual({ kind: 'relative', amount: 2, unit: 'week' })
    expect(parseSignalDate('1 month ago')).toEqual({ kind: 'relative', amount: 1, unit: 'month' })
    expect(parseSignalDate('4 years ago')).toEqual({ kind: 'relative', amount: 4, unit: 'year' })
  })

  it('reads a French relative expression', () => {
    expect(parseSignalDate('il y a 3 jours')).toEqual({ kind: 'relative', amount: 3, unit: 'day' })
    expect(parseSignalDate('il y a 2 semaines')).toEqual({ kind: 'relative', amount: 2, unit: 'week' })
  })

  it('returns unknown for prose, empty and nullish values', () => {
    expect(parseSignalDate('Non daté précisément')).toEqual({ kind: 'unknown' })
    expect(parseSignalDate('')).toEqual({ kind: 'unknown' })
    expect(parseSignalDate(null)).toEqual({ kind: 'unknown' })
    expect(parseSignalDate(undefined)).toEqual({ kind: 'unknown' })
  })

  it('rejects an out-of-range month or day rather than clamping it', () => {
    expect(parseSignalDate('2026-13')).toEqual({ kind: 'year', year: 2026 })
    expect(parseSignalDate('2026-02-31')).toEqual({ kind: 'month', year: 2026, month: 2 })
  })

  it('anchors on the FIRST year, like signalDateMs', () => {
    expect(parseSignalDate('2024 (comptes déposés 2025-11)')).toEqual({ kind: 'year', year: 2024 })
  })
})

describe('signalSortMs — ordering only, never displayed', () => {
  const NOW = Date.UTC(2026, 6, 19) // 19 July 2026

  it('anchors a relative expression so a genuinely recent signal sorts first', () => {
    // The Blablacar contradiction: "3 days ago" was `Date.parse`d to NaN → 0, so
    // it sorted LAST and a year-only "2026" (→ 1 Jan) won the "latest" slot.
    const recent = signalSortMs(parseSignalDate('3 days ago'), NOW)
    const yearOnly = signalSortMs(parseSignalDate('2026'), NOW)
    expect(recent).not.toBeNull()
    expect(recent!).toBeGreaterThan(yearOnly!)
  })

  it('sorts a precise date above a vaguer one in the same year', () => {
    expect(signalSortMs(parseSignalDate('2026-07-15'), NOW)!).toBeGreaterThan(
      signalSortMs(parseSignalDate('2026'), NOW)!,
    )
  })

  it('returns null for an undatable value so it sorts last', () => {
    expect(signalSortMs(parseSignalDate('Non daté précisément'), NOW)).toBeNull()
  })
})

// #3928.2 — une date future ne s'affiche pas comme passée.
describe('isFutureSignalDate', () => {
  const now = new Date('2026-10-09T10:00:00Z')
  it('dit vrai pour un jour, un mois ou une année strictement postérieurs', () => {
    expect(isFutureSignalDate('2026-12-01', now)).toBe(true)
    expect(isFutureSignalDate('décembre 2026', now)).toBe(true)
    expect(isFutureSignalDate('2027', now)).toBe(true)
  })
  it('dit faux pour le passé, aujourd’hui, le mois courant, une date inconnue ou relative', () => {
    expect(isFutureSignalDate('2026-10-09', now)).toBe(false)
    expect(isFutureSignalDate('octobre 2026', now)).toBe(false)
    expect(isFutureSignalDate('2026', now)).toBe(false)
    expect(isFutureSignalDate('2 days ago', now)).toBe(false)
    expect(isFutureSignalDate('Non daté', now)).toBe(false)
    expect(isFutureSignalDate(null, now)).toBe(false)
  })
})

// #3917.r39 — une actualité est datée au JOUR ou retirée : année seule / mois seul / absente = non datée.
describe('isSignalDatedToTheDay — #3917.r39', () => {
  it.each(['2026-09-25', '25 septembre 2026', '2026-09-25T14:32:52.000+0000', 'il y a 3 jours'])('%s est datée', raw =>
    expect(isSignalDatedToTheDay(raw)).toBe(true),
  )
  it.each(['2026', 'septembre 2026', '2025-2026', 'Non daté précisément', '', null, undefined])(
    '%s n’est pas datée',
    raw => expect(isSignalDatedToTheDay(raw)).toBe(false),
  )
})

// #4716 — moitié TS de #4647 : « 23 octobre 2026 » ne se lit plus « 1er janvier ».
// Mêmes cas que apps/ia/tests/test_signal_freshness.py::test_month_in_letters_* — à garder alignés.
describe('signalDateMs — mois en toutes lettres, #4716', () => {
  const MONTHS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ]
  it.each(MONTHS.map((name, i) => [name, i] as const))('« 23 %s 2026 » rend le 23 %s', (name, i) => {
    expect(signalDateMs(`23 ${name} 2026`)).toBe(Date.UTC(2026, i, 23))
  })
  it('lit un mois sans jour, un « 1er », une abréviation', () => {
    expect(signalDateMs('octobre 2026')).toBe(Date.UTC(2026, 9, 31))
    expect(signalDateMs('1er mars 2021')).toBe(Date.UTC(2021, 2, 1))
    expect(signalDateMs('3 janv. 2026')).toBe(Date.UTC(2026, 0, 3))
  })
  it('lit toujours les deux formats numériques', () => {
    expect(signalDateMs('2021-03-10')).toBe(Date.UTC(2021, 2, 10))
    expect(signalDateMs('2021/03')).toBe(Date.UTC(2021, 2, 31))
  })
  it('garde la règle d’ancrage : la première année gagne, une date postérieure entre parenthèses est ignorée', () => {
    expect(signalDateMs('2024 (comptes déposés 2025-11)')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2024 (comptes déposés en novembre 2025)')).toBe(Date.UTC(2024, 11, 31))
  })
  it('sait dire NON : un mot qui n’est pas un mois est ignoré, pas d’année → null', () => {
    expect(signalDateMs('2026')).toBe(Date.UTC(2026, 11, 31))
    expect(signalDateMs('exercice 2026')).toBe(Date.UTC(2026, 11, 31))
    expect(signalDateMs('Non daté précisément')).toBeNull()
    expect(signalDateMs(null)).toBeNull()
  })
})

// #4832 — une date INCOMPLÈTE vaut la FIN de sa période (#4647, tranché par Louis le 27/10/2026), comme
// `read_signal_date` côté IA. Mêmes cas que apps/ia/tests/test_signal_freshness.py — à garder alignés.
describe('signalDateMs — une date incomplète vaut la fin de sa période, #4832', () => {
  it('une année seule vaut le 31 décembre, jamais le 1er janvier', () => {
    expect(signalDateMs('2024')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2026')).toBe(Date.UTC(2026, 11, 31))
  })
  it('un mois sans jour vaut son dernier jour RÉEL (28/29/30/31)', () => {
    expect(signalDateMs('octobre 2026')).toBe(Date.UTC(2026, 9, 31))
    expect(signalDateMs('février 2024')).toBe(Date.UTC(2024, 1, 29))
    expect(signalDateMs('2023-02')).toBe(Date.UTC(2023, 1, 28))
    expect(signalDateMs('avril 2025')).toBe(Date.UTC(2025, 3, 30))
  })
  it('une plage d’années vaut la fin de l’année de FIN — jamais « mois 20 »', () => {
    expect(signalDateMs('2023-2024')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2021–2022')).toBe(Date.UTC(2022, 11, 31))
  })
  it('un jour donné reste ce jour', () => {
    expect(signalDateMs('2026-10-23')).toBe(Date.UTC(2026, 9, 23))
  })
  it('« 2024 » seul n’est plus archive quand l’IA le dit current (today 2026-07-14, seuil 730 j)', () => {
    const today = Date.UTC(2026, 6, 14)
    expect(isSignalArchived({ date: '2024' }, today)).toBe(false)
    expect(isSignalArchived({ date: '2021-2022' }, today)).toBe(true)
  })
})

describe('signalDateMs — fin de période, #4832 (miroir de read_signal_date, #4647)', () => {
  const NOW = Date.UTC(2026, 6, 14)
  it.each([
    ['2024', Date.UTC(2024, 11, 31)],
    ['2023-2024', Date.UTC(2024, 11, 31)],
    ['2021-2022', Date.UTC(2022, 11, 31)],
    ['2026', Date.UTC(2026, 11, 31)],
    ['octobre 2026', Date.UTC(2026, 9, 31)],
  ])('« %s » → fin de période, les mêmes valeurs que Python', (raw, expected) => {
    expect(signalDateMs(raw)).toBe(expected)
  })

  it('« 2024 » est current à 2026-07-14, comme côté IA (730 j) — plus archive', () => {
    expect(isSignalArchived({ date: '2024' }, NOW)).toBe(false)
  })

  it('négatif : « 2021-2022 » reste archive — la garde sait toujours dire NON', () => {
    expect(isSignalArchived({ date: '2021-2022' }, NOW)).toBe(true)
  })
})
