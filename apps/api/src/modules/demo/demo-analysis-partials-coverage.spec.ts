import { analysisPartialFrom } from '@bellum/contracts'
import { DEMO_ANALYSIS_PARTIALS_COVERAGE } from './demo-coverage'

/**
 * #2630.2 — « et en démonstration, ce qui est déjà trouvé montre quoi ? »
 *
 * Rien, et c'est une réponse ÉCRITE, pas un oubli : aucune analyse ne tourne en
 * espace démo. Ce fichier tient les deux moitiés de cette réponse — la
 * classification elle-même, et le fait que le produit ne puisse PAS fabriquer un
 * partiel à partir de rien.
 *
 * ⚠️ La moitié comportementale vit côté web
 * (`apps/web/src/features/demo/demo-run.test.ts`) : elle joue le déroulé
 * scripté en entier et vérifie que `partials` reste vide. Elle ne peut pas
 * vivre ici — le script est un module du navigateur.
 */
describe('#2630.2 — les partiels d’analyse, en démonstration', () => {
  it('est classé vide à dessein, avec sa raison', () => {
    expect(DEMO_ANALYSIS_PARTIALS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ANALYSIS_PARTIALS_COVERAGE.reason).toContain('#2630.2')
  })

  it('la raison NOMME ce qui empêche structurellement un partiel en démo', () => {
    // Une raison qui ne citerait pas le mécanisme serait une opinion.
    expect(DEMO_ANALYSIS_PARTIALS_COVERAGE.reason).toContain('launched: false')
    expect(DEMO_ANALYSIS_PARTIALS_COVERAGE.reason).toContain('playDemoAnalysis')
  })

  it('aucun partiel ne peut naître de rien — le contrat refuse de fabriquer', () => {
    // C'est ce qui rend la classification tenable : même si un chemin démo
    // appelait la dérivation, il n'en sortirait aucune ligne.
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: undefined, at: 1 })).toBeNull()
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: { contacts: [] }, at: 1 })).toBeNull()
  })
})
