import { describe, expect, it } from 'vitest'
import { computeMissionPrimaryAction, MISSION_PRIMARY_ACTION_STATES } from './mission-primary-action.js'
import type { MissionEndChecklist } from './mission-end.js'
import type { MissionStartReadiness } from './mission-start-readiness.js'

const NO_READINESS: MissionStartReadiness | null = null
const NO_CHECKLIST: MissionEndChecklist | null = null

const readiness = (verdict: MissionStartReadiness['verdict'], missing: MissionStartReadiness['missing'] = []) =>
  ({ verdict, agreementsPending: false, missing, reserves: [], items: [] }) as MissionStartReadiness

const checklist = (verdict: MissionEndChecklist['verdict'], missing: MissionEndChecklist['missing'] = []) =>
  ({ verdict, done: [], missing, items: [] }) as MissionEndChecklist

describe('#2953 (#2193.53) — cinq états, jamais un sixième', () => {
  it('nomme exactement les cinq états, et cinq seulement', () => {
    expect(MISSION_PRIMARY_ACTION_STATES).toEqual([
      'confirm_availability',
      'complete_start',
      'complete_end_checklist',
      'decide_renewal',
      'on_track',
    ])
  })
})

describe('#2953 (#2193.53, .57) — computeMissionPrimaryAction', () => {
  it('NO-GO : une interruption non revalidée passe avant tout, sans exception', () => {
    const action = computeMissionPrimaryAction({
      status: 'terminated',
      startReadiness: readiness('blocked', ['client_agreement']),
      endChecklist: checklist('in_progress', ['client_handover']),
      interruption: { availabilityConfirmed: false } as never,
      risks: ['renewal_not_started'],
    })
    expect(action.state).toBe('confirm_availability')
    // #2193.57 — explicable : pas de raisons devinées sur un état qui n'en porte pas.
    expect(action.reasons).toEqual([])
  })

  it('un démarrage bloqué ou incomplet nomme ses prérequis manquants', () => {
    const action = computeMissionPrimaryAction({
      status: 'onboarding',
      startReadiness: readiness('blocked', ['client_agreement', 'contract_signed']),
      endChecklist: NO_CHECKLIST,
      interruption: null,
      risks: [],
    })
    expect(action.state).toBe('complete_start')
    expect(action.reasons).toEqual(['client_agreement', 'contract_signed'])
  })

  it('une checklist de sortie incomplète ne compte que sur les statuts où elle explique la mission', () => {
    const active = computeMissionPrimaryAction({
      status: 'active',
      startReadiness: readiness('ready'),
      endChecklist: checklist('in_progress', ['client_payment']),
      interruption: null,
      risks: [],
    })
    expect(active.state).toBe('complete_end_checklist')
    expect(active.reasons).toEqual(['client_payment'])

    // Une mission encore en amont du démarrage n'a rien à sortir.
    const draft = computeMissionPrimaryAction({
      status: 'draft',
      startReadiness: readiness('incomplete', ['start_date']),
      endChecklist: checklist('in_progress', ['client_payment']),
      interruption: null,
      risks: [],
    })
    expect(draft.state).toBe('complete_start')
  })

  it('un renouvellement non engagé se décide quand rien de plus urgent ne bloque', () => {
    const action = computeMissionPrimaryAction({
      status: 'active',
      startReadiness: readiness('ready'),
      endChecklist: checklist('complete'),
      interruption: null,
      risks: ['renewal_not_started'],
    })
    expect(action.state).toBe('decide_renewal')
  })

  it('on_track est un CINQUIÈME état nommé, jamais un silence', () => {
    const action = computeMissionPrimaryAction({
      status: 'active',
      startReadiness: readiness('ready'),
      endChecklist: checklist('complete'),
      interruption: null,
      risks: [],
    })
    expect(action.state).toBe('on_track')
    expect(action.reasons).toEqual([])
  })

  it('sans lecture du panneau (readiness/checklist non chargés), ne fabrique aucun blocage', () => {
    const action = computeMissionPrimaryAction({
      status: 'active',
      startReadiness: NO_READINESS,
      endChecklist: NO_CHECKLIST,
      interruption: null,
      risks: [],
    })
    expect(action.state).toBe('on_track')
  })
})
