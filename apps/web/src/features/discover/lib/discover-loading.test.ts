import { describe, expect, it } from 'vitest'
import { showsSearchLoading } from './discover-loading'

// #4517 (Louis 24/10, recette prod 27/10) — « un load long et quand c'est fini on a vraiment tous les résultats » :
// la relecture d'arrière-plan des offres (#4045, jusqu'à 6 passages) remettait l'écran de chargement à la place de la
// liste déjà affichée — le second chargement que Louis voyait.
describe('showsSearchLoading — un seul chargement par recherche', () => {
  it('la première attente montre le chargement', () => {
    expect(showsSearchLoading({ isFetching: true, hasData: false, keepsList: false, backgroundRelecture: false })).toBe(
      true,
    )
  })

  it('⚠️ SAIT DIRE NON — une relecture d’arrière-plan ne remplace jamais la liste affichée', () => {
    expect(showsSearchLoading({ isFetching: true, hasData: true, keepsList: false, backgroundRelecture: true })).toBe(
      false,
    )
  })

  it('« Voir 10 de plus » garde la liste (#3597.5) ; une recherche relancée sans liste attend', () => {
    expect(showsSearchLoading({ isFetching: true, hasData: true, keepsList: true, backgroundRelecture: false })).toBe(
      false,
    )
    expect(showsSearchLoading({ isFetching: true, hasData: true, keepsList: false, backgroundRelecture: false })).toBe(
      true,
    )
    expect(
      showsSearchLoading({ isFetching: false, hasData: false, keepsList: false, backgroundRelecture: false }),
    ).toBe(false)
  })
})
