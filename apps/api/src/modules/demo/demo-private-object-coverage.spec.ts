import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEMO_PRIVATE_OBJECT_COVERAGE } from './demo-coverage'

/**
 * #4158.34 / G.9 (recette R4 18/10, 4158.70) — « Privé » absent en démo : la salle SÈME désormais un objet privé
 * (le switch « Privé » coché sur un dossier du compte vitrine). L'occupant gère l'espace, donc il le voit ; la raison
 * de l'ancien « vide à dessein » (un objet privé semé ne démontre rien) cède devant le besoin : un prospect doit
 * voir l'état « Privé » à l'écran.
 */
describe('#4158.34 / G.9 — objet privé : seedé en démo', () => {
  it('le cas est classé seedé, avec sa raison', () => {
    expect(DEMO_PRIVATE_OBJECT_COVERAGE.state).toBe('seede')
    expect(DEMO_PRIVATE_OBJECT_COVERAGE.reason).toContain('#4158.34')
  })

  it('et c’est vrai : le semis des garde-fous marque UN objet du compte vitrine privé, jamais tous', () => {
    const seed = readFileSync(join(__dirname, 'demo-team-guardrails-seed.ts'), 'utf8')
    expect(seed).toMatch(/UPDATE opportunities\s+SET is_private = true/)
    expect(seed).toMatch(/LIMIT 1/)
    // Sait dire NON : le jeu de données lui-même ne déclare aucun objet privé en masse.
    const dataset = readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')
    expect(dataset).not.toMatch(/is_private\s*:\s*true/)
  })
})
