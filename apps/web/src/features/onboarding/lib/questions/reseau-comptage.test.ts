import { VIVIER_COUNT_BAND_CHOICES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { reseauComptageStep } from './reseau-comptage'

/**
 * #2045.1/.2/.4/.6/.7 — le réseau personnel DÉCLARÉ pour quatre portes de
 * `canaux.ts` (« Anciens clients », « Anciens collègues », « Partenaires et
 * rang 2 », « Recommandation ») plus les relations chaudes transversales,
 * COMPTÉ en bandes, jamais un nombre exact.
 *
 * Les trois bords : elle sait dire OUI (les cinq questions existent, avec
 * le bon catalogue de bandes), elle sait dire NON (une bande manquante ou un
 * texte i18n vide ferait rougir), et elle n'attrape pas ce qu'elle ne vise
 * pas (le test ne prétend rien sur les six autres voies de #2045, hors
 * budget de ce lot).
 */
describe('réseau personnel — compté en bandes (#2045.1/.2/.4/.6/.7)', () => {
  const expectedKeys = [
    'former_clients_count_band',
    'former_colleagues_count_band',
    'partners_count_band',
    'referrers_count_band',
    'warm_relations_count_band',
  ] as const

  it('porte exactement les quatre questions attendues, dans cet ordre', () => {
    expect(reseauComptageStep.questions.map(q => q.key)).toEqual(expectedKeys)
  })

  it.each(reseauComptageStep.questions)('« $key » est un choix unique sur la bande de comptage du vivier', question => {
    expect(question.kind).toBe('single')
    if (question.kind !== 'single') return
    expect(question.choices.map(c => c.value)).toEqual([...VIVIER_COUNT_BAND_CHOICES])
  })

  const locales = [
    { lang: 'fr', file: fr },
    { lang: 'en', file: en },
  ] as const

  it.each(locales)('$lang : chaque question résout un label et un sous-titre non vides', ({ file }) => {
    for (const question of reseauComptageStep.questions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolve = (path?: string): any => path?.split('.').reduce<any>((node, seg) => node?.[seg], file)
      const label = resolve(question.label)
      const subtitle = resolve(question.subtitle)
      expect(typeof label, question.key).toBe('string')
      expect((label as string).trim().length, question.key).toBeGreaterThan(0)
      expect(typeof subtitle, question.key).toBe('string')
      expect((subtitle as string).trim().length, question.key).toBeGreaterThan(0)
    }
  })

  it('sait dire NON : une clé hors du corpus ne serait pas trouvée par ce test (témoin)', () => {
    expect(reseauComptageStep.questions.map(q => q.key)).not.toContain('geo_zones')
  })
})
