import type { EntityManager } from 'typeorm'

/** Statuts d'affectation qui ne comptent PLUS comme « en mission ». */
const ENDED_ASSIGNMENT_STATUSES = ['completed', 'terminated', 'replaced'] as const

/** Une affectation en cours aujourd'hui, avec la mission qui la porte. */
interface ActiveEngagement {
  consultantId: string
  missionId: string
  missionLabel: string
  /** `AAAA-MM-JJ`, ou `null` quand l'affectation n'a pas de fin connue. */
  endsOn: string | null
}

/**
 * Les affectations EN COURS de ces consultants (#4196) : ni terminées, ni
 * remplacées, commencées, pas encore finies, sur une mission ni terminée ni
 * annulée. Une SEULE définition de « en mission » — l'archivage la lit pour
 * refuser, la migration de rattrapage la reprend en SQL, la fiche pour nommer
 * l'écart. `today` est injecté (jamais `now()` caché) : testable, et un jour
 * calendaire reste un jour calendaire.
 */
export async function findActiveEngagements(
  manager: Pick<EntityManager, 'query'>,
  consultantIds: readonly string[],
  today: string,
): Promise<ActiveEngagement[]> {
  if (consultantIds.length === 0) return []
  const rows = await manager.query<
    { consultant_id: string; mission_id: string; label: string | null; ends_on: string | null }[]
  >(
    `SELECT a.consultant_id, a.mission_id, m.label, a.ends_on::text AS ends_on
       FROM mission_assignments a
       JOIN missions m ON m.id = a.mission_id
      WHERE a.consultant_id = ANY($1::uuid[])
        AND a.status NOT IN (${ENDED_ASSIGNMENT_STATUSES.map(s => `'${s}'`).join(', ')})
        AND m.status NOT IN ('completed', 'cancelled')
        AND a.starts_on <= $2::date
        AND (a.ends_on IS NULL OR a.ends_on >= $2::date)
      ORDER BY a.ends_on DESC NULLS FIRST`,
    [[...consultantIds], today],
  )
  return (rows ?? []).map(row => ({
    consultantId: row.consultant_id,
    missionId: row.mission_id,
    missionLabel: row.label ?? '',
    endsOn: row.ends_on,
  }))
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`, pour un message lu par un humain. */
export function frenchDate(isoDay: string): string {
  const [year, month, day] = isoDay.split('-')
  return `${day}/${month}/${year}`
}
