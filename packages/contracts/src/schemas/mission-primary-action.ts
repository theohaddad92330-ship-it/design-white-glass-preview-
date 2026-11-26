import type { MissionRisk, MissionStatus } from './mission.js'
import type { MissionEndChecklist, MissionEndCheckKey, MissionInterruption } from './mission-end.js'
import type { MissionStartItemKey, MissionStartReadiness } from './mission-start-readiness.js'

/**
 * #2953 (#2193.53, #2193.57) — L'ACTION PRINCIPALE D'UNE MISSION, un état
 * dynamique et EXPLICABLE, pas cinq panneaux qu'il faut tous lire pour savoir
 * lequel compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CINQ ÉTATS, ET DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre panneaux existent déjà et jugent chacun leur propre question —
 * démarrage ({@link MissionStartReadiness}), interruption
 * ({@link MissionInterruption}, NO-GO), sortie ({@link MissionEndChecklist}),
 * renouvellement (`mission.risks`, `renewal_not_started`). Aucun n'était
 * réduit à UNE action nommée : cette fonction ne recalcule rien, elle
 * PRIORISE ce que ces quatre calculs disent déjà, dans l'ordre où un geste
 * manqué coûte le plus cher — une disponibilité non revalidée (NO-GO) avant
 * un démarrage bloqué, avant une sortie incomplète, avant un renouvellement
 * qui dort.
 *
 * `on_track` n'est pas « rien à signaler » au sens d'un silence : c'est un
 * CINQUIÈME état nommé, explicitement rendu quand aucun des quatre autres ne
 * s'applique — jamais l'absence de carte.
 *
 * `reasons` NOMME ce qui explique l'état (clés du panneau source, jamais une
 * phrase) — un état sans ses raisons serait nu, ce que la doctrine interdit
 * pour un score ; la même règle s'applique ici à une action.
 */
export const MISSION_PRIMARY_ACTION_STATES = [
  'confirm_availability',
  'complete_start',
  'complete_end_checklist',
  'decide_renewal',
  'on_track',
] as const
export type MissionPrimaryActionState = (typeof MISSION_PRIMARY_ACTION_STATES)[number]

export interface MissionPrimaryAction {
  state: MissionPrimaryActionState
  reasons: readonly (MissionStartItemKey | MissionEndCheckKey)[]
}

/**
 * Les statuts AVANT démarrage — le même ensemble que `PRE_START` dans
 * `MissionEndChecklistPanel.tsx` et `MissionStartReadinessPanel.tsx` : la
 * checklist de sortie n'a pas de sens tant qu'une mission n'a pas commencé
 * (GA-26, un seul endroit — lu ici plutôt que réécrit).
 */
const PRE_START_STATUSES: ReadonlySet<MissionStatus> = new Set(['draft', 'onboarding', 'ready_to_start'])

export function computeMissionPrimaryAction(input: {
  status: MissionStatus
  startReadiness: MissionStartReadiness | null
  endChecklist: MissionEndChecklist | null
  interruption: MissionInterruption | null
  risks: readonly MissionRisk[]
}): MissionPrimaryAction {
  // NO-GO (#2414) — une interruption déclarée et non revalidée passe avant
  // tout : c'est la seule des quatre questions dont le silence AUTOMATISE
  // exactement ce que la doctrine interdit (disponibilité rendue sans geste).
  if (input.interruption && !input.interruption.availabilityConfirmed) {
    return { state: 'confirm_availability', reasons: [] }
  }

  if (
    input.startReadiness &&
    (input.startReadiness.verdict === 'blocked' || input.startReadiness.verdict === 'incomplete')
  ) {
    return { state: 'complete_start', reasons: input.startReadiness.missing }
  }

  if (input.endChecklist && input.endChecklist.verdict !== 'complete' && !PRE_START_STATUSES.has(input.status)) {
    return { state: 'complete_end_checklist', reasons: input.endChecklist.missing }
  }

  if (input.risks.includes('renewal_not_started')) {
    return { state: 'decide_renewal', reasons: [] }
  }

  return { state: 'on_track', reasons: [] }
}
