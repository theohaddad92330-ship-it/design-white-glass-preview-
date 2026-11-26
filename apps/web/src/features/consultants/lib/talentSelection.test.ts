import { describe, expect, it } from 'vitest'
import { isAllSelected, isSomeSelected, toggleAllSelection, toggleOneSelection } from './talentSelection'

describe('isAllSelected', () => {
  it('est FAUX sur une liste chargée vide — rien à cocher n’est pas « tout coché »', () => {
    expect(isAllSelected([], new Set())).toBe(false)
  })

  it('est VRAI quand chaque ligne chargée est cochée', () => {
    expect(isAllSelected(['a', 'b'], new Set(['a', 'b']))).toBe(true)
  })

  it('est FAUX dès qu’une seule ligne chargée manque', () => {
    expect(isAllSelected(['a', 'b', 'c'], new Set(['a', 'b']))).toBe(false)
  })

  it('ignore un id coché qui ne fait plus partie de la page chargée', () => {
    // Une sélection posée à la page 1, puis un changement de filtre qui ne
    // retire pas encore l'id — `isAllSelected` ne compte QUE ce qui est
    // chargé, jamais un id fantôme.
    expect(isAllSelected(['a'], new Set(['a', 'z']))).toBe(true)
  })
})

describe('isSomeSelected', () => {
  it('est FAUX sur une liste vide', () => {
    expect(isSomeSelected([], new Set())).toBe(false)
  })

  it('est FAUX quand rien n’est coché', () => {
    expect(isSomeSelected(['a', 'b'], new Set())).toBe(false)
  })

  it('est VRAI quand certaines lignes sont cochées, pas toutes — l’état INDÉTERMINÉ', () => {
    expect(isSomeSelected(['a', 'b', 'c'], new Set(['a']))).toBe(true)
  })

  it('est FAUX quand TOUT est coché — jamais vrai en même temps que `isAllSelected`', () => {
    expect(isSomeSelected(['a', 'b'], new Set(['a', 'b']))).toBe(false)
  })
})

describe('toggleAllSelection', () => {
  it('coche toutes les lignes chargées', () => {
    expect(toggleAllSelection(['a', 'b', 'c'], true)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('décoche tout, quel que soit l’état précédent', () => {
    expect(toggleAllSelection(['a', 'b'], false)).toEqual(new Set())
  })
})

describe('toggleOneSelection', () => {
  it('ajoute UN id sans toucher au reste de la sélection', () => {
    const current = new Set(['a'])
    expect(toggleOneSelection(current, 'b', true)).toEqual(new Set(['a', 'b']))
    // L'entrée d'origine n'est jamais mutée — une nouvelle instance revient.
    expect(current).toEqual(new Set(['a']))
  })

  it('retire UN id sans toucher au reste de la sélection', () => {
    const current = new Set(['a', 'b', 'c'])
    expect(toggleOneSelection(current, 'b', false)).toEqual(new Set(['a', 'c']))
  })

  it('décocher un id absent ne fait rien de plus qu’une sélection inchangée', () => {
    const current = new Set(['a'])
    expect(toggleOneSelection(current, 'z', false)).toEqual(new Set(['a']))
  })
})
