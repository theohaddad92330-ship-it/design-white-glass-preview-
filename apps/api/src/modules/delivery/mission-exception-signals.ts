import {
  isProlongedAbsence,
  missionSatisfactionOf,
  taskStillOpenSql,
  type MissionFeedbackRail,
  type MissionSatisfaction,
  type MissionSatisfactionLevel,
} from '@bellum/contracts'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

/**
 * #2408.3, .16, .17, .20, .21, .40 — CE QUE LA LISTE DES MISSIONS LIT EN PLUS
 * pour ses exceptions L15 (contrat Louis 31/10/2026).
 *
 * Six lectures GROUPÉES pour toute la liste, jamais une par ligne. Chaque
 * champ suit la règle de `missionRisks()` : `undefined` = « pas lu » (muet),
 * une valeur = un fait mesuré. Les SEUILS ne vivent pas ici : ils sont dans
 * le contrat (`RELATIONSHIP_SILENCE_DAYS`, `PROLONGED_ABSENCE_DAYS`,
 * `UNSECURED_CONSULTANT_DAYS`) — ce fichier lit, il ne juge pas (GA-26).
 */
export type MissionExceptionSignals = {
  satisfaction?: MissionSatisfaction
  lastAccountContactAt?: string | null
  assigneeOnProlongedAbsence?: boolean
  assigneeWithoutNextPlacement?: boolean
  ownerlessOpenAction?: boolean
  legalEntityName?: string | null
}

type MissionInput = {
  id: string
  account_id: string | null
  ends_on: string | null
  legal_entity_id?: string | null
}

/** Statuts de mission qui ne PLACENT plus personne. */
const CLOSED_MISSION_STATUSES = ['draft', 'ended', 'terminated', 'completed', 'cancelled']
/** Statuts d'affectation morts — même liste que `staffing-pilotage.service.ts`. */
const DEAD_ASSIGNMENT_STATUSES = ['completed', 'terminated', 'replaced']

const isoDay = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const isoInstant = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export async function missionExceptionSignals(
  manager: Queryable,
  workspaceId: string,
  missions: readonly MissionInput[],
  /** `null` = affectés illisibles : absence et placement restent muets. */
  assigneesByMission: ReadonlyMap<string, readonly { id: string }[]> | null,
  today: string,
): Promise<Map<string, MissionExceptionSignals>> {
  const result = new Map<string, MissionExceptionSignals>()
  if (missions.length === 0) return result
  const missionIds = missions.map(mission => mission.id)
  const accountIds = [...new Set(missions.map(m => m.account_id).filter((id): id is string => Boolean(id)))]
  const legalEntityIds = [...new Set(missions.map(m => m.legal_entity_id).filter((id): id is string => Boolean(id)))]
  const consultantIds =
    assigneesByMission === null
      ? []
      : [...new Set([...assigneesByMission.values()].flatMap(list => list.map(assignee => assignee.id)))]

  const [feedbackRows, contactRows, absenceRows, placementRows, ownerlessRows, entityRows] = (await Promise.all([
    manager.query(
      `SELECT mission_id, rail, level, private, created_at
         FROM mission_feedback
        WHERE workspace_id = $1 AND mission_id = ANY($2::uuid[])`,
      [workspaceId, missionIds],
    ),
    accountIds.length === 0
      ? []
      : manager.query(
          `SELECT account_id, MAX(occurred_at) AS last_at
             FROM activities
            WHERE workspace_id = $1 AND account_id = ANY($2::uuid[])
            GROUP BY account_id`,
          [workspaceId, accountIds],
        ),
    consultantIds.length === 0
      ? []
      : manager.query(
          `SELECT consultant_id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
             FROM consultant_absences
            WHERE workspace_id = $1 AND consultant_id = ANY($2::uuid[])
              AND starts_on <= $3::date AND ends_on >= $3::date`,
          [workspaceId, consultantIds, today],
        ),
    consultantIds.length === 0
      ? []
      : manager.query(
          `SELECT ma.consultant_id, ma.mission_id,
                  to_char(COALESCE(ma.ends_on, m.ends_on), 'YYYY-MM-DD') AS ends_on
             FROM mission_assignments ma
             JOIN missions m ON m.id = ma.mission_id
            WHERE m.workspace_id = $1
              AND ma.consultant_id = ANY($2::uuid[])
              AND m.status <> ALL($3)
              AND COALESCE(ma.status, 'confirmed') <> ALL($4)`,
          [workspaceId, consultantIds, CLOSED_MISSION_STATUSES, DEAD_ASSIGNMENT_STATUSES],
        ),
    accountIds.length === 0
      ? []
      : manager.query(
          `SELECT DISTINCT t.account_id
             FROM tasks t
            WHERE t.workspace_id = $1 AND t.account_id = ANY($2::uuid[])
              AND t.owner_id IS NULL AND ${taskStillOpenSql('t')}`,
          [workspaceId, accountIds],
        ),
    legalEntityIds.length === 0
      ? []
      : manager.query(`SELECT id, name FROM legal_entities WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [
          workspaceId,
          legalEntityIds,
        ]),
  ])) as [
    {
      mission_id: string
      rail: MissionFeedbackRail
      level: MissionSatisfactionLevel | null
      private: boolean
      created_at: Date | string
    }[],
    { account_id: string; last_at: Date | string | null }[],
    { consultant_id: string; starts_on: string; ends_on: string }[],
    { consultant_id: string; mission_id: string; ends_on: string | null }[],
    { account_id: string }[],
    { id: string; name: string }[],
  ]

  const feedbackByMission = new Map<string, typeof feedbackRows>()
  for (const row of feedbackRows)
    feedbackByMission.set(row.mission_id, [...(feedbackByMission.get(row.mission_id) ?? []), row])
  const lastContactByAccount = new Map(contactRows.map(row => [row.account_id, isoInstant(row.last_at)]))
  const absentConsultants = new Set(
    absenceRows
      .filter(row => isProlongedAbsence({ startsOn: row.starts_on, endsOn: row.ends_on }, today))
      .map(row => row.consultant_id),
  )
  const ownerlessAccounts = new Set(ownerlessRows.map(row => row.account_id))
  const entityNames = new Map(entityRows.map(row => [row.id, row.name]))

  for (const mission of missions) {
    const assignees = assigneesByMission === null ? null : (assigneesByMission.get(mission.id) ?? [])
    const endsOn = isoDay(mission.ends_on)
    // #2408.20 — un affecté est PLACÉ s'il tient une autre affectation vivante
    // qui court au-delà de la fin de celle-ci (ou sans fin connue).
    const placed = (consultantId: string): boolean =>
      placementRows.some(
        row =>
          row.consultant_id === consultantId &&
          row.mission_id !== mission.id &&
          (row.ends_on === null || endsOn === null || row.ends_on > endsOn),
      )
    result.set(mission.id, {
      satisfaction: missionSatisfactionOf(
        (feedbackByMission.get(mission.id) ?? []).map(row => ({
          rail: row.rail,
          level: row.level,
          private: row.private,
          createdAt: isoInstant(row.created_at) ?? '',
        })),
      ),
      // `null` MESURÉ = aucun contact jamais avec ce compte ; sans compte, non lu.
      lastAccountContactAt: mission.account_id ? (lastContactByAccount.get(mission.account_id) ?? null) : undefined,
      assigneeOnProlongedAbsence: assignees === null ? undefined : assignees.some(a => absentConsultants.has(a.id)),
      assigneeWithoutNextPlacement:
        assignees === null ? undefined : assignees.length > 0 && assignees.some(a => !placed(a.id)),
      ownerlessOpenAction: mission.account_id ? ownerlessAccounts.has(mission.account_id) : undefined,
      legalEntityName: mission.legal_entity_id ? (entityNames.get(mission.legal_entity_id) ?? null) : null,
    })
  }
  return result
}
