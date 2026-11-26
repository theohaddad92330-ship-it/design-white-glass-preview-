import { beforeEach } from 'vitest'
import { clearAllDiscoverCaches } from './discover-cache'
import { dismissCandidate } from './discover-shortlist'
import { markLocalSearchesImported } from './discover-saved-searches'

beforeEach(() => localStorage.clear())

describe('clearAllDiscoverCaches', () => {
  it('drops every Discover key for every user', () => {
    dismissCandidate('user-1', '552100554')
    dismissCandidate('user-2', '111111111')
    // La MARQUE d'archivage des recherches importées vit sous le même préfixe :
    // la purge RGPD doit l'emporter comme le reste (#2151.3 à .13).
    markLocalSearchesImported('user-1', ['s_local_1'])

    clearAllDiscoverCaches()

    expect(localStorage.length).toBe(0)
  })

  it('leaves unrelated keys untouched — it purges Discover, not the whole app', () => {
    localStorage.setItem('bellum_lang', 'fr')
    dismissCandidate('user-1', '552100554')

    clearAllDiscoverCaches()

    expect(localStorage.getItem('bellum_lang')).toBe('fr')
  })

  it('is a safe no-op when there is nothing stored', () => {
    expect(() => clearAllDiscoverCaches()).not.toThrow()
  })
})
