import { describe, expect, it } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import { applyPatch, snoozeUntil } from './usePlanItems'

const base: ActionPlanItem = {
  id: 'i1',
  account_id: 'acc-1',
  label: 'Relancer Marc',
  week_index: 0,
  step_index: 0,
  done: false,
  due_date: null,
  completed_at: null,
  execution_status: 'todo',
  snoozed_until: null,
  assigned_to: null,
  // #2123.46 — le responsable saisi à la main : absent d'une ligne historique.
  owner_name: null,
  expected_outcome: null,
  kpi: null,
  channel: null,
  result: null,
  // #2123.1-.31 — une action porte son objet canonique et ses champs. Ici,
  // une ligne HISTORIQUE : rien n'est rattaché, et rien n'est mesuré.
  target: null,
  reason: null,
  contact_id: null,
  depends_on_item_id: null,
  provenance: null,
  confidence: null,
  cost_credits: null,
  outcome: null,
  completion_mode: null,
  source_recommendation: null,
  method_rule: null,
  external_execution_id: null,
  stop_condition: null,
  send_status: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('applyPatch — issue de complétion (#2396.1/.2)', () => {
  it("pose l'issue et le mode 'manual' en ENTRANT dans fait", () => {
    const next = applyPatch(base, { execution_status: 'done', outcome: 'positive' })
    expect(next.outcome).toBe('positive')
    expect(next.completion_mode).toBe('manual')
  })

  it("ne repose pas l'issue sur un re-patch d'une ligne DÉJÀ faite", () => {
    const done = {
      ...base,
      execution_status: 'done' as const,
      outcome: 'positive' as const,
      completion_mode: 'manual' as const,
    }
    const next = applyPatch(done, { assigned_to: 'user-2' })
    expect(next.outcome).toBe('positive')
    expect(next.completion_mode).toBe('manual')
  })
})

describe('snoozeUntil', () => {
  it('returns the ISO timestamp N days after the reference date', () => {
    expect(snoozeUntil(3, new Date('2026-01-01T09:00:00.000Z'))).toBe('2026-01-04T09:00:00.000Z')
    expect(snoozeUntil(7, new Date('2026-01-01T09:00:00.000Z'))).toBe('2026-01-08T09:00:00.000Z')
  })
})

describe('applyPatch — optimistic lifecycle', () => {
  it('marks done via the legacy flag and mirrors execution_status', () => {
    const next = applyPatch(base, { done: true })
    expect(next.done).toBe(true)
    expect(next.execution_status).toBe('done')
    expect(next.completed_at).not.toBeNull()
  })

  it('marks done via execution_status', () => {
    const next = applyPatch(base, { execution_status: 'done' })
    expect(next.done).toBe(true)
    expect(next.execution_status).toBe('done')
    expect(next.completed_at).not.toBeNull()
  })

  it('snoozes: keeps done=false and carries snoozed_until', () => {
    const next = applyPatch(base, { execution_status: 'snoozed', snoozed_until: '2026-08-01T09:00:00.000Z' })
    expect(next.execution_status).toBe('snoozed')
    expect(next.done).toBe(false)
    expect(next.snoozed_until).toBe('2026-08-01T09:00:00.000Z')
  })

  it('reopening to todo clears completion and snooze', () => {
    const snoozed = { ...base, execution_status: 'snoozed' as const, snoozed_until: '2026-08-01T09:00:00.000Z' }
    const next = applyPatch(snoozed, { execution_status: 'todo' })
    expect(next.execution_status).toBe('todo')
    expect(next.done).toBe(false)
    expect(next.snoozed_until).toBeNull()
    expect(next.completed_at).toBeNull()
  })

  it('assigns / unassigns', () => {
    expect(applyPatch(base, { assigned_to: 'user-2' }).assigned_to).toBe('user-2')
    expect(applyPatch({ ...base, assigned_to: 'user-2' }, { assigned_to: null }).assigned_to).toBeNull()
  })

  // #2153.57 — le résultat, optimiste comme les autres champs du patch.
  it('sets / clears the result', () => {
    expect(applyPatch(base, { result: 'Le DSI a validé le budget' }).result).toBe('Le DSI a validé le budget')
    expect(applyPatch({ ...base, result: 'Ancien résultat' }, { result: null }).result).toBeNull()
  })
})
