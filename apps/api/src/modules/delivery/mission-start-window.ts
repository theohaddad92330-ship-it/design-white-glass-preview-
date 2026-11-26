import type { EntityManager } from 'typeorm'
import {
  MISSION_PRE_START_STATUSES,
  MISSION_START_ANNOUNCE_WINDOW_DAYS,
  type MissionStartReadiness,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { loadMissionStartReadiness } from './mission-start-readiness.service'

/**
 * #2409.8 — les missions proches de leur démarrage dont la checklist n'est pas
 * complète : ce que Laura annonce D'ELLE-MÊME (intervention
 * `mission_start_not_ready`), sans qu'on lui pose la question.
 *
 * Tranché sans Louis (décision §12) : ce lecteur alimente le détecteur EXISTANT
 * de Laura (`LAURA_INTERVENTIONS`), jamais un second mécanisme. Il ne juge rien :
 * chaque mission passe par `loadMissionStartReadiness`, donc par
 * `computeMissionStartReadiness` — le MÊME jugement que la porte de démarrage et
 * le panneau « Prête à démarrer ? » (GA-26).
 *
 * Une mission sans date de début n'est pas lue : « non daté » n'est pas
 * « imminent ». Bornée à vingt missions — au-delà, ce n'est plus une annonce.
 */
type MissionStartingSoon = {
  missionId: string
  label: string
  startedOn: string
  readiness: MissionStartReadiness
}

const MAX_MISSIONS = 20

export async function missionsStartingSoonNotReady(
  manager: EntityManager,
  workspaceId: string,
  now: Date = new Date(),
): Promise<MissionStartingSoon[]> {
  const candidates = returnedRows<{ id: string; label: string; started_on: string | Date }>(
    await manager.query(
      `SELECT m.id, m.label, m.started_on
         FROM missions m
        WHERE m.workspace_id = $1
          AND m.status = ANY($2)
          AND m.started_on IS NOT NULL
          AND m.started_on BETWEEN current_date AND current_date + $3::int
        ORDER BY m.started_on ASC
        LIMIT ${MAX_MISSIONS}`,
      [workspaceId, [...MISSION_PRE_START_STATUSES], MISSION_START_ANNOUNCE_WINDOW_DAYS],
    ),
  )
  const out: MissionStartingSoon[] = []
  for (const row of candidates) {
    const readiness = await loadMissionStartReadiness(manager, workspaceId, row.id, now)
    if (!readiness || readiness.verdict === 'ready') continue
    const startedOn =
      row.started_on instanceof Date ? row.started_on.toISOString().slice(0, 10) : String(row.started_on)
    out.push({ missionId: row.id, label: row.label, startedOn, readiness })
  }
  return out
}
