import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE } from './demo-coverage'

/**
 * #4421.18 (décision Louis 25/10, craft rule n°9) — « Obtenir l'e-mail » sous une personne proposée par Laura hors
 * de l'espace est REMPLI en démonstration : aucune table ni clé de `raw_analysis` neuve, la révélation vient du
 * script de salle (`DEMO_REVEALED_PEOPLE`), sans aucun appel. La garde relit le script et tombe le jour où le cas
 * Camille Roussel / SII cesse de porter une personne révélable.
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

describe('#4421.18 — « Obtenir l’e-mail » en démonstration', () => {
  const script = readFileSync(SCRIPT, 'utf8')

  it('la capacité est classée « seedée », avec sa raison', () => {
    expect(DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE.state).toBe('seede')
    expect(DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE.reason).toContain('DEMO_REVEALED_PEOPLE')
  })

  it('le script porte une personne révélable sur SII et sa révélation fictive en @exemple.fr', () => {
    expect(script).toMatch(/person_ref: 'demo-sii-ines'/)
    expect(script).toMatch(/'demo-sii-ines': \{ fullName: '[^']+', email: '[^']+@exemple\.fr' \}/)
  })
})
