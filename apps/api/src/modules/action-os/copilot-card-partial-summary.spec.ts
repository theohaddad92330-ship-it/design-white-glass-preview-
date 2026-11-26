import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { cardResultOf } from './copilot-card.service'

/**
 * #1943.13 / #1943.14 — « ce qui n'a pas été fait » / « ce qui a malgré tout
 * réussi », pour un run `partial` (#1943.7).
 *
 * Avant ce test, `cardResultOf` n'avait AUCUNE branche pour `run.status ===
 * 'partial'` dans son switch `outcomeText` : le run tombait sur le `default`
 * générique (« Carte mise à jour. »), qui ne nomme ni ce qui a marché ni ce
 * qui n'a pas marché — exactement le défaut inverse de la doctrine (« un
 * timeout n'est pas un échec » vaut aussi dans l'autre sens : un succès
 * partiel n'est pas un mystère).
 *
 * `signal_to_account_opening` (workflow-catalog.ts) a trois pas, chacun avec
 * une phrase `intent` déjà écrite pour la prévisualisation — la même phrase
 * sert ici, elle n'est jamais recopiée à un second endroit (GA-26).
 */

const PARTIAL_RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  definition_key: 'signal_to_account_opening',
  status: 'partial',
  steps: [
    {
      key: 'enrich_decision_maker',
      outcome: 'done',
      creditsSpent: 1,
      attempts: 1,
      finishedAt: '2026-09-16T10:00:00.000Z',
      reason: null,
    },
    {
      key: 'log_crm_opportunity',
      outcome: 'failed',
      creditsSpent: 0,
      attempts: 1,
      finishedAt: '2026-09-16T10:00:01.000Z',
      reason: 'Crédits insuffisants.',
    },
    {
      key: 'schedule_follow_up',
      outcome: 'skipped',
      creditsSpent: 0,
      attempts: 0,
      finishedAt: null,
      reason: null,
    },
  ],
  preview: { targetObject: 'Groupe Latécoère', destination: null },
  finished_at: new Date('2026-09-16T10:00:01.000Z'),
} as unknown as WorkflowRunEntity

describe('#1943.13 / #1943.14 — cardResultOf nomme le succès partiel, pas au hasard', () => {
  it('« ce qui a réussi » NOMME le pas terminé (`done`), sa propre phrase — jamais une autre étape', () => {
    const result = cardResultOf(PARTIAL_RUN)
    expect(result.succeeded).toContain("Retrouver les coordonnées professionnelles de l'interlocuteur identifié")
    expect(result.succeeded).not.toContain('CRM')
    expect(result.succeeded).not.toContain('relance')
  })

  it('« ce qui n’a pas été fait » NOMME la RAISON du pas échoué — jamais l’intitulé du pas réussi', () => {
    const result = cardResultOf(PARTIAL_RUN)
    expect(result.notDone).toContain('Crédits insuffisants.')
    expect(result.notDone).not.toContain('coordonnées professionnelles')
  })

  it('un pas SAUTÉ sans raison retombe sur sa propre phrase déclarée, jamais une valeur devinée', () => {
    const result = cardResultOf(PARTIAL_RUN)
    expect(result.notDone).toContain('Programmer la relance à J+3 sur le compte')
  })

  it('un run qui n’est PAS `partial` ne porte ni l’un ni l’autre champ — rien d’inventé hors de propos', () => {
    const done = cardResultOf({
      ...PARTIAL_RUN,
      status: 'done',
      steps: [PARTIAL_RUN.steps[0]],
    } as unknown as WorkflowRunEntity)
    expect(done.succeeded).toBeUndefined()
    expect(done.notDone).toBeUndefined()
  })
})
