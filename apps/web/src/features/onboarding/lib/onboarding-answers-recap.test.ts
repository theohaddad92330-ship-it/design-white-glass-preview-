import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildAnswersRecap } from './onboarding-answers-recap'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

const fr = i18n.getFixedT('fr', 'onboarding') as TFunction<'onboarding'>

// #2087.30 — le drawer « Voir mes réponses », groupé par ÉTAPE.
describe('buildAnswersRecap', () => {
  it('#2087.30 — renvoie un groupe par étape TEMPS1, dans l’ordre du parcours', () => {
    const groups = buildAnswersRecap({}, fr)
    expect(groups.map(g => g.stageCode)).toEqual(['company_info', 'role', 'offer_expertise', 'target_market', 'goals'])
  })

  it('#2087.30 — une question jamais répondue n’apparaît pas (des réponses, pas un formulaire vide)', () => {
    const groups = buildAnswersRecap({}, fr)
    expect(groups.every(g => g.rows.length === 0)).toBe(true)
  })

  it('#2087.31 — chaque ligne ramène à la sous-étape qui pose RÉELLEMENT la question, pas la première de l’étape', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox', sales_team_size: '2-3 personnes' }
    const groups = buildAnswersRecap(answers, fr)
    const company = groups.find(g => g.stageCode === 'company_info')
    const nameRow = company?.rows.find(r => r.key === 'esn_name')
    const teamRow = company?.rows.find(r => r.key === 'sales_team_size')
    expect(nameRow).toMatchObject({ stageCode: 'company_info', slug: 'entreprise', value: 'Kicklox' })
    expect(teamRow).toMatchObject({ stageCode: 'company_info', slug: 'equipe-commerciale' })
  })
})
