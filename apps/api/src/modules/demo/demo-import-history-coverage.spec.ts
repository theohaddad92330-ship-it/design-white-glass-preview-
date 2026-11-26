import { DEMO_IMPORT_HISTORY } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * Théo B c3-imports-sources.R4 — l'historique des imports est SEMÉ (craft rule n°9) : un prospect ouvre
 * Contacts › Imports & sources et voit des imports, pas un écran vide. Ces gardes lisent le jeu réel.
 */
describe('démo — historique des imports (Théo B c3.R4)', () => {
  it('les deux tables sont classées « semées » et ne sont plus « vides à dessein »', () => {
    for (const table of ['universal_import_jobs', 'universal_import_issues']) {
      expect(DEMO_SEEDED_TABLES as readonly string[]).toContain(table)
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain(table)
    }
  })

  it('chaque import semé a un bilan qui tient : créés = importés, chaque écart a son rapport nommé', () => {
    expect(DEMO_IMPORT_HISTORY.length).toBeGreaterThanOrEqual(2)
    for (const entry of DEMO_IMPORT_HISTORY) {
      const family = Object.values(entry.breakdown)[0]
      expect(family).toBeDefined()
      expect(family!.created + family!.rejected + family!.duplicates).toBeLessThanOrEqual(entry.totalRows)
      expect(entry.imported).toBe(family!.created)
      // chaque ligne écartée du bilan a son rapport, avec sa raison nommée
      expect(entry.issues.filter(issue => issue.kind === 'rejected')).toHaveLength(family!.rejected)
      expect(entry.issues.filter(issue => issue.kind === 'duplicate')).toHaveLength(family!.duplicates)
    }
  })

  it('NON — aucun import « en cours » ou « interrompu » semé : « Reprendre » serait un faux geste', () => {
    for (const entry of DEMO_IMPORT_HISTORY) expect(entry).not.toHaveProperty('status')
  })
})
