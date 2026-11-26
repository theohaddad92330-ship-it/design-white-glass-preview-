import { describe, expect, it } from 'vitest'
import { DISCOVER_MAX_LIMIT } from '@bellum/contracts'
import { PROPOSED_ACCOUNT_VOLUME_BY_BAND } from './discover-capacity'
import {
  DISCOVER_LIST_STEP,
  canRequestMore,
  displayedCount,
  hasMoreToShow,
  listWindow,
  nextRequestLimit,
} from './discover-list-window'
import { DISCOVER_PAGE_SIZE } from './discover-query'
import type { DiscoverCandidate } from './discover-types'

// #3597.5 — « 10 comptes par défaut + Voir 10 de plus ».
describe('#3597.5 — la fenêtre de la liste /discover', () => {
  it('révèle douze comptes à la fois (une page Théo)', () => {
    expect(DISCOVER_LIST_STEP).toBe(12)
  })

  it('la recherche peut en rendre plus seulement quand elle a rempli sa page', () => {
    expect(canRequestMore(24, 24)).toBe(true)
    // Source épuisée : moins de lignes que demandé, rien à aller chercher.
    expect(canRequestMore(24, 17)).toBe(false)
  })

  it('ne demande jamais au-delà de la borne dure du contrat', () => {
    expect(canRequestMore(DISCOVER_MAX_LIMIT, DISCOVER_MAX_LIMIT)).toBe(false)
    expect(nextRequestLimit(DISCOVER_MAX_LIMIT - 1)).toBe(DISCOVER_MAX_LIMIT)
    expect(nextRequestLimit(DISCOVER_PAGE_SIZE)).toBe(DISCOVER_PAGE_SIZE + DISCOVER_PAGE_SIZE)
  })

  // #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER. Le volume de
  // la capacité commerciale n'est qu'un PREMIER LOT — même le plus haut (100 depuis #4673.2, Louis 31/10).
  it('le plus haut palier de capacité (100) n’est plus une fin : « Voir plus » continue', () => {
    expect(Math.max(...Object.values(PROPOSED_ACCOUNT_VOLUME_BY_BAND))).toBe(100)
    expect(canRequestMore(100, 100)).toBe(true)
    expect(nextRequestLimit(100)).toBe(100 + DISCOVER_PAGE_SIZE)
    expect(hasMoreToShow({ available: 100, shown: 100, requestedLimit: 100, loaded: 100 })).toBe(true)
  })

  it('le bouton existe tant qu’il reste des comptes chargés à révéler', () => {
    expect(hasMoreToShow({ available: 24, shown: 10, requestedLimit: 24, loaded: 24 })).toBe(true)
  })

  it('le bouton existe quand tout est visible mais que la recherche peut en rendre plus', () => {
    expect(hasMoreToShow({ available: 24, shown: 30, requestedLimit: 24, loaded: 24 })).toBe(true)
  })

  it('le bouton est ABSENT quand il n’y a plus rien', () => {
    expect(hasMoreToShow({ available: 8, shown: 10, requestedLimit: 24, loaded: 8 })).toBe(false)
    expect(
      hasMoreToShow({ available: 50, shown: 50, requestedLimit: DISCOVER_MAX_LIMIT, loaded: DISCOVER_MAX_LIMIT }),
    ).toBe(false)
  })
})

describe('displayedCount — #3901', () => {
  it('annonce 20 quand 24 sont chargés et 20 révélés', () => {
    expect(displayedCount(24, 20)).toBe(20)
  })
  it('ne dépasse pas ce qui est chargé', () => {
    expect(displayedCount(7, 10)).toBe(7)
  })
})

describe('#4419.8 — une réponse partielle n’est pas une source épuisée', () => {
  it('9 comptes sur 24 demandés, une source non aboutie : « Voir 10 de plus » reste', () => {
    expect(hasMoreToShow({ available: 9, shown: 10, requestedLimit: 24, loaded: 9, unfinished: true })).toBe(true)
  })

  it('sait dire NON : une recherche épuisée, ou la borne dure atteinte, n’ouvre aucun bouton vide', () => {
    expect(hasMoreToShow({ available: 9, shown: 10, requestedLimit: 24, loaded: 9, unfinished: false })).toBe(false)
    expect(hasMoreToShow({ available: 9, shown: 10, requestedLimit: 24, loaded: 9 })).toBe(false)
    expect(
      hasMoreToShow({ available: 9, shown: 10, requestedLimit: DISCOVER_MAX_LIMIT, loaded: 9, unfinished: true }),
    ).toBe(false)
  })
})

describe('#4419 — le nombre annoncé et la liste sortent du MÊME prédicat', () => {
  const rows = (names: string[]) => names.map((name, i) => ({ siren: String(i), name }) as DiscoverCandidate)
  const all = rows(Array.from({ length: 24 }, (_, i) => (i < 5 ? `Data ${i}` : `Autre ${i}`)))

  it('sans filtre : 24 annoncés = 24 listés (2 pages de 12), jamais 24 annoncés pour 12 lignes de plus que la liste', () => {
    const window = listWindow(all, '', 1)
    expect(window.announced).toBe(24)
    expect(window.listed).toHaveLength(window.announced)
    expect(window.pageRows).toHaveLength(12)
    expect(listWindow(all, '', 2).pageRows).toHaveLength(12)
  })

  it('avec un filtre d’écran : l’annonce suit la liste (5 et non 24)', () => {
    const window = listWindow(all, 'data', 1)
    expect(window.announced).toBe(5)
    expect(window.announced).toBe(window.listed.length)
  })

  it('sait dire NON : désolidariser l’annonce de la liste fait échouer le test', () => {
    const window = listWindow(all, 'data', 1)
    expect(window.announced).not.toBe(all.length)
  })
})
