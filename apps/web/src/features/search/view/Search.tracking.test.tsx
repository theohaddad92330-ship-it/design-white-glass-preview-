import { fireEvent, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #1688.2 / #1687.3 — LA RECHERCHE ÉMET.
 *
 * `/search` est le geste central du produit (« tape un nom d'entreprise ») :
 * ce fichier PROUVE que `trackSearchPerformed` porte le NOMBRE de suggestions
 * (jamais le nom tapé), et que l'échec d'une analyse (`SearchErrorCard`) émet
 * `trackErrorShown` avec un CODE fermé (jamais le message affiché).
 */

const h = vi.hoisted(() => ({
  suggestions: [] as Array<{ name: string; siren: string | null }>,
  suggestionsLoading: false,
  analysisStatus: 'idle' as 'idle' | 'error',
  analysisError: null as string | null,
}))

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: null, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: h.analysisStatus,
    phase: null,
    percent: null,
    accountId: null,
    error: h.analysisError,
    startAnalysis: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({
    suggestions: h.suggestions,
    loading: h.suggestionsLoading,
    search: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
  MIN_QUERY_LENGTH: 2,
}))

const trackSearchPerformed = vi.fn()
const trackErrorShown = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackSearchPerformed: (...args: unknown[]) => trackSearchPerformed(...args),
  trackErrorShown: (...args: unknown[]) => trackErrorShown(...args),
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
  h.suggestionsLoading = false
  h.analysisStatus = 'idle'
  h.analysisError = null
  trackSearchPerformed.mockClear()
  trackErrorShown.mockClear()
})

describe('#1688.2 — trackSearchPerformed sur /search', () => {
  it('émet {screen: "/search", resultCount} — jamais le nom tapé', async () => {
    h.suggestions = [
      { name: 'TF1', siren: '123456789' },
      { name: 'TF1 Publicité', siren: '987654321' },
    ]
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'TF1' } })

    await waitFor(() => expect(trackSearchPerformed).toHaveBeenCalledTimes(1))
    expect(trackSearchPerformed).toHaveBeenCalledWith('/search', 2)
    // Aucun argument ne porte le texte tapé.
    expect(trackSearchPerformed.mock.calls[0]).not.toContain('TF1')
  })

  it('#1688.2 — LA DEMANDE : une recherche à ZÉRO résultat émet quand même, avec resultCount=0', async () => {
    h.suggestions = []
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'ZzUnknownCo' } })

    await waitFor(() => expect(trackSearchPerformed).toHaveBeenCalledTimes(1))
    expect(trackSearchPerformed).toHaveBeenCalledWith('/search', 0)
  })

  it('une frappe trop courte (1 caractère) n’émet rien — ce n’est pas une recherche tentée', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'T' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })

  it('pendant le chargement (debounce/fetch en vol), n’émet rien encore', async () => {
    h.suggestionsLoading = true
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'TF1' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })
})

describe('#1687.3 — trackErrorShown sur l’état d’erreur d’écran de /search', () => {
  it('un statut "error" émet {screen: "/search", errorCode: "analysis_failed"} — jamais le message affiché', async () => {
    h.analysisStatus = 'error'
    h.analysisError = 'un message qui pourrait décrire une donnée de compte — ne doit jamais partir'
    renderWithRouter(<Search />)
    await waitFor(() => expect(trackErrorShown).toHaveBeenCalledTimes(1))
    expect(trackErrorShown).toHaveBeenCalledWith('/search', 'analysis_failed')
  })

  it('un statut "idle" n’émet rien', async () => {
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    expect(trackErrorShown).not.toHaveBeenCalled()
  })
})
