import { fireEvent, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #4598 (renverse #4542) — pendant une analyse, la rangée « Ce que tu analyses » n'est PAS dans le DOM :
 * la carte de progression prend la hauteur. Analyse finie, échouée ou abandonnée : elle revient sur le même onglet.
 */
const h = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    status: 'idle' as 'idle' | 'analyzing' | 'error',
    listeners,
    set(next: 'idle' | 'analyzing' | 'error') {
      this.status = next
      listeners.forEach(l => l())
    },
  }
})

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: null, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => {
    const status = useSyncExternalStore(
      cb => {
        h.listeners.add(cb)
        return () => h.listeners.delete(cb)
      },
      () => h.status,
    )
    return {
      status,
      phase: null,
      percent: null,
      accountId: null,
      error: status === 'error' ? 'boom' : null,
      startAnalysis: vi.fn(),
      retry: vi.fn(),
      reset: vi.fn(),
    }
  },
}))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({ suggestions: [], loading: false, search: vi.fn(), clearSuggestions: vi.fn() }),
  MIN_QUERY_LENGTH: 2,
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
  h.set('idle')
})

describe('#4598 — la rangée des modes pendant une analyse', () => {
  it('hors analyse, la rangée est là', async () => {
    renderWithRouter(<Search />)
    expect(await screen.findByRole('tablist', { name: 'Ce que tu analyses' })).toBeInTheDocument()
  })

  it("pendant l'analyse, la rangée est absente du DOM ; elle revient sur le même onglet ensuite", async () => {
    renderWithRouter(<Search />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Un besoin' }))

    act(() => h.set('analyzing'))
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Un besoin' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-analyze-section="modes"]')).toBeNull()

    act(() => h.set('error'))
    expect(screen.getByRole('tab', { name: 'Un besoin' })).toHaveAttribute('aria-selected', 'true')
  })
  // #4598.3 — « rien d'AUTRE ne disparaît » : seule la rangée des modes part, les deux gestes de l'en-tête restent.
  it("pendant l'analyse, « Chercher des comptes » et « Mes analyses » restent accessibles", async () => {
    renderWithRouter(<Search />)
    await screen.findByRole('tablist', { name: 'Ce que tu analyses' })
    act(() => h.set('analyzing'))
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chercher des comptes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mes analyses' })).toBeInTheDocument()
  })
})

/**
 * #4662 — l'attente d'une analyse est un ÉCRAN : elle porte SON titre. Le `<h1>` ne reste pas celui de `/search`
 * (« Quel compte veux-tu comprendre ? »), question qui n'a plus de sens devant trois à six minutes d'attente.
 */
describe("#4662 — le titre de l'attente d'une analyse", () => {
  it("hors analyse, le h1 est la question de /search ; pendant l'analyse, il nomme ce qui se passe", async () => {
    renderWithRouter(<Search />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quel compte veux-tu comprendre ?' }),
    ).toBeInTheDocument()

    act(() => h.set('analyzing'))
    const titles = screen.getAllByRole('heading', { level: 1 })
    expect(titles).toHaveLength(1)
    expect(titles[0]).toHaveTextContent(/Analyse .*en cours/)
    expect(titles[0]).not.toHaveTextContent('Quel compte veux-tu comprendre ?')

    act(() => h.set('error'))
    expect(screen.getByRole('heading', { level: 1, name: 'Quel compte veux-tu comprendre ?' })).toBeInTheDocument()
  })
})
