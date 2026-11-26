import type { RecordImportEntityType, RecordImportSourceKind } from '@bellum/contracts'

/**
 * #4051 — l'UNIQUE écriture de « Importé le <date> depuis <source> » (GA-26) : une ligne par fiche, addition seule.
 * Fonction pure sur une connexion, sans service : l'écrivent `ProvenanceService.markImported` (imports des CRM
 * branchés), l'import universel (dans la transaction du paquet) et l'import de CV. `sourceLabel` est le nom du
 * FICHIER déposé ou de l'outil branché du client — jamais un fournisseur à nous. Rien n'est écrit sans fiche ni nom.
 */
export async function insertImportMarks(
  db: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  params: {
    workspaceId: string
    entityType: RecordImportEntityType
    entityIds: readonly string[]
    sourceKind: RecordImportSourceKind
    sourceLabel: string
  },
): Promise<void> {
  const label = params.sourceLabel.trim()
  if (params.entityIds.length === 0 || !label) return
  await db.query(
    `INSERT INTO record_import_marks (workspace_id, entity_type, entity_id, source_kind, source_label)
     SELECT $1, $2, id, $4, $5 FROM unnest($3::uuid[]) AS id`,
    [params.workspaceId, params.entityType, [...params.entityIds], params.sourceKind, label],
  )
}
