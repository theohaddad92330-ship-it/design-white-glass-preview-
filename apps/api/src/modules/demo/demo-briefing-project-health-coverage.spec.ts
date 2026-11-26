import { pipelineHealth, type PipelineHealthRow } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #3714 — LA PARITÉ DÉMO DES DEUX CARTES « AUJOURD'HUI » DU PIPE : « Affaire
 * sans prochaine action » et « Affaire vieillissante ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, PLUTÔT QU'UN RE-SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette 08/10 : ni l'une ni l'autre carte visible en salle. Les commentaires
 * DÉJÀ écrits sur `DEMO_DELIVERY_CLIENT.pipelineProjects` (#2107.2,
 * `demo-dataset.ts`) affirment que les DEUX affaires du pipe de ce client
 * portent déjà ce qu'il faut — une à 35 jours avec prochaine action (`ageing`),
 * une à 17 jours sans aucune (`without_next_action`). Cette garde REJOUE
 * `pipelineHealth` (la même fonction que `BriefingService.buildProjectHealth`)
 * sur la forme EXACTE que le semis écrit, plutôt que de supposer le commentaire
 * à jour ou d'ajouter une troisième affaire en double emploi.
 *
 * Si elle rougit, le manque est dans le SEMIS (`demo-seed.service.ts`, la
 * boucle `pipelineProjects`) ou dans la lecture SQL (`fetchProjectHealthRows`),
 * jamais dans `pipelineHealth` elle-même (déjà testée ailleurs).
 */
describe('parité démo — les cartes « Affaire sans prochaine action » / « Affaire vieillissante »', () => {
  const now = new Date('2026-10-08T09:00:00.000Z')

  function rowAt(deal: (typeof DEMO_DELIVERY_CLIENT.pipelineProjects)[number], index: number): PipelineHealthRow {
    const daysAgo = deal.stage_entered_days_ago ?? 17
    return {
      id: `pipeline-project-${index}`,
      stage: deal.stage,
      kind: 'besoin',
      owner_id: 'owner-1',
      has_next_action: Boolean(deal.nextAction),
      stage_entered_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    }
  }

  it('porte au moins DEUX affaires du pipe, l’une avec prochaine action, l’autre sans', () => {
    const withAction = DEMO_DELIVERY_CLIENT.pipelineProjects.filter(deal => deal.nextAction)
    const withoutAction = DEMO_DELIVERY_CLIENT.pipelineProjects.filter(deal => !deal.nextAction)
    expect(withAction.length).toBeGreaterThan(0)
    expect(withoutAction.length).toBeGreaterThan(0)
  })

  it('la plus âgée dépasse le seuil de fraîcheur (30 jours) — elle doit nourrir « Affaire vieillissante »', () => {
    const rows = DEMO_DELIVERY_CLIENT.pipelineProjects.map(rowAt)
    const { needsAttention } = pipelineHealth(rows, now)
    const stale = needsAttention.filter(item => item.reasons.includes('ageing') || item.reasons.includes('stale'))
    expect(stale.length).toBeGreaterThan(0)
  })

  it('celle sans prochaine action nourrit « Affaire sans prochaine action »', () => {
    const rows = DEMO_DELIVERY_CLIENT.pipelineProjects.map(rowAt)
    const { needsAttention } = pipelineHealth(rows, now)
    const withoutNextAction = needsAttention.filter(item => item.reasons.includes('without_next_action'))
    expect(withoutNextAction.length).toBeGreaterThan(0)
  })
})
