import { AUTOMATION_LEVEL_ORDER, CHAIN_KEYS, chainProblems, nextPosition, reasonRequired } from '@bellum/contracts'
import { CHAIN_CATALOG, findChain } from './chain-catalog'

/**
 * Les sept chaînes sont bien formées, et le restent.
 *
 * Une chaîne mal formée ne se voit pas : elle a l'air d'une liste d'étapes,
 * jusqu'au jour où un dossier tombe dans une boucle infinie ou disparaît de la
 * file parce qu'un refus l'a envoyé en aval. Ces tests portent sur la FORME —
 * ce qu'aucun test de comportement ne regarde.
 */
describe('le catalogue des chaînes', () => {
  it('couvre les sept clés du document, ni plus ni moins', () => {
    expect(CHAIN_CATALOG.map(chain => chain.key).sort()).toEqual([...CHAIN_KEYS].sort())
  })

  it.each(CHAIN_CATALOG.map(chain => [chain.key, chain] as const))('%s est bien formée', (_key, chain) => {
    expect(chainProblems(chain)).toEqual([])
  })

  it.each(CHAIN_CATALOG.map(chain => [chain.key, chain] as const))(
    '%s : aucune position ne boucle sur elle-même',
    (_key, chain) => {
      // Une position qui se renvoie à elle-même est un dossier bloqué pour
      // toujours, sans que personne ne puisse le voir.
      for (const step of chain.steps) {
        const answers = chain.gates.some(gate => gate.afterPosition === step.position) ? [true, false] : [undefined]
        for (const answer of answers) {
          const result = nextPosition(chain, step.position, answer)
          if (step.position < chain.steps.length) {
            expect(result.position).not.toBe(step.position)
          }
        }
      }
    },
  )

  it.each(CHAIN_CATALOG.map(chain => [chain.key, chain] as const))(
    '%s : toute porte est atteignable et laisse le dossier visible sans réponse',
    (_key, chain) => {
      for (const gate of chain.gates) {
        expect(gate.afterPosition).toBeLessThanOrEqual(chain.steps.length)
        // Sans réponse, la position ne bouge pas : c'est ce qui rend la
        // décision en attente visible dans la file.
        const waiting = nextPosition(chain, gate.afterPosition)
        expect(waiting).toEqual({ position: gate.afterPosition, blocked: true })
      }
    },
  )

  it('aucune étape ne dépasse N2 — une chaîne DIT où l’on en est, elle n’envoie rien', () => {
    for (const chain of CHAIN_CATALOG) {
      for (const step of chain.steps) {
        // Le nom vient de l'Action OS, et de nulle part ailleurs. Deux noms
        // pour le MÊME niveau dans deux fichiers voisins est la façon la plus
        // discrète de faire diverger deux moteurs : le jour où l'un consulte la
        // politique d'approbation de l'autre, la comparaison échoue en silence
        // et l'étape retombe au niveau par défaut.
        expect(AUTOMATION_LEVEL_ORDER).toContain(step.automationLevel)
        // Et une chaîne ne s'exécute jamais toute seule : jamais au-delà de N2.
        expect(['n0_advice', 'n1_prepare', 'n2_user_approval']).toContain(step.automationLevel)
      }
    }
  })

  it('chaque chaîne déclare sa boucle de retour, dans les deux langues', () => {
    for (const chain of CHAIN_CATALOG) {
      // Une chaîne sans boucle de retour est une liste : le §6 en fait la
      // propriété qui distingue les deux.
      expect(chain.returnLoop.fr.length).toBeGreaterThan(20)
      expect(chain.returnLoop.en.length).toBeGreaterThan(20)
    }
  })

  it('n’a pas d’opinion PROPRE sur le motif : elle recopie la règle partagée', () => {
    // Deux règles sur le même geste, c'est une divergence à retardement (GA-26).
    // La chaîne disait « pas de motif » sur `proof_sufficiency` et
    // `invoice_readiness` là où le catalogue des portes en exige un pour tout
    // refus — et le jour où la chaîne a commencé à journaliser, le journal
    // refusait ce que la chaîne acceptait.
    const gates = CHAIN_CATALOG.flatMap(chain => chain.gates)
    expect(gates.length).toBeGreaterThan(0)
    for (const gate of gates) {
      expect(gate.reasonRequired).toBe(reasonRequired(gate.gate, 'refuse'))
    }
  })

  it('retrouve une chaîne par sa clé, et rend `undefined` pour une clé inconnue', () => {
    expect(findChain('sourcing_matching')?.key).toBe('sourcing_matching')
    expect(findChain('nawak')).toBeUndefined()
  })
})
