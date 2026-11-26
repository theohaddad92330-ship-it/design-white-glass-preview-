import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContent } from '@/routes/__root'
import { SessionContext } from '@/features/auth/session-context'
import { deferralForTests } from '@/lib/hooks/use-deferred-enabled'
import { apiFetch } from '@/lib/api'

// Le double global de `@/lib/socket` (test/setup.ts) n'expose que `connectToJob` ;
// le gabarit racine s'abonne aussi au profileur.
vi.mock('@/lib/socket', () => ({
  connectToJob: vi.fn(),
  disconnectSocket: vi.fn(),
  subscribeToProfiler: vi.fn(() => () => {}),
  subscribeToAccount: vi.fn(() => () => {}),
  subscribeToImportJob: vi.fn(() => () => {}),
  // #3666 — `useAnalysisStatusSync` relit l'état réel à chaque reconnexion du socket.
  onSocketConnect: vi.fn(() => () => {}),
}))

/**
 * perf P3 (29/09/2026) — CE QUE TOUTES LES PAGES PAIENT AVANT LEUR CONTENU.
 *
 * Le gabarit racine (`SessionContent`) monte Laura, le bandeau de refonte, le
 * guide, la synchro des analyses… Chacun lançait sa requête dès le premier
 * rendu, en concurrence avec celles de la PAGE. Mesuré : `/laura/plan` 0,8-2,5 s
 * sur 100 % des pages, `/onboarding/state` sur ~15 routes, `/tool-registry` en
 * double.
 *
 * Cette garde monte le vrai gabarit racine, porte de « calme » FERMÉE (comme en
 * production), et compte les requêtes parties au premier rendu authentifié.
 * Le plafond n'est pas un objectif chiffré arbitraire : c'est le compte APRÈS le
 * correctif. Toute requête ajoutée au gabarit doit être différée
 * (`useDeferredEnabled`) — ou assumer, ici, de payer un cran de plus.
 */

const MAX_ROOT_REQUESTS_BEFORE_PAGE = 1

const USER = { id: 'u1', email: 'a@b.fr', email_confirmed_at: null, created_at: '2026-01-01', roles: ['customer'] }

function rawFetchPaths(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map(call => {
    const input: unknown = call[0]
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input)
    return `fetch ${raw.replace(/^https?:\/\/[^/]+/, '')}`
  })
}

function apiFetchPaths(): string[] {
  return vi.mocked(apiFetch).mock.calls.map(([args]) => `${args.method ?? 'GET'} ${args.path}`)
}

describe('gabarit racine — requêtes avant le premier rendu de page', () => {
  beforeEach(() => deferralForTests(true))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    deferralForTests(false)
  })

  it(`au plus ${MAX_ROOT_REQUESTS_BEFORE_PAGE} requête part avant que la page soit calme`, async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)
    vi.mocked(apiFetch).mockClear()

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const rootRoute = createRootRoute({ component: SessionContent })
    const page = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <div>page</div> })
    const router = createRouter({
      routeTree: rootRoute.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <SessionContext.Provider value={{ user: USER, loading: false }}>
            <RouterProvider router={router} />
          </SessionContext.Provider>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('page')
    await new Promise(resolve => setTimeout(resolve, 50))

    const sent = [...apiFetchPaths(), ...rawFetchPaths(fetchSpy)]
    // `GET /credits` reste : il porte `is_demo` (`useIsDemo`, monté au root) ET les
    // verrous de navigation que toute page lit — partagé par clé, jamais doublé.
    expect(sent).toEqual(['GET /credits'])
    expect(sent.length).toBeLessThanOrEqual(MAX_ROOT_REQUESTS_BEFORE_PAGE)
  })
})
