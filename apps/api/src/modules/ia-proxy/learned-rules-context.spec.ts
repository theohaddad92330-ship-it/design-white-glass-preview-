import type { WorkspaceMethodRule } from '@bellum/contracts'
import { learnedRulesContextFor } from './learned-rules-context'

const rule = (over: Partial<WorkspaceMethodRule> = {}): WorkspaceMethodRule => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  proposal_id: '33333333-3333-4333-8333-333333333333',
  domain: 'Compte',
  statement: 'Sans sponsor identifié avant la démonstration, la perte suit à 90 jours.',
  owner: null,
  enabled: true,
  disabled_reason: null,
  promoted_at: '2026-10-02T09:00:00.000Z',
  activated_by: null,
  activated_at: '2026-10-02T10:00:00.000Z',
  ...over,
})

describe('learnedRulesContextFor — #3295 Laura cite les règles apprises de l’espace', () => {
  it('aucune règle active → null, jamais un bloc vide injecté', () => {
    expect(learnedRulesContextFor([])).toBeNull()
  })

  it('une règle DÉSACTIVÉE n’atteint jamais Laura, même si l’appelant la passe', () => {
    expect(learnedRulesContextFor([rule({ enabled: false, disabled_reason: 'activation_review_pending' })])).toBeNull()
  })

  it('nomme le domaine et l’énoncé de chaque règle active', () => {
    const text = learnedRulesContextFor([rule(), rule({ id: 'x', domain: 'Contact', statement: 'Un second énoncé.' })])
    expect(text).toContain('[Compte] Sans sponsor identifié')
    expect(text).toContain('[Contact] Un second énoncé.')
  })

  it('borne chaque énoncé et le total — Laura ne reçoit pas un manuel', () => {
    const long = 'x'.repeat(400)
    const text = learnedRulesContextFor(Array.from({ length: 5 }, (_, i) => rule({ id: `r${i}`, statement: long })))
    expect(text).not.toBeNull()
    expect(text!.length).toBeLessThanOrEqual(1201)
    expect(text).not.toContain(long)
  })
})
