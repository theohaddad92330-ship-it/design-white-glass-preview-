import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { cardResultOf } from './copilot-card.service'

/**
 * #1943.17 — « champ support si nécessaire ».
 *
 * `cardResultSchema.supportSuggested` (packages/contracts) existe déjà ; ce
 * test couvre l'ALIMENTATION, comme #1931.17 l'a fait pour `nextStep`. La
 * règle : un lien support n'apparaît QUE sur un échec que la personne ne peut
 * pas diagnostiquer elle-même — aujourd'hui, `unknown_outcome` (un timeout,
 * cf. #1943.9 : « l'action est peut-être partie »). Un `failed` ordinaire ou
 * un `done` n'ont pas besoin de support : le premier dit déjà pourquoi
 * (`step.reason`), le second a réussi.
 */

const BASE_RUN = {
  id: '22222222-2222-4222-8222-222222222222',
  definition_key: 'card_enrich_contact',
  status: 'done',
  steps: [{ key: 'effect', outcome: 'done', creditsSpent: 1, attempts: 1, finishedAt: '2026-09-16T10:00:00.000Z' }],
  preview: { targetObject: 'Claire Dubois', destination: null },
  finished_at: new Date('2026-09-16T10:00:00.000Z'),
} as unknown as WorkflowRunEntity

function runWith(patch: Record<string, unknown>): WorkflowRunEntity {
  return { ...BASE_RUN, ...patch } as unknown as WorkflowRunEntity
}

describe('#1943.17 — cardResultOf suggère le support seulement quand la personne ne peut pas savoir seule', () => {
  it('suggère le support sur un résultat inconnu (timeout)', () => {
    const run = runWith({
      status: 'unknown',
      steps: [{ key: 'effect', outcome: 'unknown', creditsSpent: null, attempts: 1, finishedAt: null }],
    })
    expect(cardResultOf(run).supportSuggested).toBe(true)
  })

  it('ne le suggère PAS sur un succès', () => {
    expect(cardResultOf(BASE_RUN).supportSuggested).toBe(false)
  })

  it('ne le suggère PAS sur un échec ordinaire — la raison est déjà dite', () => {
    const run = runWith({
      status: 'failed',
      steps: [
        {
          key: 'effect',
          outcome: 'failed',
          creditsSpent: 0,
          attempts: 1,
          finishedAt: '2026-09-16T10:00:00.000Z',
          reason: 'Crédits insuffisants.',
        },
      ],
    })
    expect(cardResultOf(run).supportSuggested).toBe(false)
  })

  it('ne le suggère PAS quand rien n’est parti (`blocked`)', () => {
    const run = runWith({ status: 'blocked', steps: [] })
    expect(cardResultOf(run).supportSuggested).toBe(false)
  })
})
