import type { AccountSignalItem } from '@bellum/contracts'
import { attachDecisionMakers } from './signal-decision-makers'

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const A3 = '33333333-3333-4333-8333-333333333333'

const signal = (id: string, accountId: string): AccountSignalItem => ({
  id,
  account_id: accountId,
  account_created_at: '2026-10-01T00:00:00.000Z',
  account_score: 8,
  company_name: 'ACME',
  date: '2026-10-10',
  label: 'Recrute 12 ingénieurs data',
  sector: 'Services',
  source: 'Presse',
  type: 'Recrutement',
})

describe('attachDecisionMakers — « qui ça concerne » (#4088.2)', () => {
  const head = { contact_id: 'c-1', name: 'Marie Durand', title: 'Directrice des SI' }

  it('accroche le décideur de tête à CHAQUE signal de son compte, nom et poste en clair', () => {
    const out = attachDecisionMakers([signal('s1', A1), signal('s2', A1)], new Map([[A1, head]]))
    expect(out.map(item => item.decision_maker)).toEqual([head, head])
  })

  it('un compte sans contact classable porte null — jamais un nom deviné', () => {
    const out = attachDecisionMakers([signal('s1', A2)], new Map([[A2, null]]))
    expect(out[0]?.decision_maker).toBeNull()
  })

  it('un compte dont la lecture n’a pas abouti reste intact (champ absent = non lu)', () => {
    const out = attachDecisionMakers([signal('s1', A3)], new Map([[A1, head]]))
    expect(out[0]).not.toHaveProperty('decision_maker')
  })

  it('carte vide : la liste est rendue telle quelle', () => {
    const items = [signal('s1', A1)]
    expect(attachDecisionMakers(items, new Map())).toBe(items)
  })
})
