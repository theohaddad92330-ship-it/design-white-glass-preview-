import type { MissionStatus } from '@bellum/contracts'

/**
 * Théo C missions-dossier.N1 — les cinq étapes de la VIE d'une mission (et non de sa chaîne du cash,
 * que porte `MissionChainStrip`). « Passation » n'existe pas comme statut : elle se DÉRIVE.
 *
 * Correspondance écrite statut → étape (rien n'est perdu, le statut reste la vérité stockée) :
 *  - Accord     : draft
 *  - Démarrage  : onboarding · ready_to_start
 *  - Mission    : active · at_risk · paused · renewal_pending
 *  - Passation  : ending, OU une mission en cours dont la fin tombe dans les 30 jours
 *  - Clôture    : ended · completed · terminated · renewed · cancelled · archived
 */
export const MISSION_LIFECYCLE_STAGES = ['agreement', 'start', 'mission', 'handover', 'closure'] as const
type MissionLifecycleStage = (typeof MISSION_LIFECYCLE_STAGES)[number]

const HANDOVER_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

const STAGE_BY_STATUS: Readonly<Record<MissionStatus, MissionLifecycleStage>> = {
  draft: 'agreement',
  onboarding: 'start',
  ready_to_start: 'start',
  active: 'mission',
  at_risk: 'mission',
  paused: 'mission',
  renewal_pending: 'mission',
  ending: 'handover',
  ended: 'closure',
  completed: 'closure',
  terminated: 'closure',
  renewed: 'closure',
  cancelled: 'closure',
  archived: 'closure',
}

export function missionLifecycleStage(
  mission: { status: MissionStatus; endsOn: string | null },
  now: Date,
): MissionLifecycleStage {
  const stage = STAGE_BY_STATUS[mission.status]
  if (stage !== 'mission' || !mission.endsOn) return stage
  const end = Date.parse(mission.endsOn)
  if (Number.isNaN(end)) return stage
  const daysLeft = (end - now.getTime()) / DAY_MS
  return daysLeft >= 0 && daysLeft <= HANDOVER_WINDOW_DAYS ? 'handover' : stage
}
