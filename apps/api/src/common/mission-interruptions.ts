import type { EntityManager } from 'typeorm'

/**
 * #3068 — les missions dont l'INTERRUPTION est déclarée et pas encore
 * confirmée (`mission_interruptions.availability_confirmed = false`, NO-GO
 * #2414/#2986).
 *
 * Fonction PARTAGÉE plutôt que trois requêtes recopiées : `talent.service.ts`,
 * `matching.service.ts` et `staffing.service.ts` appelaient tous les trois
 * `deriveStaffing` sans jamais regarder cette table — c'était le bug. Chacun
 * connaît déjà ses `mission_id` par ses propres affectations ; celle-ci ne
 * fait QUE dire lesquels restent à confirmer.
 */
export async function unconfirmedInterruptionMissionIds(
  manager: EntityManager,
  missionIds: readonly (string | null | undefined)[],
): Promise<Set<string>> {
  const ids = [...new Set(missionIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Set()
  const rows = await manager.query<{ mission_id: string }[]>(
    `SELECT mission_id FROM mission_interruptions WHERE mission_id = ANY($1) AND availability_confirmed = false`,
    [ids],
  )
  return new Set(rows.map(row => row.mission_id))
}
