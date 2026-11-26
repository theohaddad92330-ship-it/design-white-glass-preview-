import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { positionnementStep } from './positionnement'

/**
 * #2539.2 — Ludovic (call bêta 17/09) a hésité entre « assistance technique »
 * et « régie » sur cette étape : le libellé seul ne suffit pas à quelqu'un
 * qui ne connaît pas notre vocabulaire. Chaque choix de `positioning` porte
 * désormais une phrase (`descriptionKey`), dans LES DEUX langues — cette
 * garde échoue tant qu'un choix reste muet ou qu'une des deux locales n'a
 * pas la clé.
 */
describe("positionnement — chaque type de prestation explique ce qu'il recouvre (#2539)", () => {
  const question = positionnementStep.questions.find(q => q.key === 'positioning')
  if (!question || question.kind !== 'single') throw new Error('positioning introuvable ou pas single')

  it('le corpus de la garde n’est pas vide', () => {
    expect(question.choices.length).toBeGreaterThanOrEqual(5)
  })

  it.each(question.choices)('« $value » porte une descriptionKey', choice => {
    expect(choice.descriptionKey, choice.value).toBeTruthy()
  })

  const locales = [
    { lang: 'fr', file: fr },
    { lang: 'en', file: en },
  ] as const

  it.each(locales)('$lang : chaque descriptionKey résout un texte non vide', ({ file }) => {
    for (const choice of question.choices) {
      const path = choice.descriptionKey?.split('.') ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = path.reduce<any>((node, segment) => node?.[segment], file)
      expect(typeof text, `${choice.value} → ${choice.descriptionKey}`).toBe('string')
      expect((text as string)?.trim().length ?? 0, `${choice.value} → ${choice.descriptionKey}`).toBeGreaterThan(10)
    }
  })
})
