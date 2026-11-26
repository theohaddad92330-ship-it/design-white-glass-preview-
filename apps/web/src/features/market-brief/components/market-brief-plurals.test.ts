import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import frMarketBrief from '@/i18n/locales/fr/marketBrief.json'
import enMarketBrief from '@/i18n/locales/en/marketBrief.json'

/**
 * Recette 06/10/2026 — « Leroy Merlin 1 besoins », « 70 profils · 1 besoins » : les décomptes de la fiche zone
 * s'accordent. Vrai i18next (pas le mock des autres tests) : c'est lui qui choisit `_one` ou `_other`.
 */
const make = async (lng: 'fr' | 'en') => {
  const instance = i18next.createInstance()
  await instance.init({
    lng,
    resources: { fr: { marketBrief: frMarketBrief }, en: { marketBrief: enMarketBrief } },
    ns: ['marketBrief'],
    defaultNS: 'marketBrief',
    interpolation: { escapeValue: false },
  })
  return instance.getFixedT(lng, 'marketBrief')
}

describe('fiche zone — accord singulier / pluriel', () => {
  it('FR : 1 besoin / 1 profil / 1 externe, mais 70 profils et 2 besoins', async () => {
    const t = await make('fr')
    expect(t('groups.needs', { count: 1 })).toBe('1 besoin')
    expect(t('groups.needs', { count: 2 })).toBe('2 besoins')
    expect(t('groups.profiles', { count: 1 })).toBe('1 profil')
    expect(t('groups.profiles', { count: 70 })).toBe('70 profils')
    expect(t('groups.externals', { count: 1 })).toBe('1 externe')
    expect(t('clients.profiles', { count: 1, formatted: '1' })).toBe('1 profil')
    expect(t('clients.externals', { count: 453, formatted: '453' })).toBe('453 externes')
    expect(t('priceGrid.needsCount', { count: 1 })).toBe('1 besoin')
    expect(t('priceGrid.sample', { count: 1 })).toBe('1 besoin au total')
    expect(t('priceTrend.perYear', { count: 1, formatted: '1' })).toBe('1 besoin')
    expect(
      t('priceGrid.concentration', { client: 'Leroy Merlin', count: 1, formatted: '1', total: '231', percent: 0 }),
    ).toContain('pèse 1 besoin sur')
  })

  it('EN : 1 need / 1 profile / 1 contractor, mais 2 needs', async () => {
    const t = await make('en')
    expect(t('groups.needs', { count: 1 })).toBe('1 need')
    expect(t('groups.needs', { count: 2 })).toBe('2 needs')
    expect(t('groups.profiles', { count: 1 })).toBe('1 profile')
    expect(t('groups.externals', { count: 1 })).toBe('1 contractor')
    expect(t('priceTrend.perYear', { count: 1, formatted: '1' })).toBe('1 need')
  })
})
