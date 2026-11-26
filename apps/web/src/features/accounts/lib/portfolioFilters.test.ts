import { describe, expect, it } from 'vitest'
import {
  EMPTY_PORTFOLIO_FILTERS,
  accountInZone,
  accountTypeOf,
  countPortfolioFilters,
  portfolioFiltersFromSearch,
  portfolioZoneOptions,
  searchForPortfolioFilters,
} from './portfolioFilters'

describe('#4498 — les critères de « Filtrer mon portefeuille » (multi-sélection)', () => {
  it('lit l’URL : `lifecycle` se range sous la relation ET l’état secondaire, une liste par critère', () => {
    expect(portfolioFiltersFromSearch({ lifecycle: 'customer' })).toMatchObject({
      relation: ['customer'],
      secondary: [],
    })
    expect(portfolioFiltersFromSearch({ lifecycle: ['customer', 'dormant', 'archived'] })).toMatchObject({
      relation: ['customer'],
      secondary: ['dormant', 'archived'],
    })
    expect(portfolioFiltersFromSearch({ lifecycle: 'opportunity' })).toMatchObject({ relation: [], secondary: [] })
    expect(portfolioFiltersFromSearch({})).toEqual({
      sector: [],
      relation: [],
      secondary: [],
      tag: [],
      gate: [],
      entityKind: [],
      freshness: [],
      score: [],
      status: [],
      documentedHistory: [],
      authorizedReferences: [],
    })
  })

  it('lit les listes de l’URL : scalaire = une case, liste = plusieurs, « all » ignoré', () => {
    expect(portfolioFiltersFromSearch({ sector: 'Banque', score: ['high', 'low'], status: 'all' })).toMatchObject({
      sector: ['Banque'],
      score: ['high', 'low'],
      status: [],
    })
  })

  it('« À ouvrir » se lit sur `headline=withoutNextAction`, les autres headline ne sont pas la relation', () => {
    expect(portfolioFiltersFromSearch({ headline: 'withoutNextAction' }).relation).toEqual(['to_open'])
    expect(portfolioFiltersFromSearch({ headline: 'toResume' }).relation).toEqual([])
  })

  it('écrit chaque axe : rien (vide), un scalaire (une case), une liste (plusieurs)', () => {
    const next = searchForPortfolioFilters(
      { q: 'banque', sector: 'Transport', page: '2' },
      {
        ...EMPTY_PORTFOLIO_FILTERS,
        sector: ['Banque', 'Assurance'],
        relation: ['customer', 'opening'],
        gate: ['prioritised'],
        score: ['high'],
        freshness: ['stale'],
        documentedHistory: ['with'],
        authorizedReferences: ['only'],
      },
    )
    expect(next).toMatchObject({
      q: 'banque',
      sector: ['Banque', 'Assurance'],
      lifecycle: ['customer', 'opening'],
      gate: 'prioritised',
      score: 'high',
      freshness: 'stale',
      documentedHistory: 'with',
      authorizedReferences: 'only',
      page: undefined,
    })
    const cleared = searchForPortfolioFilters(next, EMPTY_PORTFOLIO_FILTERS)
    for (const key of [
      'sector',
      'lifecycle',
      'gate',
      'score',
      'freshness',
      'tag',
      'entityKind',
      'status',
      'documentedHistory',
      'authorizedReferences',
    ])
      expect(cleared[key]).toBeUndefined()
    // La recherche texte n'appartient pas à la modale.
    expect(cleared.q).toBe('banque')
  })

  it('la relation et l’état secondaire écrivent le même axe `lifecycle`, en liste', () => {
    expect(searchForPortfolioFilters({}, { ...EMPTY_PORTFOLIO_FILTERS, secondary: ['archived'] }).lifecycle).toBe(
      'archived',
    )
    expect(
      searchForPortfolioFilters({}, { ...EMPTY_PORTFOLIO_FILTERS, relation: ['customer'], secondary: ['dormant'] })
        .lifecycle,
    ).toEqual(['customer', 'dormant'])
  })

  it('« À ouvrir » pose `headline`, le décocher le retire, un autre `headline` n’est jamais touché', () => {
    const open = searchForPortfolioFilters({}, { ...EMPTY_PORTFOLIO_FILTERS, relation: ['to_open'] })
    expect(open.headline).toBe('withoutNextAction')
    expect(open.lifecycle).toBeUndefined()
    expect(searchForPortfolioFilters(open, EMPTY_PORTFOLIO_FILTERS).headline).toBeUndefined()
    expect(searchForPortfolioFilters({ headline: 'toResume' }, EMPTY_PORTFOLIO_FILTERS).headline).toBe('toResume')
  })

  it('un rangement hérité survit à « Appliquer », pas à « Réinitialiser »', () => {
    const prev = { lifecycle: 'opportunity' }
    const values = { ...EMPTY_PORTFOLIO_FILTERS, sector: ['Banque'] }
    expect(searchForPortfolioFilters(prev, values).lifecycle).toBe('opportunity')
    expect(searchForPortfolioFilters(prev, EMPTY_PORTFOLIO_FILTERS, { reset: true }).lifecycle).toBeUndefined()
  })

  // #4941.2 — le nombre du bouton « Filtres » = les puces : UNE par valeur cochée (revient sur #4498 : « un critère compte une fois »).
  it('compte les valeurs cochées (le nombre du bouton « Filtres ») : une puce, un compte', () => {
    expect(countPortfolioFilters(EMPTY_PORTFOLIO_FILTERS)).toBe(0)
    expect(
      countPortfolioFilters({
        ...EMPTY_PORTFOLIO_FILTERS,
        sector: ['Banque', 'Assurance', 'Transport'],
        accessClass: ['B'],
      }),
    ).toBe(4)
    expect(countPortfolioFilters({ ...EMPTY_PORTFOLIO_FILTERS, status: ['error', 'canceled'] })).toBe(2)
  })

  it('type de compte : le jugement du badge de ligne, « Client final » sinon', () => {
    expect(accountTypeOf({ company_name: 'Société Générale', naf_code: '64.19Z' })).toBe('final')
    expect(accountTypeOf({ company_name: 'Hays', is_intermediary: true })).toBe('intermediary')
    expect(accountTypeOf({ company_name: 'Michael Page', naf_code: '78.10Z' })).toBe('intermediary')
  })
})

describe('#4989 — le critère « zone » du portefeuille (siège, jugé sur les lignes chargées)', () => {
  const lille = { headquarters: '12 rue Nationale, 59000 Lille, France' }
  const lyon = { headquarters: '5 place Bellecour, 69002 Lyon' }
  const sansSiege = { headquarters: null }

  it('liste les villes ET les départements des sièges connus, sans doublon, jamais un compte sans siège', () => {
    expect(portfolioZoneOptions([lille, lyon, { headquarters: '3 rue X, 59800 Lille' }, sansSiege])).toEqual([
      { value: '59', kind: 'department' },
      { value: '69', kind: 'department' },
      { value: 'Lille', kind: 'city' },
      { value: 'Lyon', kind: 'city' },
    ])
  })

  it('une zone vide ne filtre rien ; une ville ou un département retient le siège correspondant', () => {
    expect(accountInZone(lille, [])).toBe(true)
    expect(accountInZone(sansSiege, [])).toBe(true)
    expect(accountInZone(lille, ['Lille'])).toBe(true)
    expect(accountInZone(lille, ['lille'])).toBe(true)
    expect(accountInZone(lille, ['59'])).toBe(true)
    expect(accountInZone(lyon, ['Lille'])).toBe(false)
    expect(accountInZone(lyon, ['59'])).toBe(false)
  })

  it('un siège inconnu ne prouve rien : il sort dès qu’une zone est choisie (jamais rangé « en zone »)', () => {
    expect(accountInZone(sansSiege, ['Lille'])).toBe(false)
  })

  it('une implantation connue compte comme le siège (#4989.2)', () => {
    expect(accountInZone({ headquarters: '1 rue A, 75001 Paris', sites: ['Lille', '59000 Lille'] }, ['Lille'])).toBe(
      true,
    )
    expect(accountInZone({ headquarters: '1 rue A, 75001 Paris', sites: ['Lille'] }, ['59'])).toBe(false)
  })
})
