import { describe, expect, it } from 'vitest'
import { ENDING_HORIZONS, endsWithinDays } from './ending-horizon'

/**
 * #4197 (L6) — « Fin sous 30 j · 60 j · 90 j » : le même périmètre que les
 * compteurs `missions_ending_30/60/90` (#4193) — la date de fin tombe dans les N
 * prochains jours. Une mission SANS date de fin n'est dans aucune fenêtre : son
 * absence se dit ailleurs (filtre « Fin » › « Sans date »), pas ici.
 */
const TODAY = new Date(2026, 9, 15)

describe('endsWithinDays', () => {
  it('propose trois horizons, dans l’ordre', () => {
    expect([...ENDING_HORIZONS]).toEqual([30, 60, 90])
  })

  it('inclut aujourd’hui et le Nème jour', () => {
    expect(endsWithinDays('2026-10-15', 30, TODAY)).toBe(true)
    expect(endsWithinDays('2026-11-14', 30, TODAY)).toBe(true)
  })

  it('exclut le lendemain du dernier jour', () => {
    expect(endsWithinDays('2026-11-15', 30, TODAY)).toBe(false)
  })

  it('exclut une fin déjà passée', () => {
    expect(endsWithinDays('2026-10-14', 90, TODAY)).toBe(false)
  })

  it('les fenêtres sont cumulatives : une fin à 45 j est sous 60 j et 90 j, pas sous 30 j', () => {
    expect(endsWithinDays('2026-11-29', 30, TODAY)).toBe(false)
    expect(endsWithinDays('2026-11-29', 60, TODAY)).toBe(true)
    expect(endsWithinDays('2026-11-29', 90, TODAY)).toBe(true)
  })

  it('une mission sans date de fin n’est dans aucune fenêtre', () => {
    expect(endsWithinDays(null, 90, TODAY)).toBe(false)
    expect(endsWithinDays(undefined, 90, TODAY)).toBe(false)
    expect(endsWithinDays('', 90, TODAY)).toBe(false)
  })
})
