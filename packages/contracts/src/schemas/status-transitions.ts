import { z } from 'zod'
import type { MissionStatus } from './mission.js'
import type { MissionBoardColumn } from './mission-board.js'

/**
 * #2407.5 / #2407.6 — les state machines de la MISSION et de l'AFFECTATION.
 *
 * Tranché par Louis 22/09 soir (decisions §9) : table STRICTE, retour arrière
 * permis. En avant par défaut (brouillon → signée → en cours →
 * terminée/archivée) ; un retour arrière explicite est autorisé AVEC un motif
 * journalisé (`mission_status_transitions`) ; l'affectation reste indépendante
 * du statut de mission (#2407.7) — une affectation qui sort ne termine pas la
 * mission.
 *
 * Un seul endroit (GA-26) : l'API refuse avec cette table, l'écran la lit.
 */

/** Ce que vaut un changement de statut. */
export type StatusMove = 'same' | 'forward' | 'backward' | 'refused'

/** La PHASE d'un statut de mission — son rang sur le chemin en avant. */
export const MISSION_STATUS_PHASE: Readonly<
  Record<MissionStatus, 'draft' | 'signed' | 'running' | 'ending' | 'finished' | 'archived'>
> = {
  draft: 'draft',
  onboarding: 'signed',
  ready_to_start: 'signed',
  active: 'running',
  paused: 'running',
  at_risk: 'running',
  renewal_pending: 'running',
  renewed: 'running',
  ending: 'ending',
  ended: 'finished',
  completed: 'finished',
  terminated: 'finished',
  cancelled: 'finished',
  archived: 'archived',
}

const PHASE_RANK = { draft: 0, signed: 1, running: 2, ending: 3, finished: 4, archived: 5 } as const

const RUNNING: readonly MissionStatus[] = ['active', 'paused', 'at_risk', 'renewal_pending', 'renewed']

/** Les passages EN AVANT permis. Tout le reste en avant est refusé. */
const MISSION_FORWARD: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  draft: ['ready_to_start', 'onboarding', 'cancelled'],
  onboarding: ['active', 'cancelled'],
  ready_to_start: ['active', 'cancelled'],
  // Dans la phase « en cours », les statuts s'échangent librement.
  active: [...RUNNING, 'ending', 'completed', 'ended', 'terminated'],
  paused: [...RUNNING, 'ending', 'terminated'],
  at_risk: [...RUNNING, 'ending', 'terminated'],
  renewal_pending: [...RUNNING, 'ending', 'completed', 'ended', 'terminated'],
  renewed: [...RUNNING, 'ending', 'completed', 'ended', 'terminated'],
  ending: ['completed', 'ended', 'terminated'],
  ended: ['archived'],
  completed: ['archived'],
  terminated: ['archived'],
  cancelled: ['archived'],
  archived: [],
}

function move<S extends string>(
  from: S,
  to: S,
  forward: Readonly<Record<S, readonly S[]>>,
  rank: (status: S) => number,
): StatusMove {
  if (from === to) return 'same'
  if (forward[from]?.includes(to)) return 'forward'
  if (rank(to) < rank(from)) return 'backward'
  return 'refused'
}

/**
 * `forward` passe ; `backward` passe AVEC un motif (l'appelant l'exige et le
 * journalise) ; `refused` ne passe pas — un saut d'étape ou deux fins qui
 * s'échangent.
 */
export function missionStatusMove(from: MissionStatus, to: MissionStatus): StatusMove {
  return move(from, to, MISSION_FORWARD, status => PHASE_RANK[MISSION_STATUS_PHASE[status]])
}

/**
 * Le statut de mission qu'une colonne d'arrivée du tableau impose — déplacé
 * ici depuis `delivery.service.ts` (GA-26) pour que l'écran juge le même
 * déplacement que l'API. `null` pour les colonnes amont : elles décrivent un
 * PROJET, pas une mission.
 */
export function missionStatusForColumn(column: MissionBoardColumn): MissionStatus | null {
  switch (column) {
    case 'gagnee':
      return 'onboarding'
    case 'en_cours':
      return 'active'
    case 'renouvellement':
      return 'renewed'
    case 'terminee':
      return 'ended'
    case 'perdue':
      return 'terminated'
    case 'en_veille':
      return 'paused'
    default:
      return null
  }
}

// ── L'affectation (#2407.6) ─────────────────────────────────────────────────

export const ASSIGNMENT_STATUSES = [
  'planned',
  'confirmed',
  'active',
  'absent',
  'paused',
  'ending',
  'extended',
  'completed',
  'terminated',
  'replaced',
] as const
export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES)
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]

const ASSIGNMENT_RANK: Readonly<Record<AssignmentStatus, number>> = {
  planned: 0,
  confirmed: 1,
  active: 2,
  absent: 2,
  paused: 2,
  extended: 2,
  ending: 3,
  completed: 4,
  terminated: 4,
  replaced: 4,
}

const ON_ASSIGNMENT: readonly AssignmentStatus[] = ['active', 'absent', 'paused', 'extended']

const ASSIGNMENT_FORWARD: Readonly<Record<AssignmentStatus, readonly AssignmentStatus[]>> = {
  planned: ['confirmed', 'replaced', 'terminated'],
  confirmed: ['active', 'replaced', 'terminated'],
  active: [...ON_ASSIGNMENT, 'ending', 'completed', 'terminated', 'replaced'],
  absent: [...ON_ASSIGNMENT, 'ending', 'terminated', 'replaced'],
  paused: [...ON_ASSIGNMENT, 'ending', 'terminated', 'replaced'],
  extended: [...ON_ASSIGNMENT, 'ending', 'completed', 'terminated', 'replaced'],
  ending: ['completed', 'extended', 'terminated', 'replaced'],
  completed: [],
  terminated: [],
  replaced: [],
}

export function assignmentStatusMove(from: AssignmentStatus, to: AssignmentStatus): StatusMove {
  return move(from, to, ASSIGNMENT_FORWARD, status => ASSIGNMENT_RANK[status])
}

/** Le corps d'un changement de statut : le motif est exigé sur un retour arrière. */
export const statusChangeSchema = z
  .object({
    to: z.string().min(1).max(40),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
