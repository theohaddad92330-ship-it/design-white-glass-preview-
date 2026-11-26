import { PENDING_CHAT_ACTION_TYPES } from '@bellum/contracts'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { cardDefinitionForKey, cardNextStepOnSuccess } from './copilot-card-catalog'
import { cardResultOf } from './copilot-card.service'

/**
 * #1931.17 — « AFFICHER LA PROCHAINE ÉTAPE ».
 *
 * L'écran savait déjà la rendre (`CopilotCards.tsx`, ligne `cards.result.next`)
 * et le contrat portait déjà le champ (`CardResult.nextStep`). Ce qui manquait
 * était l'ALIMENTATION : `cardResultOf` n'écrivait une prochaine étape que sur
 * un ÉCHEC (« Réessayer. ») ou un résultat inconnu. Après une action RÉUSSIE —
 * le cas le plus fréquent, et le seul où la question « et maintenant ? » se
 * pose vraiment — le champ valait `null`, donc aucune ligne.
 *
 * La phrase vit dans la table des cartes (`STEP_SPECS`), à côté de l'intent, du
 * coût et du résultat attendu de la même carte : c'est là que se décide ce que
 * la carte FAIT, donc le seul endroit où l'on sait ce qui vient après.
 */

const DONE_RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  definition_key: 'card_enrich_contact',
  status: 'done',
  steps: [{ key: 'effect', outcome: 'done', creditsSpent: 1, attempts: 1, finishedAt: '2026-09-16T10:00:00.000Z' }],
  preview: { targetObject: 'Claire Dubois', destination: null },
  finished_at: new Date('2026-09-16T10:00:00.000Z'),
} as unknown as WorkflowRunEntity

function runWith(patch: Record<string, unknown>): WorkflowRunEntity {
  return { ...DONE_RUN, ...patch } as unknown as WorkflowRunEntity
}

describe('#1931.17 — la table déclare la prochaine étape de chaque carte', () => {
  it('donne une phrase à CHAQUE carte réellement exécutable — le corpus n’est pas vide', () => {
    const executable = PENDING_CHAT_ACTION_TYPES.map(type => `card_${type}`).filter(
      key => cardDefinitionForKey(key) !== null,
    )
    expect(executable.length).toBeGreaterThan(0)
    for (const key of executable) {
      const next = cardNextStepOnSuccess(key)
      expect(typeof next).toBe('string')
      expect((next ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('ne devine RIEN hors de la table — une carte de navigation et une clé inconnue rendent `null`', () => {
    // Le témoin du cas légitime voisin : une carte qui ouvre un écran n'a pas de
    // « prochaine étape » à annoncer, et `null` le DIT au lieu d'inventer.
    expect(cardNextStepOnSuccess('card_open_screen')).toBeNull()
    expect(cardNextStepOnSuccess('card_find_accounts')).toBeNull()
    expect(cardNextStepOnSuccess('card_nimporte_quoi')).toBeNull()
    expect(cardNextStepOnSuccess('pas_une_carte')).toBeNull()
  })

  it('ne nomme jamais un éditeur — la capacité, pas le fournisseur', () => {
    const phrases = PENDING_CHAT_ACTION_TYPES.map(type => cardNextStepOnSuccess(`card_${type}`) ?? '').join(' ')
    expect(phrases.trim().length).toBeGreaterThan(0)
    for (const vendor of ['HubSpot', 'Pipedrive', 'Salesforce', 'Gmail', 'Outlook', 'BoondManager']) {
      expect(phrases).not.toContain(vendor)
    }
  })
})

describe('#1931.17 — le résultat d’une carte porte sa prochaine étape', () => {
  it('rend la phrase de la table après un SUCCÈS — c’est le trou que ce point comble', () => {
    const result = cardResultOf(DONE_RUN)
    expect(result.nextStep).toBe(cardNextStepOnSuccess('card_enrich_contact'))
    expect(result.nextStep).not.toBeNull()
  })

  it('garde les deux phrases d’après-coup existantes : un échec se réessaie, un inconnu se vérifie', () => {
    expect(cardResultOf(runWith({ status: 'failed' })).nextStep).toBe('Réessayer.')
    expect(cardResultOf(runWith({ status: 'unknown' })).nextStep).toBe("Vérifier dans l'outil avant de relancer.")
  })

  it('ne promet AUCUNE suite quand la carte n’est pas allée au bout — « refusée » n’a pas de prochaine étape', () => {
    expect(cardResultOf(runWith({ status: 'cancelled' })).nextStep).toBeNull()
    expect(cardResultOf(runWith({ status: 'blocked' })).nextStep).toBeNull()
  })

  it('ne rend rien pour un succès dont la carte est hors table — jamais une phrase devinée', () => {
    expect(cardResultOf(runWith({ definition_key: 'card_open_screen' })).nextStep).toBeNull()
  })
})
