import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { roleStep } from './role'

/**
 * #2088.3 — réfuté en production le 18/09 sur `/onboarding/.../role/role` :
 * « Quel est ton rôle principal ? » s'affiche bien en liste RECHERCHABLE (18
 * entrées, au-delà du seuil de 8), mais aucune entrée ne portait de
 * description — le mécanisme (`Choice.descriptionKey`, `ChoiceRow.tsx`,
 * `SearchableSingleChoiceField`) n'était prouvé QUE sur une question
 * FABRIQUÉE par le test (`QuestionField.test.tsx`), jamais sur ce catalogue
 * RÉEL. Cette garde lit le vrai `roleStep` (`lib/questions/role.ts`), pas un
 * doublon — elle échoue tant qu'une entrée reste muette ou qu'une des deux
 * locales n'a pas la clé (même patron que #2539, `offre-prestations.test.ts`).
 */
describe('role — chaque rôle long porte une description qui le distingue (#2088.3)', () => {
  const question = roleStep.questions.find(q => q.key === 'user_role')
  if (!question || question.kind !== 'single') throw new Error('user_role introuvable ou pas single')

  it('le corpus de la garde est bien un choix unique LONG (au-delà du seuil de 8)', () => {
    expect(question.choices.length).toBeGreaterThan(8)
  })

  it.each(question.choices)('« $value » porte une descriptionKey', choice => {
    expect(choice.descriptionKey, choice.value).toBeTruthy()
  })

  it('aucune descriptionKey ne se répète entre deux rôles', () => {
    const keys = question.choices.map(c => c.descriptionKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  const locales = [
    { lang: 'fr', file: fr },
    { lang: 'en', file: en },
  ] as const

  it.each(locales)('$lang : chaque descriptionKey résout un texte non vide, distinct du libellé', ({ file }) => {
    for (const choice of question.choices) {
      const path = choice.descriptionKey?.split('.') ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = path.reduce<any>((node, segment) => node?.[segment], file)
      expect(typeof text, `${choice.value} → ${choice.descriptionKey}`).toBe('string')
      expect((text as string)?.trim().length ?? 0, `${choice.value} → ${choice.descriptionKey}`).toBeGreaterThan(10)
      expect((text as string)?.trim(), `${choice.value} → ${choice.descriptionKey}`).not.toBe(choice.value)
    }
  })
})

/**
 * #4972.1 / #4972.2 — « je démarre » est une RÉPONSE explicite, jamais déduite de l'âge de la société.
 * La bande `'0'` (déjà dans le contrat) se lit « Je démarre — pas encore de portefeuille » : une réponse DÉCLARÉE,
 * distincte de l'absence de réponse (`null`), qui ne bloque donc pas « Continuer ».
 */
describe('role — portfolio_size : « je démarre » (#4972)', () => {
  const question = roleStep.questions.find(q => q.key === 'portfolio_size')
  if (!question || question.kind !== 'single') throw new Error('portfolio_size introuvable ou pas single')

  it('la bande « 0 » porte un libellé « je démarre » ; la valeur persistée reste « 0 » (aucune valeur neuve)', () => {
    const starting = question.choices.find(c => c.value === '0')
    expect(starting?.labelKey).toBe('questions.portfolioSizeStarting')
  })

  it('sait dire NON : aucune autre bande ne se lit « je démarre »', () => {
    const others = question.choices.filter(c => c.value !== '0')
    expect(others.length).toBeGreaterThan(0)
    expect(others.every(c => c.labelKey === undefined)).toBe(true)
  })

  it.each([
    { lang: 'fr', file: fr },
    { lang: 'en', file: en },
  ] as const)('$lang : le libellé existe et dit « démarre »/« starting »', ({ lang, file }) => {
    const text = (file as unknown as { questions: Record<string, string> }).questions.portfolioSizeStarting
    expect(text?.length).toBeGreaterThan(5)
    expect(text.toLowerCase()).toMatch(lang === 'fr' ? /démarre/ : /starting/)
  })
})
