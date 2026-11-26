import { DEMO_NOTE_GROUP_SCOPE_COVERAGE } from './demo-coverage'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_DOSSIERS, DEMO_EXTENSION_ACCOUNTS, DEMO_NOTES } from './demo-dataset'

/**
 * #3895 (décision Louis 11/10) — « et en démonstration, une note vaut-elle pour une autre entité du groupe ? »
 * (craft rule n°9). Aucune table neuve (colonne de `notes`) : ce fichier lit le VRAI jeu de données.
 *
 * LOUIS 12/10/2026 — RETRAIT ASSUMÉ : la portée n'était démontrée que par BoursoBank, entité sœur de Société Générale,
 * un compte à un seul contact. Louis a retiré tous les comptes minces (« ça n'arrive jamais dans la vraie vie »), la
 * portée passe en « vide à dessein ». Ce n'est pas un contournement : la garde échoue si une note désigne de nouveau
 * une entité absente du jeu semé.
 */
describe('#3895 — la portée entité du groupe en démonstration (vide à dessein)', () => {
  const scoped = DEMO_NOTES.filter(note => (note.alsoAppliesTo ?? []).length > 0)

  it('est classé « vide à dessein », avec la raison de Louis', () => {
    expect(DEMO_NOTE_GROUP_SCOPE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_NOTE_GROUP_SCOPE_COVERAGE.reason).toContain('#3895')
    expect(DEMO_NOTE_GROUP_SCOPE_COVERAGE.reason).toContain('Louis 12/10/2026')
  })

  it('aucune note du jeu ne désigne une entité sœur retirée, ni une entité absente du jeu semé', () => {
    const seeded = new Set([
      ...DEMO_DOSSIERS.map(dossier => dossier.account.company_name),
      ...DEMO_EXTENSION_ACCOUNTS.map(account => account.company_name),
      ...DEMO_ANALYSED_ACCOUNTS.map(account => account.company_name),
    ])
    expect(seeded.has('BoursoBank')).toBe(false)
    for (const note of scoped) for (const name of note.alsoAppliesTo ?? []) expect(seeded.has(name)).toBe(true)
    expect(scoped).toEqual([])
  })
})
