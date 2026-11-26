import { describe, expect, it } from 'vitest'
import { TEMPS2_ANSWER_KEYS, TEMPS2_ANSWER_OPTIONS } from '@bellum/contracts'
import { COMPLEMENT_QUESTIONS } from '@/features/onboarding/lib/complement-questions'

/**
 * GOLDEN — the Temps-2 complement asks exactly what the contract declares.
 *
 * Two silent failures this guards against:
 *  1. a question whose `key` no longer maps to a column read by the prompts
 *     (`TEMPS2_ANSWER_KEYS` is the list of keys with a real consumer — asking
 *     anything else re-creates the « capturé ≠ consommé » pattern);
 *  2. a choice value drifting from the persisted catalog, which the French
 *     prompts pattern-match verbatim.
 */

function choiceValues(question: (typeof COMPLEMENT_QUESTIONS)[number]): string[] {
  if (question.kind === 'single' || question.kind === 'multi') return question.choices.map(c => c.value)
  if (question.kind === 'multi-grouped') return question.groups.flatMap(g => g.choices.map(c => c.value))
  return []
}

describe('complement-questions ↔ contracts (golden)', () => {
  it('asks every Temps-2 key exactly once, in contract order', () => {
    expect(COMPLEMENT_QUESTIONS.map(q => q.key)).toEqual([...TEMPS2_ANSWER_KEYS])
  })

  it('offers exactly the contract values for every choice question', () => {
    for (const question of COMPLEMENT_QUESTIONS) {
      const catalog = TEMPS2_ANSWER_OPTIONS[question.key as keyof typeof TEMPS2_ANSWER_OPTIONS]
      if (!catalog) continue
      expect(choiceValues(question), `values drifted for ${question.key}`).toEqual([...catalog])
    }
  })

  it('tells the user what every question improves', () => {
    // The product rule: no effort asked without a visible payback.
    for (const question of COMPLEMENT_QUESTIONS) {
      expect(question.impact, `no impact line for ${question.key}`).toBeTruthy()
      expect(question.label).toBeTruthy()
    }
  })

  it('keeps the free-text question free-text (references are never a catalog)', () => {
    const references = COMPLEMENT_QUESTIONS.find(q => q.key === 'client_references')
    expect(references?.kind).toBe('tags')
    expect(TEMPS2_ANSWER_OPTIONS).not.toHaveProperty('client_references')
  })
})
