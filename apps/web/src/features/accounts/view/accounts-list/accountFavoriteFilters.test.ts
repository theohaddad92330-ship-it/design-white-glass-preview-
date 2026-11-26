import { describe, expect, it } from 'vitest'
import { favoriteFilterOf, mineFilterOf, ownerSearch, ownershipFilterOf } from './accountFavoriteFilters'

/**
 * #2150.14/.18/.15 — l'URL du portefeuille : lecture (un rechargement de page
 * ne fait rien d'autre que rappeler ces fonctions sur l'objet `search` frais)
 * et écriture (les deux bascules, et leur exclusion mutuelle).
 */
describe('favoriteFilterOf — lit `favorite` depuis l’URL', () => {
  it('active le filtre quand `favorite=mine`', () => {
    expect(favoriteFilterOf({ favorite: 'mine' })).toBe('mine')
  })

  it('reste inactif sans le paramètre — un rechargement sans favori ne l’invente pas', () => {
    expect(favoriteFilterOf({})).toBeUndefined()
  })

  it('reste inactif sur une valeur mal formée', () => {
    expect(favoriteFilterOf({ favorite: 'yes' })).toBeUndefined()
  })
})

describe('ownershipFilterOf — lit `ownership` depuis l’URL', () => {
  it('active le filtre quand `ownership=teammate`', () => {
    expect(ownershipFilterOf({ ownership: 'teammate' })).toBe('teammate')
  })

  it('reste inactif sans le paramètre', () => {
    expect(ownershipFilterOf({})).toBeUndefined()
  })
})

describe('#4158.25 — « Mes comptes » (ownership = mine)', () => {
  it('n’active le filtre que pour la valeur exacte `mine`', () => {
    expect(mineFilterOf({ ownership: 'mine' })).toBe('mine')
    expect(mineFilterOf({ ownership: 'teammate' })).toBeUndefined()
    expect(mineFilterOf({})).toBeUndefined()
  })

  it('refonte Théo — le sélecteur Responsable n’écrit que `ownership`, jamais `favorite` (l’onglet Favoris se combine)', () => {
    expect(ownerSearch('mine')).toEqual({ ownership: 'mine' })
    expect(ownerSearch('all')).toEqual({ ownership: undefined })
  })

  it('« portés par un collègue » ne confond pas `mine` avec `teammate`', () => {
    expect(ownershipFilterOf({ ownership: 'mine' })).toBeUndefined()
  })
})

describe('refonte Théo — ownerSearch, le sélecteur « Responsable »', () => {
  it('écrit `teammate`, `mine`, ou retire l’axe pour « Toute l’équipe »', () => {
    expect(ownerSearch('teammate')).toEqual({ ownership: 'teammate' })
    expect(ownerSearch('mine')).toEqual({ ownership: 'mine' })
    expect(ownerSearch('all')).toEqual({ ownership: undefined })
    expect('favorite' in ownerSearch('mine')).toBe(false)
  })
})
