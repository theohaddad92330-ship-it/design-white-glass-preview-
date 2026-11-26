import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4191 (recette 3, F3) — le panneau d'une affaire écrivait « besoin » en minuscule à côté de « Qualifié » :
 * les affaires portent `kind = 'besoin'` (valeur héritée, hors `PROJECT_KINDS`), que le catalogue `kinds.*`
 * ne nommait pas — le repli `defaultValue` rendait la valeur de base, brute. Elle se lit « Besoin ».
 */
describe('F3 — la nature d’une affaire se lit capitalisée', () => {
  it('fr : « Besoin », pas « besoin »', async () => {
    await i18n.loadNamespaces('projects')
    expect(i18n.getFixedT('fr', 'projects')('kinds.besoin', { defaultValue: 'besoin' })).toBe('Besoin')
  })

  it('en : « Need »', async () => {
    await i18n.loadNamespaces('projects')
    expect(i18n.getFixedT('en', 'projects')('kinds.besoin', { defaultValue: 'besoin' })).toBe('Need')
  })
})
