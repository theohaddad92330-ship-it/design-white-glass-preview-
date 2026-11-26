import { listMigrationFiles, migrationKey } from './migrations-loader'

describe('migrations-loader (CI-3)', () => {
  it('lit l’horodatage complet du nom', () => {
    expect(migrationKey('1767225600000-Init.ts')).toBe(1767225600000n)
    expect(migrationKey('20260927181000-Consultants.ts')).toBe(20260927181000n)
  })

  it('refuse un nom sans horodatage', () => {
    expect(() => migrationKey('Init.ts')).toThrow(/sans horodatage/)
  })

  it('range un nom à 14 chiffres APRÈS tous ceux à 13 (ordre voulu sur base vierge)', () => {
    const files = listMigrationFiles()
    expect(files.length).toBeGreaterThan(100)
    expect(files[0]).toBe('1767225600000-Init.ts')
    const keys = files.map(migrationKey)
    for (let i = 1; i < keys.length; i++) expect(keys[i]! >= keys[i - 1]!).toBe(true)
    const firstLong = files.findIndex(f => /^\d{14}-/.test(f))
    if (firstLong >= 0) {
      for (const f of files.slice(firstLong)) expect(/^\d{14}-/.test(f)).toBe(true)
    }
  })

  it('n’inclut aucune spec', () => {
    expect(listMigrationFiles().some(f => f.endsWith('.spec.ts'))).toBe(false)
  })
})
