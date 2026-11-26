import { readdirSync } from 'fs'
import { join } from 'path'

// #3883 — data-source.ts charge `migrations/*.{ts,js}` : un *.spec.ts posé directement
// dans src/migrations/ est chargé par ts-node comme une migration et plante
// (« describe is not defined »). Les tests vivent dans src/migrations/__tests__/.

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

export function specsDirectsDansMigrations(noms: string[]): string[] {
  return noms.filter(n => /\.(spec|test)\.ts$/.test(n))
}

describe('#3883 — aucun spec directement dans src/migrations/', () => {
  it('lit réellement le dossier des migrations', () => {
    expect(readdirSync(MIGRATIONS_DIR).filter(n => n.endsWith('.ts')).length).toBeGreaterThan(50)
  })

  it('aucun *.spec.ts / *.test.ts au premier niveau', () => {
    expect(specsDirectsDansMigrations(readdirSync(MIGRATIONS_DIR))).toEqual([])
  })

  it('sait dire NON : un coupable factice est attrapé, __tests__ non', () => {
    expect(specsDirectsDansMigrations(['1-A.ts', 'x.spec.ts', 'y.test.ts', '__tests__'])).toEqual([
      'x.spec.ts',
      'y.test.ts',
    ])
  })
})
