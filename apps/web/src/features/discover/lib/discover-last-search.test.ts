import { beforeEach, describe, expect, it } from 'vitest'
import {
  LAST_SEARCH_TTL_MS,
  forgetLastSearch,
  isBareDiscoverUrl,
  readLastSearch,
  rememberLastSearch,
} from './discover-last-search'
import { DISCOVER_STORAGE_PREFIX } from './discover-storage'

// #4312 — « ma recherche elle est disparue, vu que ça m'a amené sur Laura » : revenir sur /discover
// (bouton de menu, lien nu) rouvre la dernière recherche, critères ET type de résultat, sans geste.
describe('#4312 — la dernière recherche de Découvrir survit à un aller-retour', () => {
  beforeEach(() => localStorage.clear())

  it('relit ce qui a été mémorisé, pour le même utilisateur', () => {
    rememberLastSearch('u1', { sectors: 'ecommerce', type: 'needs' }, 1_000)
    expect(readLastSearch('u1', 2_000)).toEqual({ sectors: 'ecommerce', type: 'needs' })
  })

  it('ne mélange jamais deux utilisateurs sur la même machine', () => {
    rememberLastSearch('u1', { sectors: 'ecommerce' }, 1_000)
    expect(readLastSearch('u2', 2_000)).toBeNull()
  })

  it('oublie les clés vides : une recherche sans critère n’est pas une recherche', () => {
    rememberLastSearch('u1', { sectors: undefined, laura: undefined }, 1_000)
    expect(readLastSearch('u1', 2_000)).toBeNull()
  })

  it('expire : une recherche d’hier n’est pas rouverte', () => {
    rememberLastSearch('u1', { sectors: 'ecommerce' }, 1_000)
    expect(readLastSearch('u1', 1_000 + LAST_SEARCH_TTL_MS + 1)).toBeNull()
  })

  it('forgetLastSearch l’efface', () => {
    rememberLastSearch('u1', { sectors: 'ecommerce' }, 1_000)
    forgetLastSearch('u1')
    expect(readLastSearch('u1', 2_000)).toBeNull()
  })

  it('sans utilisateur : rien n’est écrit ni lu', () => {
    rememberLastSearch(undefined, { sectors: 'ecommerce' }, 1_000)
    expect(readLastSearch(undefined, 2_000)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('vit sous le préfixe Découvrir — la purge RGPD le balaie', () => {
    rememberLastSearch('u1', { sectors: 'ecommerce' }, 1_000)
    // `length` / `key(i)`, jamais `Object.keys(localStorage)` : le stockage mémoire de `setup.ts` (polyfill) expose ses
    // MÉTHODES comme clés énumérables, et un worker où il a déjà été posé les rendait ici (rouge selon l'ordre des fichiers).
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    expect(keys.length).toBe(1)
    expect(keys[0]?.startsWith(DISCOVER_STORAGE_PREFIX)).toBe(true)
  })

  it('une valeur corrompue se lit comme « rien », jamais comme une erreur', () => {
    localStorage.setItem(`${DISCOVER_STORAGE_PREFIX}last-search:u1`, '{"at":"x"}')
    expect(readLastSearch('u1', 2_000)).toBeNull()
  })

  it('une URL nue est une URL sans aucun paramètre porteur de valeur', () => {
    expect(isBareDiscoverUrl({})).toBe(true)
    expect(isBareDiscoverUrl({ sectors: undefined, laura: '' })).toBe(true)
    expect(isBareDiscoverUrl({ sectors: 'ecommerce' })).toBe(false)
    expect(isBareDiscoverUrl({ type: 'needs' })).toBe(false)
  })
})
