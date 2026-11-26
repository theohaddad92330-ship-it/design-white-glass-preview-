import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ONBOARDING_RESULT_STEPS } from '@/features/onboarding/lib/onboarding-progress'

/**
 * #2023.3 — « chaque étape ouvre par "Cette partie permet à … de…" ».
 *
 * CE QUI A ÉTÉ MESURÉ, ET CE QUI MANQUAIT. Relevé en production le 15/09 sur
 * l'étape « Ton organisation » : la phrase est bien là. Les SIX AUTRES n'ont
 * jamais été relevées une par une — et c'est exactement le genre de trou qu'un
 * écran comble tout seul pendant trois semaines, puis plus. Ce test lit les
 * deux fichiers de traduction et exige la phrase pour les SEPT.
 *
 * ⚠️ LE NOM DE LA MARQUE. Le point d'origine demandait « BellumAI ». La
 * décision de Louis du 15/09/2026 dit l'inverse et elle est plus récente : la
 * marque s'écrit « Bellum », elle vit à UN seul endroit (`DEFAULT_BRAND_NAME`,
 * `packages/contracts/src/schemas/brand.ts`, GA-26) et elle sert AUSSI la
 * marque blanche. Écrire le nom en clair dans une traduction est donc doublement
 * refusé — par GA-252, et par le fait qu'un espace en marque blanche lirait le
 * nôtre. Ce test garde la MÉCANIQUE (`{{brand}}` interpolé), qui est ce que la
 * demande voulait vraiment : que l'étape dise à qui elle sert.
 *
 * Les trois preuves qu'une garde doit faire :
 *  - elle LIT un corpus non vide (sept étapes, deux langues, assertions sur le
 *    compte lui-même) ;
 *  - elle sait dire NON (un intro vide, absent ou sans `{{brand}}` la fait
 *    échouer — c'est l'objet même des trois assertions par clé) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (le TÉMOIN : les titres
 *    d'étape, voisins immédiats, n'ont aucune raison de porter `{{brand}}` et
 *    le test le vérifie plutôt que d'interdire le mot partout).
 */

const LOCALES = ['fr', 'en'] as const

function onboardingLocale(lang: string): Record<string, unknown> {
  const path = resolve(__dirname, `../../../i18n/locales/${lang}/onboarding.json`)
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

function stringAt(bundle: Record<string, unknown>, dottedKey: string): string | undefined {
  const value = dottedKey.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, bundle)
  return typeof value === 'string' ? value : undefined
}

describe('#2023.3 — chaque étape du questionnaire s’ouvre en disant à quoi elle sert', () => {
  it('LIT un corpus non vide : sept étapes, chacune avec sa clé d’ouverture', () => {
    expect(ONBOARDING_RESULT_STEPS).toHaveLength(7)
    expect(ONBOARDING_RESULT_STEPS.every(step => step.introKey.startsWith('stepper.intros.'))).toBe(true)
    expect(new Set(ONBOARDING_RESULT_STEPS.map(s => s.introKey)).size).toBe(7)
  })

  for (const lang of LOCALES) {
    it(`les sept ouvertures existent, sont non vides et interpolent la marque (${lang})`, () => {
      const bundle = onboardingLocale(lang)
      for (const step of ONBOARDING_RESULT_STEPS) {
        const intro = stringAt(bundle, step.introKey)
        expect(intro, `${lang} · ${step.introKey} manquante`).toBeTypeOf('string')
        expect(intro!.trim().length, `${lang} · ${step.introKey} vide`).toBeGreaterThan(0)
        // GA-252 — la marque passe par la variable, jamais par le mot : un
        // espace en marque blanche lirait sinon le nôtre sur sept écrans.
        expect(intro, `${lang} · ${step.introKey} n'interpole pas la marque`).toContain('{{brand}}')
        expect(intro).not.toMatch(/BellumAI|\bBellum\b/)
      }
    })
  }

  it('LE TÉMOIN — les TITRES d’étape, voisins immédiats, ne portent pas la marque', () => {
    for (const lang of LOCALES) {
      const bundle = onboardingLocale(lang)
      for (const step of ONBOARDING_RESULT_STEPS) {
        const title = stringAt(bundle, step.titleKey)
        expect(title, `${lang} · ${step.titleKey} manquant`).toBeTypeOf('string')
        expect(title).not.toContain('{{brand}}')
      }
    }
  })
})
