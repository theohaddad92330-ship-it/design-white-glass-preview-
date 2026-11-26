import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverDegradedSource, DiscoverResponse } from '@/features/discover/lib/discover-types'

/* Lot 786 (#5203, recette FAIL) — « Anciens » retire TOUTES les cartes : l'écran le DIT (le filtre a tout retiré),
   il ne conclut pas « résultat non vérifiable » à cause d'une source tombée par ailleurs. */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: Record<string, unknown> & { children?: unknown }) => {
            const Component = prop as unknown as React.ElementType
            return <Component {...props}>{children as React.ReactNode}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

/** La réponse que l'écran recevra — réglée test par test. */
let response: DiscoverResponse | undefined
const refetch = vi.fn()

vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => ({ data: response, isFetching: false, isError: false, refetch }),
}))

// Importé APRÈS les mocks — l'écran doit voir le hook mocké.
const { Discover } = await import('./Discover')

function answer(candidates: DiscoverResponse['candidates'], degraded: DiscoverDegradedSource[]): DiscoverResponse {
  return { candidates, query: {}, degraded, coverage: null }
}

async function search() {
  renderWithRouter(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /pistes rapides/i }))
  fireEvent.click(await screen.findByRole('button', { name: /comptes qui recrutent/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Explorer' }))
}

beforeEach(() => {
  response = undefined
  refetch.mockClear()
})

describe('Découvrir — un filtre de besoins qui retire tout (#5203)', () => {
  it('dit que le filtre a tout retiré, même avec une source tombée', async () => {
    response = { ...answer([], [{ source: 'sirene', reason: 'request_rejected' }]), needsFilteredOut: 10 }
    await search()
    expect(await screen.findByText(/aucune carte ne porte de besoin/i)).toBeInTheDocument()
    expect(screen.queryByText(/résultat non vérifiable/i)).not.toBeInTheDocument()
  })

  it('lot 788 — le filtre de besoins ne montre JAMAIS le bandeau « recherche refusée » de la source', async () => {
    response = { ...answer([], [{ source: 'sirene', reason: 'request_rejected' }]), needsFilteredOut: 7 }
    await search()
    expect(await screen.findByText(/aucune carte ne porte de besoin/i)).toBeInTheDocument()
    expect(screen.queryByText(/refusée/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/registre public/i)).not.toBeInTheDocument()
  })

  it('sans filtre retiré, une panne et zéro carte reste « non vérifiable »', async () => {
    response = answer([], [{ source: 'sirene', reason: 'upstream_error' }])
    await search()
    expect(await screen.findByText(/résultat non vérifiable/i)).toBeInTheDocument()
  })
})
