import { describe, expect, it } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import { selectAccountLastOutcome } from './account-last-outcome'

function item(over: Partial<ActionPlanItem>): ActionPlanItem {
  return {
    id: crypto.randomUUID(),
    account_id: 'a0000000-0000-4000-8000-000000000001',
    label: 'Appeler',
    contact_id: null,
    execution_status: 'todo',
    outcome: null,
    result: null,
    completed_at: null,
    due_date: null,
    reason: null,
    ...over,
  } as ActionPlanItem
}

/**
 * #3265.13 (épopée #3287) — le tableau de bord Aujourd'hui LIT le dernier
 * résultat déclaré du compte, sur la même ligne que le Plan de compte et la
 * fiche Contact (`action_plan_items`) : jamais une seconde copie.
 */
describe('selectAccountLastOutcome — #3265.13', () => {
  it('prend la dernière action FAITE du compte qui porte une issue', () => {
    const last = selectAccountLastOutcome([
      item({ id: 'old', execution_status: 'done', outcome: 'positive', completed_at: '2026-09-01T10:00:00Z' }),
      item({ id: 'new', execution_status: 'done', outcome: 'orientation_given', completed_at: '2026-09-20T10:00:00Z' }),
      item({ id: 'open', execution_status: 'todo' }),
    ])
    expect(last?.id).toBe('new')
  })

  it('une action faite SANS issue ne fait pas une issue (on n’affiche pas ce qu’on n’a pas)', () => {
    const last = selectAccountLastOutcome([item({ execution_status: 'done', outcome: null })])
    expect(last).toBeNull()
  })

  it('aucune action faite : rien', () => {
    expect(selectAccountLastOutcome([])).toBeNull()
  })
})
