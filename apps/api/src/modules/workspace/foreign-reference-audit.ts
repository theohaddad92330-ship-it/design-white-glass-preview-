import type { EntityManager } from 'typeorm'

/**
 * #4559 — SIGNALER les identifiants étrangers DÉJÀ stockés, sans y toucher.
 *
 * Les gardes d'écriture (`assertManagerInWorkspace`, `DeliveryService.create`)
 * et les filtres de relecture (`managerNamesOf`, `opportunitiesOf`,
 * `proofProposalForMission`) protègent ce qui s'écrit et ce qui se lit depuis.
 * Les lignes écrites AVANT restent en base : on ne les efface pas, on ne
 * fabrique aucune valeur de remplacement — on les COMPTE, pour que la décision
 * de les reprendre se prenne sur un chiffre.
 *
 * Une référence est « étrangère » quand la cible existe et n'appartient pas au
 * même espace que la ligne qui la porte. Lecture seule ; le rapport ne contient
 * que des comptes, jamais un identifiant.
 */
export const FOREIGN_REFERENCE_CHECKS = [
  {
    key: 'consultants.manager_id',
    sql: `SELECT count(*)::int AS rows, count(DISTINCT c.workspace_id)::int AS workspaces
            FROM consultants c
            JOIN consultants mgr ON mgr.id = c.manager_id
           WHERE mgr.workspace_id IS DISTINCT FROM c.workspace_id
              OR (c.workspace_id IS NULL AND mgr.user_id IS DISTINCT FROM c.user_id)`,
  },
  {
    key: 'missions.opportunity_id',
    sql: `SELECT count(*)::int AS rows, count(DISTINCT m.workspace_id)::int AS workspaces
            FROM missions m
            JOIN opportunities o ON o.id = m.opportunity_id
           WHERE o.workspace_id IS DISTINCT FROM m.workspace_id`,
  },
  {
    key: 'missions.need_id',
    sql: `SELECT count(*)::int AS rows, count(DISTINCT m.workspace_id)::int AS workspaces
            FROM missions m
            JOIN project_needs n ON n.id = m.need_id
           WHERE n.workspace_id IS DISTINCT FROM m.workspace_id`,
  },
] as const

type ForeignReferenceCount = { rows: number; workspaces: number }

type ForeignReferenceLine = { key: (typeof FOREIGN_REFERENCE_CHECKS)[number]['key'] } & ForeignReferenceCount

export type ForeignReferencePort = { count: (sql: string) => Promise<ForeignReferenceCount> }

export function sqlForeignReferencePort(manager: EntityManager): ForeignReferencePort {
  return {
    count: async sql => {
      const rows = await manager.query<{ rows: number; workspaces: number }[]>(sql)
      return { rows: Number(rows[0]?.rows ?? 0), workspaces: Number(rows[0]?.workspaces ?? 0) }
    },
  }
}

export async function runForeignReferenceAudit(port: ForeignReferencePort): Promise<ForeignReferenceLine[]> {
  const report: ForeignReferenceLine[] = []
  for (const { key, sql } of FOREIGN_REFERENCE_CHECKS) {
    report.push({ key, ...(await port.count(sql)) })
  }
  return report
}

export function formatForeignReferenceReport(report: readonly ForeignReferenceLine[]): string {
  return [
    '#4559 — identifiants étrangers déjà stockés (lecture seule, rien n’est modifié)',
    ...report.map(line => `  ${line.key} : ${line.rows} ligne(s) dans ${line.workspaces} espace(s)`),
  ].join('\n')
}
