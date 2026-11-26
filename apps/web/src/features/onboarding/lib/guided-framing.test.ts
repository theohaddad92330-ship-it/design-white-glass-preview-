import { describe, expect, it } from 'vitest'
import { ONBOARDING_ESSENTIAL_V23, ONBOARDING_GUIDED_V23, ONBOARDING_THEMES_V23 } from '@bellum/contracts'
import {
  ESSENTIAL_STEPS,
  GUIDED_STEPS,
  distinctQuestionCount,
  initialFramingLocation,
  resolveQuestion,
  stepProgress,
  treatedCount,
} from './guided-framing'
import { THEME_SLUGS } from './theme-map'

describe('Théo O onboarding-guide — le cadrage en deux marches', () => {
  it('range TOUTES les clés du catalogue V23 : aucune question perdue en route', () => {
    const wanted = [...ONBOARDING_ESSENTIAL_V23, ...ONBOARDING_GUIDED_V23].flatMap(step => step.keys)
    expect(wanted.filter(key => !resolveQuestion(key))).toEqual([])
    expect(ESSENTIAL_STEPS.flatMap(s => s.questions)).toHaveLength(18)
    expect(GUIDED_STEPS).toHaveLength(8)
  })

  it('les 16 thèmes du contrat et nos slugs suivent le même ordre', () => {
    expect(ONBOARDING_THEMES_V23).toHaveLength(THEME_SLUGS.length)
    expect(GUIDED_STEPS[0]?.themeSlugs).toEqual(['ton-entreprise', 'ton-role-et-ton-equipe'])
  })

  it('un repère partagé entre l’essentiel et le guide ne compte qu’une fois', () => {
    const all = [...ESSENTIAL_STEPS, ...GUIDED_STEPS]
    const raw = all.flatMap(s => s.questions).length
    expect(distinctQuestionCount(all)).toBeLessThan(raw)
  })

  it('un bloc sans réponse n’est pas « 0 » : treated vaut null (rail « À commencer »)', () => {
    expect(stepProgress(ESSENTIAL_STEPS[0]!, {}, {}).treated).toBeNull()
  })

  it('une réponse OU une incertitude déclarée est un repère traité', () => {
    const block = ESSENTIAL_STEPS[0]!
    const answers = { esn_name: 'Altimance', esn_maturity_situation: 'Je ne sais pas' }
    expect(stepProgress(block, answers, {}).treated).toBe(2)
    expect(treatedCount([block], answers, {})).toBe(2)
  })

  it('ouvre l’essentiel tant que ses blocs ne sont pas traités, une cible gagne', () => {
    expect(initialFramingLocation(null, {}, {})).toEqual({ phase: 'essential' })
    expect(initialFramingLocation('horizon', {}, {})).toEqual({ phase: 'guided', stepIndex: 4 })
  })

  it('reprend à la première étape guidée inachevée quand l’essentiel est posé', () => {
    const statuses: Record<string, 'not_yet_known'> = {}
    for (const question of ESSENTIAL_STEPS.flatMap(s => s.questions)) statuses[question.key] = 'not_yet_known'
    const next = initialFramingLocation(null, {}, statuses)
    expect(next).toEqual({ phase: 'guided', stepIndex: 0 })
  })
})
