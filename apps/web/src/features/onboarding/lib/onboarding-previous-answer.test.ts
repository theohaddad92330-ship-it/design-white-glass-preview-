import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { findSubStep, TEMPS1_SUBSTEPS } from './questions'
import { previousAnsweredQuestion } from './onboarding-previous-answer'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

const fr = i18n.getFixedT('fr', 'onboarding') as TFunction<'onboarding'>

// #2021.11 — résumé compact de la réponse précédente, en ligne.
describe('previousAnsweredQuestion', () => {
  it('#2021.11 — retrouve la dernière question répondue de la sous-étape précédente', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' }
    const equipe = findSubStep('company_info', 'equipe-commerciale')!
    expect(previousAnsweredQuestion(equipe, answers, fr)).toMatchObject({
      labelKey: 'questions.esnName.label',
      value: 'Kicklox',
    })
  })

  it('#2021.11 — rien avant la toute première sous-étape : jamais un placeholder', () => {
    expect(previousAnsweredQuestion(TEMPS1_SUBSTEPS[0], {}, fr)).toBeNull()
  })

  it('#2021.11 — une sous-étape intermédiaire sans réponse ne casse pas la remontée', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' } // equipe-commerciale reste vide
    const entreprise = findSubStep('company_info', 'entreprise')!
    const target = TEMPS1_SUBSTEPS[entreprise.index + 2]
    expect(previousAnsweredQuestion(target, answers, fr)).toMatchObject({
      labelKey: 'questions.esnName.label',
      value: 'Kicklox',
    })
  })
})
