import type { IntegrationExchange } from '@bellum/contracts'

/** Une ligne brute de l'union SQL de `CrmReadSyncService.exchanges` (les trois sources, mêmes colonnes). */
export type ExchangeRow = {
  id: string
  kind: 'read' | 'write' | 'first_sync'
  provider: string
  entity_type: string | null
  at: Date
  created: number | null
  updated: number | null
  skipped: number | null
  conflicts: number | null
  /** `sync_runs.error`, `integration_sync_runs.status = 'failed'` (message), ou `contact_crm_exports.last_action`. */
  error: string | null
  status: string | null
}

const DEFAULT_LIMIT = 50

/**
 * Théo D settings-integrations.N4 — le journal d'échanges tel que l'écran le lit.
 *
 * Trois règles : (1) un refus de l'outil garde SA raison telle quelle ; (2) un passage de lecture qui a laissé des
 * écarts est « à relire », jamais « fait » ; (3) une écriture est « confirmée » (l'outil a répondu), car « fait » ne
 * porte pas de preuve — la doctrine « facturé se garde, sa source se nomme » vaut pour tout ce qui sort.
 */
export function buildExchanges(rows: readonly ExchangeRow[], limit = DEFAULT_LIMIT): IntegrationExchange[] {
  return [...rows]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
    .map((row): IntegrationExchange => {
      const conflicts = row.conflicts ?? 0
      const failed = row.kind === 'first_sync' ? row.status === 'failed' : row.kind === 'read' && Boolean(row.error)
      const result: IntegrationExchange['result'] = failed
        ? 'refused'
        : row.kind === 'write'
          ? 'confirmed'
          : conflicts > 0
            ? 'to_review'
            : 'done'
      return {
        id: row.id,
        at: new Date(row.at).toISOString(),
        provider: row.provider,
        kind: row.kind,
        entityType: row.entity_type === 'account' || row.entity_type === 'contact' ? row.entity_type : null,
        counts:
          row.kind === 'write'
            ? null
            : {
                created: row.created ?? 0,
                updated: row.updated ?? 0,
                skipped: row.skipped ?? 0,
                conflicts,
              },
        result,
        detail: failed ? (row.error ?? null) : null,
      }
    })
}

/** Le SQL de l'union — séparé du mapper pour que la forme des lignes reste testable sans base. */
export const EXCHANGES_SQL = `
  SELECT id::text AS id, 'read' AS kind, provider, entity_type, finished_at AS at,
         created, updated, skipped_count AS skipped, conflict_count AS conflicts, error, NULL::text AS status
    FROM sync_runs
   WHERE workspace_id = $1 AND dry_run = false AND finished_at IS NOT NULL
  UNION ALL
  SELECT id::text, 'write', provider, 'contact', exported_at,
         NULL, NULL, NULL, NULL, NULL, last_action
    FROM contact_crm_exports
   WHERE workspace_id = $1
  UNION ALL
  SELECT id::text, 'first_sync', provider, NULL, COALESCE(finished_at, started_at),
         NULL, NULL, NULL, NULL, error_fr, status
    FROM integration_sync_runs
   WHERE workspace_id = $1 AND status IN ('completed', 'partial', 'failed')
   ORDER BY at DESC
   LIMIT $2`
