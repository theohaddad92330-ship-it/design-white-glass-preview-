import { SAME_GROUP_SQL } from '../../common/same-group-sql'
import { accountScopeAnd } from '../manager/manager-bu-scope'
import type { BusinessUnitScopeClause } from './business-unit-scope.clause'

/**
 * #4158 EX-03 (.60/.61/.62), arbitrage Louis 15/10/2026 — « une fiche par entité ».
 *
 * Chaque entité d'un groupe (Orange Business, Orange France…) est un COMPTE à part,
 * rattaché au groupe par la tête capitalistique DÉCLARÉE (`group_head_siren`, jamais un
 * rapprochement de noms — même règle que les notes de groupe, #3895). Elle a son propre
 * responsable (`assigned_to`), ses notes et ses actions : on ne crée aucun second module
 * de portefeuille. Cette lecture ne fait que NOMMER les autres entités du groupe.
 *
 * Les droits suivent l'ENTITÉ : la même clause de périmètre BU que le cockpit d'équipe
 * (`manager-bu-scope.ts`) s'applique à chaque entité listée — une entité hors du
 * périmètre du lecteur n'apparaît pas, ni son nom ni ses compteurs. Être responsable
 * d'une entité ne donne aucun droit sur les autres.
 */

export type GroupEntityView = {
  id: string
  companyName: string
  role: 'groupe' | 'filiale' | null
  ownerUserId: string | null
  openActions: number
  notes: number
}

type Row = {
  id: string
  company_name: string | null
  group_role: 'groupe' | 'filiale' | null
  assigned_to: string | null
  open_actions: string | number | null
  notes: string | number | null
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export async function listGroupEntities(
  manager: Queryable,
  accountId: string,
  workspaceId: string,
  scope: BusinessUnitScopeClause,
): Promise<GroupEntityView[]> {
  const rows = (await manager.query(
    `SELECT s.id, s.company_name, s.group_role, s.assigned_to,
            (SELECT count(*) FROM action_plan_items ua
               WHERE ua.account_id = s.id AND ua.done = false) AS open_actions,
            (SELECT count(*) FROM notes n
               WHERE n.entity_type = 'account' AND n.entity_id = s.id) AS notes
       FROM accounts o
       JOIN accounts s ON ${SAME_GROUP_SQL}
        AND COALESCE(s.status, '') <> 'deleted'
      WHERE o.id = $1 AND o.workspace_id = $2${accountScopeAnd(scope, 's.business_unit_id')}
      ORDER BY s.company_name ASC NULLS LAST`,
    [accountId, workspaceId],
  )) as Row[]
  return rows.map(row => ({
    id: row.id,
    companyName: row.company_name ?? '',
    role: row.group_role ?? null,
    ownerUserId: row.assigned_to ?? null,
    openActions: Number(row.open_actions ?? 0),
    notes: Number(row.notes ?? 0),
  }))
}
