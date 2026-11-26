import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { cardResultOf } from './copilot-card.service'

/**
 * #2105.39 — UNE CARTE EXÉCUTÉE NOMME L'OUTIL, COMME SA PRÉVISUALISATION.
 *
 * `cardPreviewSchema.connectionUsed` nomme déjà la capacité injectée
 * (« votre agenda », « votre CRM », « votre messagerie »…) pour chaque action
 * à effet (`copilot-card-catalog.ts`). Mais `cardResultOf` ne recopiait que
 * `destination` dans le résultat après-coup — `null` pour `enrich_contact`,
 * `prepare_message`, `toggle_routine`, `update_setting` et `pin_memory_fact`
 * (5 des 7 actions à effet), donc une carte EXÉCUTÉE n'affichait plus aucun
 * outil pour elles, alors que la prévisualisation, un instant plus tôt, en
 * nommait un.
 */

const BASE_RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  definition_key: 'card_schedule_reminder',
  status: 'done',
  steps: [{ key: 'effect', outcome: 'done', creditsSpent: 0, attempts: 1, finishedAt: '2026-09-17T10:00:00.000Z' }],
  preview: {
    targetObject: 'Claire Dubois',
    destination: "votre agenda, sinon le journal d'actions",
    connectionUsed: 'votre agenda',
  },
  finished_at: new Date('2026-09-17T10:00:00.000Z'),
} as unknown as WorkflowRunEntity

function runWith(patch: Record<string, unknown>): WorkflowRunEntity {
  return { ...BASE_RUN, ...patch } as unknown as WorkflowRunEntity
}

describe('#2105.39 — cardResultOf recopie connectionUsed depuis la prévisualisation', () => {
  it('porte le nom de l’outil quand la prévisualisation en avait un', () => {
    const result = cardResultOf(BASE_RUN)
    expect(result.connectionUsed).toBe('votre agenda')
  })

  it('ne devine RIEN quand la prévisualisation n’a pas de connexion — `null`, jamais un texte inventé', () => {
    const run = runWith({
      definition_key: 'card_toggle_routine',
      preview: { targetObject: 'Routine de relance', destination: null, connectionUsed: null },
    })
    expect(cardResultOf(run).connectionUsed).toBeNull()
  })

  it('reste `null` quand aucune prévisualisation n’a jamais existé — pas de valeur devinée en son absence', () => {
    const run = runWith({ preview: null })
    expect(cardResultOf(run).connectionUsed).toBeNull()
  })
})
