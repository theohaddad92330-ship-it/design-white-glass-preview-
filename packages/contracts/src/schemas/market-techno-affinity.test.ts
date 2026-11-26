import { describe, expect, it } from 'vitest'
import {
  MARKET_TECHNO_AFFINITY_MAX_SHOWN,
  MARKET_TECHNO_AFFINITY_MIN_COMMON,
  MARKET_TECHNO_UBIQUITY_MAX_SHARE,
  discriminantCommonTechnos,
} from './market-techno-affinity.js'

/** 100 entreprises couvertes : le plafond d'ubiquité vaut alors 25 entreprises. */
const CORPUS = 100
const freq = (entries: Record<string, number>) => new Map(Object.entries(entries))

describe('discriminantCommonTechnos', () => {
  it('rend les technologies communes rares, de la plus rare à la plus répandue', () => {
    const common = discriminantCommonTechnos(
      ['Java', 'C++', 'Python', 'sql'],
      ['python', 'java', 'c++', 'sql'],
      freq({ java: 20, 'c++': 4, python: 12, sql: 90 }),
      CORPUS,
    )
    // `sql` est sur 90 entreprises sur 100 : il ne distingue rien, il sort.
    expect(common).toEqual(['c++', 'python', 'java'])
  })

  it('ne dit RIEN sous trois technologies discriminantes communes', () => {
    expect(
      discriminantCommonTechnos(['java', 'c++'], ['java', 'c++', 'go'], freq({ java: 20, 'c++': 4, go: 3 }), CORPUS),
    ).toEqual([])
  })

  it('ne dit RIEN quand les communes ne sont QUE des technologies ubiquitaires', () => {
    // Trois technos communes, mais toutes au-dessus du plafond : le partage ne
    // rapproche personne — c'est très exactement ce que #1632 demande d'éviter.
    expect(
      discriminantCommonTechnos(
        ['java', 'sql', 'gestion de projet'],
        ['java', 'sql', 'gestion de projet'],
        freq({ java: 60, sql: 90, 'gestion de projet': 70 }),
        CORPUS,
      ),
    ).toEqual([])
  })

  it('borne la liste rendue à trois technologies', () => {
    const common = discriminantCommonTechnos(
      ['a', 'b', 'c', 'd', 'e'],
      ['a', 'b', 'c', 'd', 'e'],
      freq({ a: 1, b: 2, c: 3, d: 4, e: 5 }),
      CORPUS,
    )
    expect(common).toHaveLength(MARKET_TECHNO_AFFINITY_MAX_SHOWN)
    expect(common).toEqual(['a', 'b', 'c'])
  })

  it("ne compte PAS une techno dont la fréquence est inconnue — « inconnu » n'est pas « rare »", () => {
    // Quatre communes, mais `kotlin` n'est pas dans la table des fréquences :
    // elle ne compte pas, et il n'en reste que deux.
    expect(
      discriminantCommonTechnos(
        ['java', 'c++', 'kotlin', 'sql'],
        ['java', 'c++', 'kotlin', 'sql'],
        freq({ java: 20, 'c++': 4, sql: 90 }),
        CORPUS,
      ),
    ).toEqual([])
  })

  it("ne dit RIEN quand la fréquence n'a pas pu être mesurée (corpus à zéro)", () => {
    expect(discriminantCommonTechnos(['a', 'b', 'c'], ['a', 'b', 'c'], freq({ a: 1, b: 1, c: 1 }), 0)).toEqual([])
  })

  it("ne dit RIEN quand un des deux côtés n'a pas de pile observée", () => {
    const table = freq({ a: 1, b: 1, c: 1 })
    expect(discriminantCommonTechnos([], ['a', 'b', 'c'], table, CORPUS)).toEqual([])
    expect(discriminantCommonTechnos(['a', 'b', 'c'], [], table, CORPUS)).toEqual([])
  })

  it('normalise casse et espaces des DEUX côtés, et ne compte pas deux fois un doublon', () => {
    expect(
      discriminantCommonTechnos(
        ['  Java ', 'JAVA', 'C++', 'Python'],
        ['java', 'c++', 'python'],
        freq({ java: 2, 'c++': 3, python: 4 }),
        CORPUS,
      ),
    ).toEqual(['java', 'c++', 'python'])
  })

  it('la techno exactement AU plafond reste discriminante, celle au-dessus sort', () => {
    const ceiling = CORPUS * MARKET_TECHNO_UBIQUITY_MAX_SHARE
    const stack = ['pile', 'juste', 'au']
    expect(discriminantCommonTechnos(stack, stack, freq({ pile: ceiling, juste: 1, au: 1 }), CORPUS)).toHaveLength(
      MARKET_TECHNO_AFFINITY_MIN_COMMON,
    )
    expect(discriminantCommonTechnos(stack, stack, freq({ pile: ceiling + 1, juste: 1, au: 1 }), CORPUS)).toEqual([])
  })
})
