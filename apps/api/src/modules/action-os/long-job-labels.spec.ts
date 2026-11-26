import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LONG_JOB_KEYS, LONG_JOB_SPECS } from './long-job-catalog'

/**
 * #1952.18 — UN TRAVAIL LONG PORTE UN NOM, PAS UNE CLÉ TECHNIQUE.
 *
 * L'Action Center nomme un run par `t('center.workflow.<definition_key>')` avec
 * un `defaultValue` égal à la clé. Un `t()` avec repli ne se plaint JAMAIS d'une
 * clé absente — c'est son travail — si bien qu'une analyse lancée depuis la
 * conversation s'affichait « card_account_analysis » à l'écran, dans les deux
 * langues, sans qu'aucun test ne tombe. Même défaut que les libellés de
 * déclencheur (#1498), un cran plus loin.
 *
 * ⚠️ Cette garde LIT les deux listes — le registre des travaux longs et les deux
 * catalogues d'i18n du web — au lieu de recopier la clé, qui la ferait se
 * comparer à elle-même le jour où un deuxième travail devient suivi.
 */
const CATALOGUES = ['fr', 'en'].map(lang => {
  const path = resolve(__dirname, '../../../../../apps/web/src/i18n/locales', lang, 'actions.json')
  return [lang, JSON.parse(readFileSync(path, 'utf8')) as { center?: { workflow?: Record<string, string> } }] as const
})

describe('le nom des travaux longs suivis, dans les deux langues', () => {
  it('lit un corpus réel — sept travaux au registre, deux catalogues remplis', () => {
    expect(LONG_JOB_KEYS.length).toBe(7)
    for (const [, catalogue] of CATALOGUES) {
      expect(Object.keys(catalogue.center?.workflow ?? {}).length).toBeGreaterThanOrEqual(5)
    }
  })

  it('chaque travail SUIVI a son nom sous sa clé persistée, en français et en anglais', () => {
    const missing: string[] = []
    for (const key of LONG_JOB_KEYS) {
      const definitionKey = LONG_JOB_SPECS[key].trackingDefinitionKey
      if (!definitionKey) continue
      for (const [lang, catalogue] of CATALOGUES) {
        const label = catalogue.center?.workflow?.[definitionKey]
        if (!label || label === definitionKey) missing.push(`${lang}:${definitionKey}`)
      }
    }
    // `missing` porte la langue et la clé : le message d'échec EST la liste.
    expect(missing).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas : un travail NON suivi n’a pas de clé, donc rien à nommer', () => {
    const untracked = LONG_JOB_KEYS.filter(key => LONG_JOB_SPECS[key].trackingDefinitionKey === null)
    expect(untracked.length).toBe(6)
    for (const [, catalogue] of CATALOGUES) {
      for (const key of untracked) {
        expect(catalogue.center?.workflow?.[key]).toBeUndefined()
      }
    }
  })
})
