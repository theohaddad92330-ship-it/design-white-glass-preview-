import { accountPainFacts, parseAccountAnalysis } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_LAURA_BUBBLES_REACHABLE } from './demo-coverage'

/**
 * #3939.3 (craft rule n°9) — la douleur sourcée et DATÉE que Laura propose
 * d'elle-même sur un dossier ouvert doit se VOIR dans la salle. Ce test MESURE,
 * avec la même lecture que la sonde (`parseAccountAnalysis` + `accountPainFacts`),
 * qu'au moins un dossier semé la déclenche — il ne le suppose pas.
 */
describe('démo — Laura propose une douleur sourcée sur un dossier (#3939.3)', () => {
  const now = new Date()
  const triggering = DEMO_DOSSIERS.filter(
    dossier => accountPainFacts(parseAccountAnalysis(dossier.account.raw_analysis), now).length > 0,
  )

  it('au moins un dossier semé la déclenche, Société Générale en tête', () => {
    expect(triggering.map(dossier => dossier.account.company_name)).toContain('Société Générale')
  })

  it('les faits de la salle sont une hypothèse puis des signaux DATÉS, sans source nommée', () => {
    const sg = triggering.find(dossier => dossier.account.company_name === 'Société Générale')!
    const facts = accountPainFacts(parseAccountAnalysis(sg.account.raw_analysis), now)
    expect(facts[0]).toMatchObject({ kind: 'pain_hypothesis', source: null })
    const signals = facts.slice(1)
    expect(signals.length).toBeGreaterThan(0)
    for (const fact of signals) {
      expect(fact).toMatchObject({ kind: 'pain_signal', source: null })
      expect(fact.observedOn).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
    }
  })

  it('est classée « atteignable » au registre de la salle', () => {
    expect(DEMO_LAURA_BUBBLES_REACHABLE['account_pain_with_dated_signal']).toBeDefined()
  })
})
