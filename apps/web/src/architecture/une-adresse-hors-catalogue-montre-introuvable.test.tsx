import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'

/**
 * Recette 07/10 — une adresse hors catalogue (`/opportunities`, `/targets` :
 * des noms qui n'existent dans AUCUNE langue du routeur, français ou
 * anglais) rendait une page BLANCHE en production, au lieu de l'écran
 * « introuvable » (`NotFound`, `src/components/organisms/not-found.tsx`).
 *
 * Le mécanisme existait déjà des DEUX côtés — `router.tsx` porte
 * `defaultNotFoundComponent`, et `NotFound` sait rendre un titre, un texte et
 * un retour — sans qu'aucun test ne les RELIE sur une navigation RÉELLE : « du
 * code juste, calculé, testé, que personne n'appelle ». `__root.tsx` porte
 * maintenant son PROPRE `notFoundComponent` (la route racine, pas seulement
 * l'instance de routeur) ; ce test monte le VRAI `routeTree.gen.ts` et la
 * VRAIE coquille pour le prouver sur une navigation qui échoue vraiment.
 *
 * Même échafaudage que `chaque-route-de-premier-niveau-survit-au-chargement-
 * direct.test.tsx` (#2593) : session doublée, routeur et coquille réels — le
 * coût de monter le routeur COMPLET est celui de l'application entière.
 */
vi.mock('@/features/auth/session-provider', async () => {
  const { SessionContext } = await import('@/features/auth/session-context')
  return {
    SessionProvider: ({ children }: { children: ReactNode }) =>
      createElement(
        SessionContext.Provider,
        {
          value: {
            user: { id: 'u1', email: 'sales@esn.fr', created_at: '2026-01-01T00:00:00Z', roles: [] },
            loading: false,
          },
        },
        children,
      ),
  }
})
vi.mock('@/features/profile-context/hooks/useProfileContextBackgroundTask', () => ({
  useProfileContextBackgroundTask: () => undefined,
}))
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  toSnapshotKey: (queryKey: readonly unknown[]) => JSON.stringify(queryKey),
  getQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  saveQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  useHydrateFromSnapshot: () => undefined,
}))

async function buildRouter(initialPath: string) {
  const { routeTree } = await import('@/routeTree.gen')
  const { RootErrorBoundary } = await import('@/components/templates/error-boundary')
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPendingMinMs: 0,
    defaultErrorComponent: RootErrorBoundary,
  })
}

function renderRouter(router: Awaited<ReturnType<typeof buildRouter>>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    createElement(
      ThemeProvider,
      null,
      createElement(
        PreferencesProvider,
        null,
        createElement(
          TooltipProvider,
          null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createElement(RouterProvider as any, { router }),
          ),
        ),
      ),
    ),
  )
}

// Même budget que #2593 : le PREMIER montage du fichier transforme tout le
// graphe de modules (20-40 s), chaque montage suivant est quasi immédiat.
const ROUTE_MOUNT_TIMEOUT_MS = 60_000

// CI 40233107436 (shard 3/4) — le montage À FROID (import de `routeTree.gen` +
// transform du graphe) dépassait 60 s sous la contention d'un runner chargé :
// le 1er test expirait, mais son `await` continuait en tâche de fond et
// MONTAIT sa page APRÈS l'expiration, sans `cleanup` — le 2e test trouvait
// alors deux « Page introuvable ». Une seule cause, deux symptômes. Le
// coût à froid se paie donc ICI, une fois, sur un montage témoin démonté
// aussitôt (même mécanisme que #2763 dans `chaque-route-de-premier-niveau-…`) ;
// le budget PAR ROUTE ci-dessus reste inchangé et un vrai montage bloqué
// continue d'échouer en 60 s.
const BEFORE_ALL_WARMUP_TIMEOUT_MS = 180_000

beforeAll(async () => {
  const router = await buildRouter('/opportunities')
  await router.load()
  renderRouter(router)
  await waitFor(() => expect(router.state.status).toBe('idle'))
  cleanup()
}, BEFORE_ALL_WARMUP_TIMEOUT_MS)

describe.each([['/opportunities'], ['/targets']])(
  'recette 07/10 — %s (hors catalogue) montre « introuvable », jamais une page blanche',
  path => {
    it('rend le titre, le texte, et un retour qui marche VRAIMENT', { timeout: ROUTE_MOUNT_TIMEOUT_MS }, async () => {
      const router = await buildRouter(path)
      await router.load()
      const { container } = renderRouter(router)
      await waitFor(() => expect(router.state.status).toBe('idle'))

      // Jamais une page blanche : du texte, pas la frontière d'erreur générique.
      expect(container.textContent).not.toBe('')
      expect(screen.queryByText('Oups.')).not.toBeInTheDocument()
      expect(screen.getByText('Page introuvable')).toBeInTheDocument()
      expect(screen.getByText("La page que tu cherches n'existe pas ou a été déplacée.")).toBeInTheDocument()

      // Le retour MARCHE vraiment — pas seulement présent dans le DOM.
      // `GenericProblemMessage` rend DEUX fois le même bouton (mise en page
      // bureau et mobile toutes deux montées, jsdom n'exécute aucun CSS) :
      // le premier suffit à prouver le geste.
      fireEvent.click(screen.getAllByRole('button', { name: "Retour à l'accueil" })[0])
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    })
  },
)
