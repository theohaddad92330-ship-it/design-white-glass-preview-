import type { FeedbackAxis, FeedbackVerdict } from '@bellum/contracts'
import { needFeedbackLearnings } from './need-feedback-learnings'

/** #2178.33/.34 — le décompte des refus déjà enregistrés, par axe. */

function feedback(
  overrides: Partial<Record<FeedbackAxis, FeedbackVerdict>> = {},
): Record<FeedbackAxis, FeedbackVerdict> {
  const unknown: FeedbackVerdict = 'unknown'
  return {
    technical: unknown,
    experience: unknown,
    communication: unknown,
    price: unknown,
    seniority: unknown,
    context: unknown,
    availability: unknown,
    location: unknown,
    timing: unknown,
    other: unknown,
    personality: unknown,
    ...overrides,
  }
}

describe('needFeedbackLearnings', () => {
  it('rend [] quand aucun feedback n’existe — jamais un décompte inventé (GA-18/19)', () => {
    expect(needFeedbackLearnings([])).toEqual([])
  })

  it('rend [] quand aucun feedback ne porte de verdict "below"', () => {
    expect(needFeedbackLearnings([feedback({ price: 'meets', seniority: 'above' })])).toEqual([])
  })

  it('compte un verdict "below" par axe, jamais "meets"/"above"/"unknown"', () => {
    const result = needFeedbackLearnings([feedback({ price: 'below', seniority: 'meets', context: 'above' })])
    expect(result).toEqual([{ axis: 'price', belowCount: 1 }])
  })

  it('additionne plusieurs feedbacks sur le même axe', () => {
    const result = needFeedbackLearnings([
      feedback({ price: 'below' }),
      feedback({ price: 'below' }),
      feedback({ price: 'meets' }),
    ])
    expect(result).toEqual([{ axis: 'price', belowCount: 2 }])
  })

  it('trie par fréquence décroissante, puis par nom d’axe (déterministe)', () => {
    const result = needFeedbackLearnings([
      feedback({ availability: 'below' }),
      feedback({ price: 'below' }),
      feedback({ price: 'below' }),
    ])
    expect(result).toEqual([
      { axis: 'price', belowCount: 2 },
      { axis: 'availability', belowCount: 1 },
    ])
  })

  it('un même feedback compte sur PLUSIEURS axes s’il en porte plusieurs', () => {
    const result = needFeedbackLearnings([feedback({ price: 'below', timing: 'below' })])
    expect(result).toEqual([
      { axis: 'price', belowCount: 1 },
      { axis: 'timing', belowCount: 1 },
    ])
  })
})
