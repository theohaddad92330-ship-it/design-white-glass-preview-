import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #3407 (recette prod 02/10, Y13) — le responsable de chaque ligne.
 *
 * Décision Louis 04/10/2026 — les comptes compagnons FICTIFS ont quitté la
 * salle ; recette 05/10 — l'ESN partenaire (CGI) n'est pas un compte prospect
 * non plus : plus aucun compte compagnon, donc plus de niveau d'effort à poser
 * (`DEMO_COMPANION_EFFORT` supprimé). Reste le responsable.
 */
describe('comptes compagnons de la salle (#3407)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('sait dire NON : plus de niveau d’effort posé sur un compte compagnon', () => {
    expect(seed).not.toContain('DEMO_COMPANION_EFFORT')
    expect(seed).not.toMatch(/UPDATE accounts SET sprint = \$3, sprint_reason/)
  })

  // lot X80 (#3407) — « responsable » de chaque ligne : l'occupant unique de la salle (#1408).
  it('le semis pose le responsable (l’occupant) sur les comptes insérés sans `assigned_to`', () => {
    expect(seed).toContain('await this.seedCompanionEffort(')
    expect(seed).toMatch(/UPDATE accounts SET assigned_to = \$2[\s\S]{0,200}assigned_to IS NULL/)
  })
})
