import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { questionsMatchingConditions } from './visibility'
import { quiFaitQuoiStep } from './qui-fait-quoi'

/**
 * #2037.1/.3/.4/.5/.6/.11/.12 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
 * du commercial, et son masquage pour une personne seule.
 */

const KEYS = [
  'associates_count',
  'recruiters_team_size',
  'delivery_team_size',
  'marketing_team_size',
  'ops_team_size',
  'team_coordination_mode',
] as const

function answers(sales_team_size: string | null): Partial<EsnAnswers> {
  return { sales_team_size }
}

describe('#2037.1/.3/.4/.5/.6/.11 — qui-fait-quoi pose les six questions', () => {
  it('porte exactement les six clés attendues, une par question', () => {
    expect(quiFaitQuoiStep.questions.map(q => q.key)).toEqual(KEYS)
  })
})

describe('#2037.12 — masquée en entier pour une personne seule', () => {
  it('SAIT DIRE NON : disparaît quand `sales_team_size` est solo', () => {
    const visible = questionsMatchingConditions(
      quiFaitQuoiStep.questions,
      answers('Je suis seul (fondateur / indépendant)'),
    )
    expect(visible).toEqual([])
  })

  it("reste posée quand l'ESN a une équipe commerciale", () => {
    const visible = questionsMatchingConditions(quiFaitQuoiStep.questions, answers('4-8 personnes'))
    expect(visible.map(q => q.key)).toEqual(KEYS)
  })

  it('reste posée par défaut, avant toute réponse (aucun `sales_team_size` déclaré)', () => {
    const visible = questionsMatchingConditions(quiFaitQuoiStep.questions, answers(null))
    expect(visible.map(q => q.key)).toEqual(KEYS)
  })
})
