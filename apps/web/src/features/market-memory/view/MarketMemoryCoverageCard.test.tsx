import type { MarketPortfolioRead } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1633.1 / #1635.2 — LE BLOC DE COUVERTURE DU PORTEFEUILLE.
 *
 * Ce que cette suite garde n'est pas une mise en page — jsdom n'en met aucune —
 * mais les QUATRE états et ce que chacun a le droit d'écrire. Le seul qui compte
 * vraiment est le troisième : une panne ne rend AUCUN compteur, parce que
 * « 0 couvert sur 0 » se lit « le marché ne connaît aucun de tes comptes », ce
 * qui est rassurant et faux.
 */

type QueryState = { data?: MarketPortfolioRead; isLoading: boolean; isError: boolean }

const state: { current: QueryState } = { current: { data: undefined, isLoading: true, isError: false } }

vi.mock('../api', () => ({ useMarketMemoryPortfolio: () => state.current }))

const { MarketMemoryCoverageCard } = await import('./MarketMemoryCoverageCard')

const OK: MarketPortfolioRead = {
  status: 'ok',
  coverage: { accounts: 62, covered: 38, insufficientObservations: 15, ambiguous: 6, unresolved: 3, homonyms: 4 },
  review: [],
  structuralFit: null,
  computedAt: '2026-09-08T10:00:00.000Z',
}

beforeEach(() => {
  state.current = { data: undefined, isLoading: true, isError: false }
})
afterEach(cleanup)

describe('le bloc de couverture', () => {
  it('écrit la phrase de #1635 : combien de comptes ont un contexte exploitable', () => {
    state.current = { data: OK, isLoading: false, isError: false }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/38 comptes sur 62/)).toBeTruthy()
  })

  it('détaille les restants dans les tuiles, et les quatre bouclent', () => {
    state.current = { data: OK, isLoading: false, isError: false }
    const { container } = render(<MarketMemoryCoverageCard />)

    // 38 + 15 + 6 + 3 = 62. Le lecteur doit pouvoir le vérifier de tête, et
    // chaque tuile porte la DÉFINITION de son seau — c'est ce qui distingue
    // « observations insuffisantes » (le corpus connaît l'entreprise) de
    // « non résolu » (il ne la connaît pas).
    for (const [label, valeur, definition] of [
      ['Comptes couverts', '38', /assez de parcours observés/],
      ['Observations insuffisantes', '15', /l'entreprise est dans le corpus/],
      ['Résolutions ambiguës', '6', /aucune ne tranche/],
      ['Comptes non résolus', '3', /ne connaît pas cette entreprise/],
    ] as const) {
      const tuile = screen.getByText(label).closest('div')
      expect(tuile?.textContent, label).toContain(valeur)
      expect(screen.getByText(definition)).toBeTruthy()
    }
    expect(container.textContent).not.toMatch(/restants/)
  })

  it("n'écrit JAMAIS « 1 non résolus » — une phrase à accords multiples n'est pas traduisible", () => {
    // Le défaut trouvé en recette le 08/09/2026 : i18next n'accorde que sur
    // `count`, donc trois nombres interpolés dans une même phrase ne peuvent
    // pas s'accorder chacun. La réponse n'est pas une meilleure traduction,
    // c'est de ne pas écrire la phrase.
    state.current = {
      data: {
        ...OK,
        coverage: { accounts: 6, covered: 4, insufficientObservations: 1, ambiguous: 0, unresolved: 1, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<MarketMemoryCoverageCard />)

    expect(container.textContent).not.toMatch(/1 non résolus/)
    expect(container.textContent).not.toMatch(/restants/)
  })

  it('dit sur quoi l’agrégat a été CALCULÉ — les six, pas les quatre couverts', () => {
    // `Completeness` répond à « sur combien d'éléments ce calcul porte », pas à
    // « combien en sont ressortis couverts ». « calculé sur 4 sur 6 — 67 % »
    // affirmerait qu'on n'a pas pu lire deux comptes. On les a tous lus.
    state.current = {
      data: {
        ...OK,
        coverage: { accounts: 6, covered: 4, insufficientObservations: 1, ambiguous: 0, unresolved: 1, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<MarketMemoryCoverageCard />)

    expect(container.textContent).not.toMatch(/67\s?%/)
    expect(container.textContent).not.toMatch(/4 comptes du portefeuille sur 6/)
  })

  it('DIT ce que le taux mesure — la demande explicite des deux issues', () => {
    state.current = { data: OK, isLoading: false, isError: false }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/mesure ce que NOUS savons/)).toBeTruthy()
  })

  it('n’affiche AUCUN compteur sur une panne — un zéro se lirait comme une mesure', () => {
    state.current = { data: { status: 'unavailable', reason: 'read_failed' }, isLoading: false, isError: false }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/n'ont pas pu être lues/)).toBeTruthy()
    expect(screen.queryByText(/comptes sur/)).toBeNull()
    // Le contrôle qui rend ce test utile : aucun « 0 » nulle part.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('n’affiche aucun compteur non plus quand la requête elle-même échoue', () => {
    state.current = { data: undefined, isLoading: false, isError: true }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/n'ont pas pu être lues/)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('sur un portefeuille VIDE, dit qu’il est vide — pas « 0 % de couverture »', () => {
    state.current = {
      data: {
        ...OK,
        coverage: { accounts: 0, covered: 0, insufficientObservations: 0, ambiguous: 0, unresolved: 0, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/aucun compte/)).toBeTruthy()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('accorde la phrase au singulier sur un seul compte couvert', () => {
    state.current = {
      data: {
        ...OK,
        coverage: { accounts: 2, covered: 1, insufficientObservations: 1, ambiguous: 0, unresolved: 0, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    render(<MarketMemoryCoverageCard />)

    expect(screen.getByText(/1 compte sur 2 dispose/)).toBeTruthy()
  })

  it('ne JETTE PAS sur une charge utile d’une autre forme — la fenêtre de déploiement', () => {
    // ⚠️ Le défaut RÉEL que ce test garde, trouvé le 08/09/2026 en faisant
    // tomber vingt tests de `DataQuality` et sept de `MarketWatch` : le repli
    // testait la panne NOMMÉE (`status === 'unavailable'`) et laissait passer
    // tout le reste, puis lisait `data.coverage.accounts` sur un objet qui n'a
    // pas de `coverage`. L'écran HÔTE tombait entier — pas seulement ce bloc.
    //
    // Ce n'est pas un cas de test : le web se déploie en une minute et l'API en
    // plusieurs. Pendant cette fenêtre, la route n'existe pas encore.
    state.current = {
      data: { hygiene: [], lines: [] } as unknown as MarketPortfolioRead,
      isLoading: false,
      isError: false,
    }

    expect(() => render(<MarketMemoryCoverageCard />)).not.toThrow()
    expect(screen.getByText(/n'ont pas pu être lues/)).toBeTruthy()
  })

  it('ne montre la ligne des homonymies que lorsqu’il y en a', () => {
    state.current = {
      data: {
        ...OK,
        coverage: { ...OK.coverage, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    render(<MarketMemoryCoverageCard />)

    expect(screen.queryByText(/Homonymies signalées/)).toBeNull()
  })
})
