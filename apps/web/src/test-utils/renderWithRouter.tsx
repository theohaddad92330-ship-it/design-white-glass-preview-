import { render, type RenderResult } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import type { ReactElement } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0, staleTime: 0 },
    mutations: { retry: false },
  },
})

/**
 * #2405.3 — ce `QueryClient` est un SINGLETON de module, partagé par tous les
 * tests d'un même fichier (pas « un par rendu », malgré ce que le
 * commentaire au-dessus laissait croire). Un hook qui déclare un
 * `staleTime` explicite (GA-26 : une seule lecture pour plusieurs écrans,
 * comme `pilotage-hygiene`) peut donc lire les données mises en cache par
 * le test PRÉCÉDENT au lieu de relire — `gcTime: 0` ne suffit pas, il ne
 * fait qu'accélérer l'éviction APRÈS que tous les observateurs se soient
 * désabonnés, pas avant. Un test dont le comportement dépend d'un
 * `staleTime` de production appelle ceci dans son `beforeEach`.
 */
export function resetTestQueryClient(): void {
  queryClient.clear()
}

const session: SessionContextValue = { user: null, loading: false }

/**
 * Minimal test harness: TanStack Router + React-Query + SessionContext.
 *
 * Every view now consumes `useSession()` (directly or via `useAuth()`) and at
 * least one `useQuery` hook. Wrapping the tree here means component tests
 * don't need a real `SessionProvider` (which hits `localStorage` + a network
 * `session()` call) nor a real `QueryClient` config.
 *
 * A fresh `QueryClient` per render isolates cache between tests, and
 * `retry: false` makes rejected queries surface synchronously so tests don't
 * hang waiting for the default 3 retries.
 */
export function renderWithRouter(ui: ReactElement, initialPath = '/'): RenderResult {
  const rootRoute = createRootRoute()
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$',
    component: () => (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([catchAllRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}
