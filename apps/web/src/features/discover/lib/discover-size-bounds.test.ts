import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HEADCOUNT_BOUNDS } from './discover-query'
import { migrateLegacySize, SIZE_BANDS, STARTUP_SEGMENT_HEADCOUNT } from './discover-size-bounds'

// #4362.3 — une seule définition de la taille, celle de BellumAI : TPE < 10 · PME 10-249 · ETI 250-999 · GC ≥ 1 000.
const rail = (lang: 'fr' | 'en') =>
  (
    JSON.parse(readFileSync(resolve(__dirname, `../../../i18n/locales/${lang}/discover.json`), 'utf8')) as {
      rail: Record<string, unknown>
    }
  ).rail

describe('tailles maison (#4362)', () => {
  it.each([
    ['TPE', 1, 9],
    ['PME', 10, 249],
    ['ETI', 250, 999],
    ['GC', 1000, null],
  ] as const)('%s : de %i à %s salariés', (code, min, max) => {
    const band = SIZE_BANDS.find(entry => entry.code === code)
    expect([band?.min, band?.max]).toEqual([min, max])
  })

  it('les tranches fines de chaque taille couvrent EXACTEMENT ses bornes (la requête envoie ces bornes-là)', () => {
    for (const band of SIZE_BANDS) {
      const bounds = band.ranges.map(range => HEADCOUNT_BOUNDS[range])
      expect(Math.min(...bounds.map(b => b.headcountMin ?? Infinity))).toBe(band.min)
      expect(Math.max(...bounds.map(b => b.headcountMax ?? Infinity))).toBe(band.max ?? Infinity)
    }
  })

  it('les quatre tailles se touchent sans trou ni chevauchement', () => {
    expect(SIZE_BANDS.map(band => band.code)).toEqual(['TPE', 'PME', 'ETI', 'GC'])
    for (let i = 1; i < SIZE_BANDS.length; i++) expect(SIZE_BANDS[i]!.min).toBe(SIZE_BANDS[i - 1]!.max! + 1)
  })

  it('une ancienne catégorie INSEE garde son intention sous forme de tranches', () => {
    const migrated = migrateLegacySize({ headcount: ['50-249'], companyCategory: ['PME', 'GE'] })
    expect(migrated.companyCategory).toEqual([])
    expect(migrated.headcount).toEqual(['1-9', '10-49', '50-249', '1000+'])
    expect(migrateLegacySize({ headcount: [], companyCategory: ['ETI'] }).headcount).toEqual(['250-999', '1000+'])
  })

  it('sait dire NON : rien à migrer, rien ne bouge', () => {
    const filters = { headcount: ['10-49' as const], companyCategory: [] }
    expect(migrateLegacySize(filters)).toBe(filters)
  })

  it('le préréglage Startup est une taille visible (< 250), plus une catégorie cachée', () => {
    expect(STARTUP_SEGMENT_HEADCOUNT).toEqual(['1-9', '10-49', '50-249'])
  })

  it.each([
    ['fr', ['10', '249', '250', '999', '1 000']],
    ['en', ['10', '249', '250', '999', '1,000']],
  ] as const)('%s : l’aide dit les bornes maison et nomme la définition de la marque (variable)', (lang, bounds) => {
    const hint = String(rail(lang).companyCategoryHint)
    for (const bound of bounds) expect(hint).toContain(bound)
    expect(hint).toContain('{{brand}}')
    expect(hint).not.toMatch(/INSEE|4\s?999|5\s?000|5,000/)
  })
})
