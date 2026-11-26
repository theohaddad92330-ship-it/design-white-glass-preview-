import { describe, expect, it } from 'vitest'
import { reviewSelection } from './selection-review'

const c = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  full_name: `Contact ${id}`,
  email: `${id}@corp.fr`,
  excluded_at: null as string | null,
  ...over,
})

describe('reviewSelection (#3701.3 / #3701.8)', () => {
  it('compte exactement les identités, rien de plus', () => {
    const review = reviewSelection([c('a'), c('b'), c('c')])
    expect(review.total).toBe(3)
    expect(review.withoutEmail).toEqual([])
    expect(review.excluded).toEqual([])
    expect(review.homonymGroups).toEqual([])
  })

  it('nomme chaque cas à part : sans e-mail, exclu, homonymes', () => {
    const review = reviewSelection([
      c('a', { full_name: 'Claire Dubois' }),
      c('b', { full_name: 'Claire Dubois', email: null }),
      c('x', { excluded_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(review.withoutEmail.map(r => r.id)).toEqual(['b'])
    expect(review.excluded.map(r => r.id)).toEqual(['x'])
    expect(review.homonymGroups.map(g => g.map(r => r.id))).toEqual([['a', 'b']])
    expect(review.total).toBe(3)
  })

  it('un contact exclu ne compte pas parmi les « sans e-mail » deux fois', () => {
    const review = reviewSelection([c('x', { excluded_at: '2026-09-01T00:00:00Z', email: null })])
    expect(review.excluded).toHaveLength(1)
    expect(review.withoutEmail).toHaveLength(0)
  })

  it('une sélection vide ne dit rien (jamais « 0 problème »)', () => {
    expect(reviewSelection([]).total).toBe(0)
  })
})
