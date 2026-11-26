import { describe, expect, it } from 'vitest'
import { CHOICE_ICON_KEYS } from './types'
import { maturiteStep } from './maturite'

/**
 * #2087.9 — réfuté en production le 18/09 sur `/onboarding/.../company_info/
 * maturite` : les cartes de « Où en est ton activité aujourd'hui ? » portent
 * bien une phrase et parfois un exemple, mais AUCUNE icône — le mécanisme
 * (`Choice.iconKey`, `ChoiceRow.tsx:33-90`) n'était prouvé QUE sur une
 * question FABRIQUÉE par le test, jamais sur ce catalogue RÉEL. Cette garde
 * lit le vrai `maturiteStep` (`lib/questions/maturite.ts`), pas un doublon —
 * elle échoue tant qu'une carte reste sans icône ou qu'une icône ne fait pas
 * partie du registre FERMÉ que `ChoiceRow` sait dessiner.
 */
describe('maturite — chaque carte de situation porte une icône (#2087.9)', () => {
  const question = maturiteStep.questions.find(q => q.key === 'esn_maturity_situation')
  if (!question || question.kind !== 'single') throw new Error('esn_maturity_situation introuvable ou pas single')

  it('le corpus de la garde est bien un choix unique COURT (rendu en cartes)', () => {
    expect(question.choices.length).toBeGreaterThan(0)
    expect(question.choices.length).toBeLessThanOrEqual(8)
  })

  it.each(question.choices)('« $value » porte une iconKey', choice => {
    expect(choice.iconKey, choice.value).toBeTruthy()
  })

  it.each(question.choices)('« $value » : iconKey fait partie du registre fermé de ChoiceRow', choice => {
    expect(choice.iconKey && CHOICE_ICON_KEYS.includes(choice.iconKey), choice.value).toBe(true)
  })
})
