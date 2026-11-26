import {
  AUTOMATION_TEMPLATES,
  type AutomationRuleView,
  type RoutineView,
  type WorkflowDefinition,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildAutomationRows, countLabel, filterRows, templatesToOffer } from './automationRows'

/**
 * Lot L-D1 (#4167) — UNE liste, UNE grammaire : règles neuves, routines planifiées, workflows Action OS.
 */

const rule = (overrides: Partial<AutomationRuleView> = {}): AutomationRuleView => ({
  id: 'r1',
  signal: 'tender',
  action_kind: 'enroll_sequence',
  playbook_key: 'tender',
  prepared_action: null,
  inactive_days: null,
  enabled: true,
  credit_cap: null,
  credit_cost: 0,
  firings_30d: 3,
  skipped_30d: 1,
  credits_spent_30d: 0,
  last_run_at: '2026-10-14T06:20:00.000Z',
  template_key: null,
  created_at: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

const routine = (key: string, status: 'active' | 'paused'): RoutineView =>
  ({
    definition: { key, name: { fr: key, en: key } },
    subscription: { key, status, enabled: status === 'active' },
    blockers: [],
  }) as unknown as RoutineView

const workflow = (key: string, enabled: boolean): WorkflowDefinition =>
  ({ key, enabled, name: { fr: key, en: key }, trigger: 'signal_detected' }) as unknown as WorkflowDefinition

describe('Théo C automations-liste.HT-4 — les routines de mission portent l’origine « mission »', () => {
  it('une routine de mission devient une carte « mission », les autres routines gardent « routine »', () => {
    const rows = buildAutomationRows({
      rules: [],
      routines: [routine('timesheet_chase', 'active'), routine('daily_briefing', 'active')],
      workflows: [],
    })
    expect(rows.map(row => [row.id, row.origin])).toEqual([
      ['routine:daily_briefing', 'routine'],
      ['routine:timesheet_chase', 'mission'],
    ])
    expect(filterRows(rows, ['mission']).map(row => row.id)).toEqual(['routine:timesheet_chase'])
  })
})

describe('buildAutomationRows', () => {
  it('fusionne les trois sources en UNE liste, chaque ligne gardant son origine', () => {
    const rows = buildAutomationRows({
      rules: [rule()],
      routines: [routine('daily_briefing', 'active')],
      workflows: [workflow('signal_to_account_opening', true)],
    })
    expect(rows.map(row => row.origin)).toEqual(['rule', 'routine', 'workflow'])
  })

  it('les lignes actives passent avant les éteintes, puis les règles avant le reste', () => {
    const rows = buildAutomationRows({
      rules: [rule({ id: 'off', enabled: false }), rule({ id: 'on' })],
      routines: [routine('a', 'paused'), routine('b', 'active')],
      workflows: [],
    })
    expect(rows.map(row => row.id)).toEqual(['rule:on', 'routine:b', 'rule:off', 'routine:a'])
  })

  it('un workflow porte l’état de son catalogue ; une routine, celui de son abonnement', () => {
    const rows = buildAutomationRows({
      rules: [],
      routines: [routine('a', 'paused')],
      workflows: [workflow('w', true)],
    })
    expect(rows.find(row => row.origin === 'routine')?.enabled).toBe(false)
    expect(rows.find(row => row.origin === 'workflow')?.enabled).toBe(true)
  })

  it('rend une liste vide quand il n’y a rien — jamais une ligne inventée', () => {
    expect(buildAutomationRows({ rules: [], routines: [], workflows: [] })).toEqual([])
  })
})

describe('filterRows', () => {
  it('plusieurs origines cochées : leur union (multi-sélection)', () => {
    const rows = buildAutomationRows({
      rules: [rule({ id: 'a' })],
      routines: [routine('daily_briefing', 'active')],
      workflows: [],
    })
    expect(filterRows(rows, ['rule', 'routine'])).toHaveLength(2)
  })

  it('filtre par origine ; « toutes » ne filtre rien', () => {
    const rows = buildAutomationRows({
      rules: [rule()],
      routines: [routine('a', 'active')],
      workflows: [workflow('w', true)],
    })
    expect(filterRows(rows, [])).toHaveLength(3)
    expect(filterRows(rows, ['routine']).map(row => row.origin)).toEqual(['routine'])
  })
})

describe('countLabel', () => {
  it('null = non mesuré, jamais 0', () => {
    expect(countLabel(null)).toEqual({ kind: 'unmeasured' })
  })
  it('0 mesuré reste 0', () => {
    expect(countLabel(0)).toEqual({ kind: 'count', value: 0 })
    expect(countLabel(4)).toEqual({ kind: 'count', value: 4 })
  })
})

describe('templatesToOffer', () => {
  it('propose les six modèles quand aucune règle n’existe', () => {
    expect(templatesToOffer([])).toHaveLength(AUTOMATION_TEMPLATES.length)
  })

  it('ne repropose pas un modèle déjà installé (même signal, même séquence)', () => {
    const offered = templatesToOffer([rule({ signal: 'tender', playbook_key: 'tender' })])
    expect(offered.map(template => template.signal)).not.toContain('tender')
    expect(offered).toHaveLength(AUTOMATION_TEMPLATES.length - 1)
  })

  it('une règle du même signal mais d’une autre séquence ne masque pas le modèle', () => {
    const offered = templatesToOffer([rule({ signal: 'tender', playbook_key: 'warm_contact' })])
    expect(offered.map(template => template.signal)).toContain('tender')
  })
})
