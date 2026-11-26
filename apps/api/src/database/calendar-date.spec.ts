import { calendarDate } from './calendar-date'

describe('calendarDate', () => {
  it('rend la date locale d’un objet Date — la forme que `pg` donne à une colonne DATE', () => {
    // Minuit LOCAL, comme le pilote le construit pour une colonne `date`.
    expect(calendarDate(new Date(2026, 7, 29, 0, 0, 0))).toBe('2026-08-29')
    expect(calendarDate(new Date(2026, 0, 2, 0, 0, 0))).toBe('2026-01-02')
  })

  it('ne recule JAMAIS d’un jour — le piège de `toISOString()` sur un minuit local', () => {
    // À l'est de Greenwich, `new Date(2026, 6, 24).toISOString()` s'écrit
    // « 2026-07-23T22:00:00Z » : le relevé du 24 se lirait le 23.
    expect(calendarDate(new Date(2026, 6, 24, 0, 0, 0))).toBe('2026-07-24')
  })

  it('laisse passer une chaîne déjà calendaire, et coupe un horodatage', () => {
    expect(calendarDate('2026-08-29')).toBe('2026-08-29')
    expect(calendarDate('2026-08-29T00:00:00.000Z')).toBe('2026-08-29')
  })

  it('rend null plutôt qu’une valeur de remplissage', () => {
    expect(calendarDate(null)).toBeNull()
    expect(calendarDate(undefined)).toBeNull()
    expect(calendarDate(new Date('pas une date'))).toBeNull()
    expect(calendarDate('Fri Aug 29')).toBeNull()
    expect(calendarDate('')).toBeNull()
  })
})
