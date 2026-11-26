import { describe, expect, it } from 'vitest'
import { listNarrowing } from './listNarrowing'

/**
 * CE QUE CE TEST TIENT
 *
 * Recette live du 30/08/2026 sur la production, `/accounts?lifecycle=opportunity` :
 * 24 comptes au portefeuille, l'écran répond « Aucun compte analysé pour
 * l'instant » et propose d'en lancer une première — 8 crédits pour un problème
 * qui n'existe pas.
 *
 * La cause n'est pas dans l'état vide : elle est ici. La restriction se lisait
 * « un filtre est-il posé dans la BARRE DE FILTRES ? », et `lifecycle` n'y est
 * pas — c'est le seul axe qui n'a ni pastille ni onglet. Une restriction
 * INVISIBLE reste une restriction.
 */
describe('listNarrowing — ce qui compte comme « la liste est restreinte »', () => {
  it('un portefeuille sans rien de posé n’est pas restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined })).toEqual({
      active: false,
      lifecycle: null,
    })
  })

  it('`lifecycle=opportunity` RESTREINT la liste, même sans pastille de filtre', () => {
    // Le défaut exact : `activeFilters` est vide (le cycle commercial n'est pas
    // un filtre de la barre), et l'écran en concluait « tout le portefeuille ».
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: 'opportunity' })).toEqual({
      active: true,
      lifecycle: 'opportunity',
    })
  })

  it('`lifecycle=all` ne restreint rien — c’est l’absence de rangement', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: 'all' })).toEqual({
      active: false,
      lifecycle: null,
    })
  })

  it('une recherche restreint, sans être un rangement à relâcher', () => {
    expect(listNarrowing({ query: 'Doctolib', filterCount: 0, lifecycle: undefined })).toEqual({
      active: true,
      lifecycle: null,
    })
  })

  it('une recherche faite d’espaces ne restreint rien', () => {
    expect(listNarrowing({ query: '   ', filterCount: 0, lifecycle: undefined }).active).toBe(false)
  })

  it('une pastille de la barre de filtres restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 1, lifecycle: undefined })).toEqual({
      active: true,
      lifecycle: null,
    })
  })

  it('les deux axes se cumulent — le rangement reste NOMMÉ pour être dit à l’écran', () => {
    expect(listNarrowing({ query: 'Doctolib', filterCount: 2, lifecycle: 'watching' })).toEqual({
      active: true,
      lifecycle: 'watching',
    })
  })

  /**
   * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE.
   *
   * `headline` (le clic sur une métrique décisionnelle du bandeau) est le
   * MÊME genre de restriction que `lifecycle` : posé par un lien plutôt que
   * par la barre de filtres, donc invisible à `filterCount` si on ne
   * l'ajoutait pas ici. L'oublier reproduirait exactement le défaut du
   * 30/08 sur `lifecycle`.
   */
  it('`headline` posé RESTREINT la liste, même sans pastille de filtre', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, headline: 'withoutNextAction' })).toEqual({
      active: true,
      lifecycle: null,
    })
  })

  it('`headline` absent ne restreint rien, à lui seul', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, headline: undefined })).toEqual({
      active: false,
      lifecycle: null,
    })
  })

  it('un appelant qui ne connaît pas encore `headline` continue de fonctionner — le paramètre est optionnel', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined })).toEqual({
      active: false,
      lifecycle: null,
    })
  })
})

/**
 * #1575.1 — l'axe « avec des parcours observés » est une RESTRICTION, comme
 * `headline` : posé par un clic sur le bandeau, sans pastille dans la barre de
 * filtres ni onglet. Sans lui ici, l'écran annoncerait « Tout le portefeuille »
 * au-dessus d'une liste restreinte, et n'offrirait aucun chemin de retour.
 */
describe('#1575.1 — le cinquième compteur restreint la liste', () => {
  it('« covered » restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, marketCovered: 'covered' }).active).toBe(
      true,
    )
  })

  it('« all » ne restreint pas — ce n’est pas un rangement, c’est son absence', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, marketCovered: 'all' }).active).toBe(false)
  })

  it('absent ≡ le comportement d’avant ce chantier', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined }).active).toBe(false)
  })
})

/**
 * #2150.14/.18 / #2150.15 — les deux bascules du portefeuille restreignent,
 * comme `headline` et `marketCovered` : posées par un clic dédié, sans
 * pastille dans la barre de filtres ni onglet.
 */
describe('#2150.14/.18/.15 — favoris et « portés par un collègue » restreignent la liste', () => {
  it('« favorite=mine » restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, favorite: 'mine' }).active).toBe(true)
  })

  it('« favorite=all » ne restreint pas — c’est son absence', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, favorite: 'all' }).active).toBe(false)
  })

  it('« ownership=teammate » restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, ownership: 'teammate' }).active).toBe(true)
  })

  it('« ownership=all » ne restreint pas — c’est son absence', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, ownership: 'all' }).active).toBe(false)
  })

  // #4597 — la puce « Importés » et le lien « voir les N comptes » restreignent : une restriction invisible reste une restriction.
  it('« imported=only » restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, imported: 'only' }).active).toBe(true)
  })

  it('un import précis (`importJob`) restreint', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, importJob: 'job-1' }).active).toBe(true)
  })

  it('sans eux, rien ne restreint (un filtre AJOUTE une vue, il ne retire rien)', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined, imported: undefined }).active).toBe(false)
  })

  it('les deux absents ≡ le comportement d’avant ce chantier', () => {
    expect(listNarrowing({ query: '', filterCount: 0, lifecycle: undefined }).active).toBe(false)
  })
})
