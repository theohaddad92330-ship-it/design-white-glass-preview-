import { needAccessAxis } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #3389.8 (recette Y3 02/10) — l'axe Accès d'un besoin ne montre le verrou du compte que si un
 * fait FRAIS le dit.
 *
 * VIDE À DESSEIN en salle depuis la décision Louis 04/10/2026 (« je ne veux plus d'exemples
 * comme ça ») : le verrou semé était un marché public INVENTÉ sur le client fictif, qui a quitté
 * la salle ; aucun marché public n'est observé sur un vrai compte (les briefs n'en publient pas),
 * et en inventer un sur le porteur réel affirmerait un fait faux. La mécanique reste prouvée
 * ci-dessous par le contrat, et la garde vérifie qu'aucun verrou inventé ne revient.
 */
describe('démo — le verrou du compte sur un besoin (#3389.8) : vide à dessein, mécanique prouvée', () => {
  it('aucun fait de verrou n’est semé sur le client de livraison (pas de marché public inventé)', () => {
    expect(DEMO_DELIVERY_CLIENT.accessFacts.map(fact => fact.kind)).not.toContain('lock')
  })

  it('l’axe Accès nomme le verrou et passe en attention même avec un décideur connu', () => {
    const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: true, accessLock: 'verrouille' })
    expect(axis).toMatchObject({ state: 'attention', measured: { lock: 'verrouille' } })
  })
})
