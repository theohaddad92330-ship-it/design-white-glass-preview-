import { describe, expect, it } from 'vitest'
import { distributeApplyRequestSchema, orderAssigneeCandidates, planScopeDistribution } from './contact-distribution.js'

const scope = (user_id: string, entity_id: string | null, label = 'Zone') => ({ user_id, entity_id, label })
const contact = (id: string, entity_id: string | null, assigned_to: string | null = null) => ({
  id,
  entity_id,
  assigned_to,
})

describe('planScopeDistribution (#4996 L5)', () => {
  it('assigns a free contact to the single member covering its entity', () => {
    const plan = planScopeDistribution([contact('c1', 'e1')], [scope('lea', 'e1'), scope('claire', 'e2')])
    expect(plan.assignments).toEqual([{ contact_id: 'c1', user_id: 'lea' }])
    expect(plan.unchanged).toEqual([])
  })

  it('never touches a contact that already has a holder', () => {
    const plan = planScopeDistribution([contact('c1', 'e1', 'claire')], [scope('lea', 'e1')])
    expect(plan.assignments).toEqual([])
    expect(plan.unchanged).toEqual([])
  })

  it('leaves a contact covered by two different members unchanged', () => {
    const plan = planScopeDistribution([contact('c1', 'e1')], [scope('lea', 'e1'), scope('claire', 'e1')])
    expect(plan.assignments).toEqual([])
    expect(plan.unchanged).toEqual(['c1'])
  })

  it('counts one member holding two zones on the same entity as ONE candidate', () => {
    const plan = planScopeDistribution([contact('c1', 'e1')], [scope('lea', 'e1', 'A'), scope('lea', 'e1', 'B')])
    expect(plan.assignments).toEqual([{ contact_id: 'c1', user_id: 'lea' }])
  })

  it('leaves unchanged a contact without entity, and a free-text zone covers nothing', () => {
    const plan = planScopeDistribution(
      [contact('c1', null), contact('c2', 'e1')],
      [scope('lea', null, 'Paiements'), scope('claire', 'e9')],
    )
    expect(plan.assignments).toEqual([])
    expect(plan.unchanged).toEqual(['c1', 'c2'])
  })
})

describe('orderAssigneeCandidates (#4996 L5)', () => {
  const members = [
    { user_id: 'u-zoe', name: 'Zoé' },
    { user_id: 'u-lea', name: 'Léa' },
    { user_id: 'u-bob', name: 'Bob' },
    { user_id: 'u-ann', name: 'Ann' },
  ]

  it('puts covering members first, alphabetical, and hides nobody', () => {
    const out = orderAssigneeCandidates(members, [scope('u-zoe', 'e1', 'BNP CIB'), scope('u-lea', 'e1', 'CIB')], 'e1')
    expect(out.map(o => o.user_id)).toEqual(['u-lea', 'u-zoe', 'u-ann', 'u-bob'])
    expect(out[0].covers).toEqual(['CIB'])
    expect(out[2].covers).toEqual([])
    expect(out).toHaveLength(4)
  })

  it('keeps every member in plain alphabetical order when the contact has no entity', () => {
    const out = orderAssigneeCandidates(members, [scope('u-zoe', 'e1')], null)
    expect(out.map(o => o.user_id)).toEqual(['u-ann', 'u-bob', 'u-lea', 'u-zoe'])
    expect(out.every(o => o.covers.length === 0)).toBe(true)
  })
})

describe('distributeApplyRequestSchema', () => {
  it('requires a fingerprint', () => {
    expect(distributeApplyRequestSchema.safeParse({}).success).toBe(false)
    expect(distributeApplyRequestSchema.safeParse({ fingerprint: 'abcdef0123456789' }).success).toBe(true)
  })
})

describe('orderAssigneeCandidates — zone par BU (#4996.4)', () => {
  const members = [
    { user_id: 'u-zoe', name: 'Zoé' },
    { user_id: 'u-lea', name: 'Léa' },
    { user_id: 'u-bob', name: 'Bob' },
  ]
  const buScope = (user_id: string, business_unit_id: string, label: string) => ({
    user_id,
    entity_id: null,
    business_unit_id,
    label,
  })

  it('a member whose BU zone matches the account BU covers the contact', () => {
    const out = orderAssigneeCandidates(members, [buScope('u-zoe', 'bu-lyon', 'Agence Lyon')], null, 'bu-lyon')
    expect(out.map(o => o.user_id)).toEqual(['u-zoe', 'u-bob', 'u-lea'])
    expect(out[0].covers).toEqual(['Agence Lyon'])
  })

  it('a BU zone of another BU covers nothing', () => {
    const out = orderAssigneeCandidates(members, [buScope('u-zoe', 'bu-paris', 'Agence Paris')], 'e1', 'bu-lyon')
    expect(out.every(o => o.covers.length === 0)).toBe(true)
  })

  it('entity AND BU zones are a union: both labels are named', () => {
    const out = orderAssigneeCandidates(
      members,
      [scope('u-lea', 'e1', 'CIB'), buScope('u-lea', 'bu-lyon', 'Agence Lyon'), buScope('u-bob', 'bu-lyon', 'Lyon')],
      'e1',
      'bu-lyon',
    )
    expect(out.map(o => o.user_id)).toEqual(['u-bob', 'u-lea', 'u-zoe'])
    expect(out.find(o => o.user_id === 'u-lea')?.covers).toEqual(['CIB', 'Agence Lyon'])
  })

  it('a BU zone never feeds the automatic distribution (only entity zones distribute)', () => {
    const plan = planScopeDistribution([contact('c1', null)], [buScope('u-zoe', 'bu-lyon', 'Lyon')])
    expect(plan.assignments).toEqual([])
  })
})
