import { describe, expect, it } from 'vitest'
import { packVocabularyContext } from './usePackVocabulary'

describe('LUDB.3 — packVocabularyContext', () => {
  it('un pack non-IT bascule le vocabulaire', () => {
    expect(packVocabularyContext('industrial_engineering')).toBe('industrial')
  })
  it('SAIT DIRE NON : un espace IT ou au pack inconnu garde ses libellés', () => {
    expect(packVocabularyContext('esn_it')).toBeUndefined()
    expect(packVocabularyContext(null)).toBeUndefined()
    expect(packVocabularyContext(undefined)).toBeUndefined()
  })
})

// LUDB.3 — le libellé rendu suit le pack : pas de « profil ESN », de « surface
// informatique » ni de « data, cloud, SAP » dans un espace non-IT ; l'IT est inchangé.
import { i18n } from '@/i18n'

describe('LUDB.3 — libellés par pack (FR + EN)', () => {
  const key = 'card.scoreUnavailableHelp'
  it('FR : un espace industriel ne lit pas « profil ESN »', async () => {
    await i18n.changeLanguage('fr')
    expect(i18n.t(key, { ns: 'discover', context: 'industrial' })).not.toMatch(/ESN/)
    expect(i18n.t('card.scoreCriteria.it_surface', { ns: 'discover', context: 'industrial' })).toBe(
      'surface industrielle',
    )
    expect(i18n.t('rail.keywordsHint', { ns: 'discover', context: 'industrial' })).not.toMatch(/cloud|SAP/)
  })
  it('EN : idem', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t(key, { ns: 'discover', context: 'industrial' })).not.toMatch(/ESN/)
    expect(i18n.t('rail.keywordsPlaceholder', { ns: 'discover', context: 'industrial' })).not.toMatch(/cloud/)
    await i18n.changeLanguage('fr')
  })
  it('SAIT DIRE NON : sans contexte, l’espace IT garde ses libellés d’origine', async () => {
    await i18n.changeLanguage('fr')
    expect(i18n.t(key, { ns: 'discover' })).toMatch(/profil ESN/)
    expect(i18n.t('card.scoreCriteria.it_surface', { ns: 'discover' })).toBe('surface informatique')
  })
})
