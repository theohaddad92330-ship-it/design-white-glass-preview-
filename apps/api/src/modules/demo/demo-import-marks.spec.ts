import { DEMO_IMPORT_MARKS } from './demo-dataset'

/** #4051 — l'import passé de la salle est fictif, daté dans le passé, et ne nomme jamais un fournisseur à nous. */
describe('DEMO_IMPORT_MARKS (#4051)', () => {
  it('un fichier déposé évidemment fictif, une archive de CV, un import déjà passé', () => {
    expect(DEMO_IMPORT_MARKS.recordsFile).toMatch(/exemple.*\.csv$/)
    expect(DEMO_IMPORT_MARKS.consultantsFile).toMatch(/exemple.*\.zip$/)
    expect(DEMO_IMPORT_MARKS.daysAgo).toBeGreaterThan(0)
  })

  it('⚠️ SAIT DIRE NON — aucun fournisseur d’enrichissement n’est nommé comme source', () => {
    const names = Object.values(DEMO_IMPORT_MARKS).join(' ').toLowerCase()
    for (const provider of ['apollo', 'pappers', 'brave', 'firecrawl', 'anthropic']) {
      expect(names).not.toContain(provider)
    }
  })
})
