import { describe, expect, it } from 'vitest'
import { missionStatusSchema } from './mission.js'
import { columnForMission } from './mission-board.js'
import {
  ASSIGNMENT_STATUSES,
  assignmentStatusMove,
  MISSION_STATUS_PHASE,
  missionStatusMove,
} from './status-transitions.js'

// Tranché par Louis 22/09 soir (decisions §9) : table STRICTE, en avant par
// défaut (brouillon → signée → en cours → terminée/archivée), retour arrière
// permis avec motif journalisé.
describe('#2407.5 — la state machine de la MISSION', () => {
  it('porte les onze statuts de l’issue, les six historiques restent acceptés (GA-08 : ajout en fin)', () => {
    const options = missionStatusSchema.options
    expect(options.slice(0, 6)).toEqual(['onboarding', 'active', 'paused', 'ended', 'terminated', 'renewed'])
    for (const status of [
      'draft',
      'ready_to_start',
      'active',
      'paused',
      'at_risk',
      'renewal_pending',
      'ending',
      'completed',
      'terminated',
      'cancelled',
      'archived',
    ]) {
      expect(options).toContain(status)
    }
  })

  it('le chemin en avant passe : brouillon → signée → en cours → fin → terminée → archivée', () => {
    expect(missionStatusMove('draft', 'ready_to_start')).toBe('forward')
    expect(missionStatusMove('ready_to_start', 'active')).toBe('forward')
    expect(missionStatusMove('active', 'ending')).toBe('forward')
    expect(missionStatusMove('ending', 'completed')).toBe('forward')
    expect(missionStatusMove('completed', 'archived')).toBe('forward')
  })

  it('un SAUT d’étape en avant est refusé — la table est stricte', () => {
    expect(missionStatusMove('draft', 'completed')).toBe('refused')
    expect(missionStatusMove('draft', 'active')).toBe('refused')
  })

  it('un retour arrière est PERMIS, et nommé comme tel (le motif est exigé par l’appelant)', () => {
    expect(missionStatusMove('completed', 'active')).toBe('backward')
    expect(missionStatusMove('archived', 'completed')).toBe('backward')
  })

  it('deux fins ne s’échangent pas : terminée ↔ interrompue est refusé', () => {
    expect(missionStatusMove('completed', 'terminated')).toBe('refused')
    expect(missionStatusMove('ended', 'terminated')).toBe('refused')
  })

  it('chaque statut a une phase et une colonne de tableau — aucune mission ne disparaît', () => {
    for (const status of missionStatusSchema.options) {
      expect(MISSION_STATUS_PHASE[status]).toBeDefined()
      expect(columnForMission(status)).toBeDefined()
    }
  })
})

describe('#2407.6 — la state machine de l’AFFECTATION, indépendante de la mission', () => {
  it('porte les dix statuts de l’issue', () => {
    expect(ASSIGNMENT_STATUSES).toEqual([
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
    ])
  })

  it('en avant, retour arrière nommé, saut refusé', () => {
    expect(assignmentStatusMove('planned', 'confirmed')).toBe('forward')
    expect(assignmentStatusMove('active', 'replaced')).toBe('forward')
    expect(assignmentStatusMove('completed', 'active')).toBe('backward')
    expect(assignmentStatusMove('planned', 'completed')).toBe('refused')
    expect(assignmentStatusMove('replaced', 'completed')).toBe('refused')
  })
})
