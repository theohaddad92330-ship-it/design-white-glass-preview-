import { asDay } from './day'

describe('asDay — une colonne `date` lue en SQL brut', () => {
  it('rend la chaîne telle quelle quand le pilote a déjà rendu une chaîne', () => {
    expect(asDay('2026-09-15')).toBe('2026-09-15')
  })

  /**
   * LE défaut de production du 01/09/2026 : `pg` rend une colonne `date` sous
   * forme d'objet `Date` (minuit LOCAL) en requête brute, là où toutes les
   * annotations du dépôt disent `string`. Un `${row.start_on}T00:00:00Z`
   * produisait alors « Tue Sep 15 2026 …T00:00:00Z », donc `Invalid Date`,
   * donc `RangeError: Invalid time value` — et tout le matching répondait 500.
   */
  it('convertit un objet Date en `YYYY-MM-DD`', () => {
    expect(asDay(new Date(2026, 8, 15, 0, 0, 0))).toBe('2026-09-15')
  })

  it('lit le jour dans le fuseau du lecteur, jamais en UTC', () => {
    // Minuit local un 1er janvier : `toISOString()` reculerait au 31 décembre
    // pour tout fuseau à l'est de Greenwich. Le jour rendu reste le 1er.
    expect(asDay(new Date(2027, 0, 1, 0, 0, 0))).toBe('2027-01-01')
  })

  it('garde le JOUR d’un horodatage complet, sans le reparser', () => {
    expect(asDay('2026-09-15T22:30:00.000Z')).toBe('2026-09-15')
  })

  it('rend `null` pour une absence — jamais une date inventée', () => {
    expect(asDay(null)).toBeNull()
    expect(asDay(undefined)).toBeNull()
  })

  it('rend `null` pour une date illisible plutôt que « Invalid Date »', () => {
    expect(asDay(new Date('pas une date'))).toBeNull()
  })
})
