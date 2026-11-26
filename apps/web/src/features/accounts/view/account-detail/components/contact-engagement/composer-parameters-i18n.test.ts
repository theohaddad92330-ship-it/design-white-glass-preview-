import { OUTREACH_PERSONAS } from '@bellum/contracts'
import { MESSAGE_CTA_CODES, MESSAGE_OBJECTIVE_CODES } from './message-parameters'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/engagement.json'
import fr from '@/i18n/locales/fr/engagement.json'

// #3458 — la recette a vu `composer.parameters.personas.{gouvernance,direction,acheteur,expert}`
// manquantes : sept personas dans le contrat, trois libellés dans les locales.
describe('les options du composer ont un libellé FR et EN pour chaque code du contrat', () => {
  const groups = [
    ['personas', OUTREACH_PERSONAS],
    ['objectives', MESSAGE_OBJECTIVE_CODES],
    ['ctas', MESSAGE_CTA_CODES],
  ] as const
  for (const [group, codes] of groups) {
    for (const [lang, locale] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      it(`${group} (${lang})`, () => {
        const labels = (locale.composer.parameters as unknown as Record<string, Record<string, string>>)[group] ?? {}
        expect(codes.filter(code => !labels[code]?.trim())).toEqual([])
      })
    }
  }
})
