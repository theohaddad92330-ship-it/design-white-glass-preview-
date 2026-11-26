import { DEMO_ACCESS_COST_ESTIMATE_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_PERSONAL_ACCESS_EXTRA_SEEDS } from './demo-dataset'

/**
 * #4016.L4 — craft rule n°9. SEMIS-PREUVES 4295.19 (20/10/2026) : le coût d'accès estimé est SEMÉ (deux
 * déclarations de l'équipe sur deux comptes au même verrou). Le client de livraison, lui, garde son verrou vide.
 */
describe('Démo — coût d’accès estimé (#4016.L4)', () => {
  it('lit quelque chose : la salle sème bien des faits d’accès (un coût déclaré)', () => {
    expect(DEMO_DELIVERY_CLIENT.accessFacts.some(fact => fact.kind === 'cost')).toBe(true)
  })

  it('est classé SEMÉ, avec une source et une cible distinctes', () => {
    expect(DEMO_ACCESS_COST_ESTIMATE_COVERAGE.state).toBe('seede')
    const { costEstimate } = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS
    expect(costEstimate.source.accountName).not.toBe(costEstimate.target.accountName)
  })

  it('la raison tient : aucun fait de verrou n’est semé sur le client de livraison', () => {
    expect(DEMO_DELIVERY_CLIENT.accessFacts.some(fact => fact.kind === 'lock')).toBe(false)
  })
})
