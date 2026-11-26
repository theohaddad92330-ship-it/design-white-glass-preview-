import type { Logger } from '@nestjs/common'
import type { DataSource } from 'typeorm'

/**
 * Point 46 (briefs comptes) — le coût d'un appel modèle fait APRÈS l'analyse
 * (brief commercial, blocs du dossier #4078) s'AJOUTE au coût du dernier run
 * d'analyse du compte (`analysis_runs.cost_eur`, en USD malgré son nom — même
 * convention que `AnalysisRunsService.completeLatest`) : on additionne, on
 * n'écrase jamais. Coût inconnu ou nul ⇒ rien d'inventé. Best-effort : une
 * écriture de coût ratée ne coûte pas ce qu'elle accompagne.
 */
export async function addCostToLatestAnalysisRun(
  dataSource: DataSource,
  logger: Logger,
  accountId: string,
  costUsd: number | null,
): Promise<void> {
  if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd <= 0) return
  try {
    await dataSource.query(
      `UPDATE analysis_runs
          SET cost_eur = COALESCE(cost_eur, 0) + $1
        WHERE id = (
          SELECT id FROM analysis_runs
           WHERE account_id = $2
           ORDER BY created_at DESC
           LIMIT 1
        )`,
      [costUsd, accountId],
    )
  } catch (err) {
    logger.warn('Coût d’un appel post-analyse non ajouté au run (non bloquant)', {
      accountId,
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}
