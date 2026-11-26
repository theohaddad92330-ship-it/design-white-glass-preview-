import { describe, expect, it } from 'vitest'
import { TIMESHEET_STATUSES } from './mission.js'

/**
 * #4548 — la spec de #2415.3 demandait treize statuts, le code en compte neuf. La décision est écrite (docblock de
 * `TIMESHEET_STATUSES`) : on n'ajoute rien. Ce test la tient — ajouter un statut oblige à relire cette décision, et
 * à passer par la migration d'abord (GA-11 / GA-12), en fin d'enum (GA-08).
 */
describe('#4548 — le cycle de vie d’un relevé compte neuf statuts, par décision', () => {
  it('garde les neuf statuts, dans leur rang', () => {
    expect([...TIMESHEET_STATUSES]).toEqual([
      'draft',
      'submitted',
      'validated',
      'disputed',
      'expected',
      'missing',
      'not_required',
      'rejected',
      'escalated',
    ])
  })

  it.each(['under_review', 'client_validation_pending', 'corrected', 'waived'])(
    '%s n’est pas un statut : étape de revue ou raison, portée ailleurs',
    name => {
      expect((TIMESHEET_STATUSES as readonly string[]).includes(name)).toBe(false)
    },
  )

  it.each(['approved', 'not_applicable'])('%s existe déjà sous un autre nom (validated / not_required)', name => {
    expect((TIMESHEET_STATUSES as readonly string[]).includes(name)).toBe(false)
  })
})
