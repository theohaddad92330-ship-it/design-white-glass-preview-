import type { DataSource } from 'typeorm'
import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import type { DossierBlocksStep } from './dossier-blocks.step'

/**
 * #4078 — rattrapage des cinq blocs du dossier complet (doctrine « un correctif
 * de collecte RATTRAPE l'existant », Louis 18/09/2026) :
 *
 * - **ciblé** : un compte dont la date de collecte du SEGMENT
 *   (`dossier_blocks_collected_at`) est absente ou antérieure à la capacité
 *   (`SEGMENT_CAPABILITY_EPOCH.dossier_blocks`, le registre partagé avec l'écran —
 *   GA-26) — jamais sur un symptôme (« une clé manque » : un dossier sans matière
 *   n'en porte aucune, à juste titre, et serait rejoué sans fin), jamais tout le
 *   parc, jamais un espace de démonstration ;
 * - **par segment** : l'étape `DossierBlocksStep` SEULE, jamais une analyse
 *   entière, aucun crédit débité ; elle date le segment quand elle aboutit ;
 * - **jamais d'écrasement** : l'étape n'écrit que les clés absentes ;
 * - **SIMULATION par défaut** : `apply` false compte ce qui partirait, n'écrit rien.
 *   Ne part jamais seul au déploiement (script manuel).
 */
const DEFAULT_LIMIT = 50

type CatchUpReport = {
  apply: boolean
  candidates: number
  lastId: string | null
  outcomes: Record<string, number>
}

export async function runDossierBlocksCatchUp(opts: {
  dataSource: DataSource
  step: Pick<DossierBlocksStep, 'produceDossierBlocks'>
  apply: boolean
  limit?: number
  workspaceId?: string
  afterId?: string
}): Promise<CatchUpReport> {
  const capabilityAt = SEGMENT_CAPABILITY_EPOCH.dossier_blocks
  // Aucune capacité datée : rien n'est « concerné » — se taire plutôt que deviner une date.
  if (!capabilityAt) return { apply: opts.apply, candidates: 0, lastId: null, outcomes: {} }
  const params: unknown[] = [capabilityAt]
  let where = `a.raw_analysis IS NOT NULL
     AND a.workspace_id IS NOT NULL
     AND a.status NOT IN ('analyzing', 'deleted', 'archived')
     AND (a.dossier_blocks_collected_at IS NULL OR a.dossier_blocks_collected_at < $1)
     AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = a.workspace_id AND w.is_demo = true)`
  if (opts.workspaceId) {
    params.push(opts.workspaceId)
    where += ` AND a.workspace_id = $${params.length}`
  }
  if (opts.afterId) {
    params.push(opts.afterId)
    where += ` AND a.id > $${params.length}`
  }
  params.push(opts.limit ?? DEFAULT_LIMIT)
  const found: Array<{ id: string; workspace_id: string; collected_at: Date | null }> = await opts.dataSource.query(
    `SELECT a.id, a.workspace_id, a.dossier_blocks_collected_at AS collected_at
       FROM accounts a WHERE ${where} ORDER BY a.id LIMIT $${params.length}`,
    params,
  )
  // Double lecture, comme `SegmentCatchupService` : la MÊME fonction que l'écran tranche.
  const rows = found.filter(row => isSegmentCollectionStale(row.collected_at ?? null, capabilityAt))

  const outcomes: Record<string, number> = {}
  if (opts.apply) {
    // En série : un appel modèle à la fois, jamais de pic.
    for (const row of rows) {
      const outcome = await opts.step.produceDossierBlocks(row.id, row.workspace_id)
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
    }
  }
  return { apply: opts.apply, candidates: rows.length, lastId: found[found.length - 1]?.id ?? null, outcomes }
}
