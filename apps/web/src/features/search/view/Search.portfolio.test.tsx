import { fireEvent, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #2150.42 (épopée #2781) — « Ajouter au portefeuille » depuis un résultat de
 * recherche. La ligne et le seuillage du bouton sont couverts par
 * `SearchSuggestionItem.test.tsx` / `CompanySearchField.test.tsx` ; ce fichier
 * PROUVE le dernier maillon — `/search` rejoue bien `accountsApi.addToPortfolio`
 * (via `useAddAccountToPortfolio`) sur le clic, sans lancer d'analyse.
 */

const h = vi.hoisted(() => ({
  suggestions: [] as Array<{ name: string; siren: string | null }>,
  addToPortfolioMutate: vi.fn(),
}))

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: null, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: null,
    percent: null,
    accountId: null,
    error: null,
    startAnalysis: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({
    suggestions: h.suggestions,
    loading: false,
    search: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
  MIN_QUERY_LENGTH: 2,
}))
vi.mock('@/features/accounts/hooks/useAddAccountToPortfolio', () => ({
  useAddAccountToPortfolio: () => ({ mutate: h.addToPortfolioMutate, isPending: false, variables: undefined }),
}))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
            createElement(prop, props, children)
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => vi.fn(), useSearch: () => ({}) }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  h.suggestions = []
  h.addToPortfolioMutate.mockReset()
})

describe('#2150.42 — ajouter au portefeuille depuis /search', () => {
  it('rejoue accountsApi.addToPortfolio sur le clic, sans lancer d’analyse', async () => {
    h.suggestions = [{ name: 'TF1', siren: '326300159' }]
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'TF1' } })

    const button = await screen.findByRole('button', { name: /ajouter tf1 au portefeuille/i })
    fireEvent.click(button)

    expect(h.addToPortfolioMutate).toHaveBeenCalledTimes(1)
    expect(h.addToPortfolioMutate).toHaveBeenCalledWith({
      company_name: 'TF1',
      siren: '326300159',
      sector: undefined,
    })
    // Le champ garde sa saisie : contrairement à `onSelect`, ce geste ne
    // sélectionne pas la suggestion pour lancer une analyse.
    expect(input).toHaveValue('TF1')
  })
})
