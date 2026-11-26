import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'

// --- Auth: inject a logged-in session via the real SessionContext ---
// L'écran porte maintenant un accueil personnalisé, qui lit le profil. Ce
// test ne mesure pas l'accueil : il double la feuille plutôt que de monter un
// fournisseur de session dont il n'a rien à faire. `''` = prénom inconnu,
// c'est la branche qui garde la formule d'origine.
// #1321 — le composer porte maintenant le tiroir des commandes, qui lit le
// catalogue (donc un QueryClient). Ces tests ne mesurent pas le tiroir : ils
// doublent la feuille plutôt que de monter un fournisseur dont ils n'ont rien
// à faire.
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: () => null,
}))
// #1320 — `Chat` lit `useIsDemo` pour choisir son MOTEUR de réponse. Le hook
// passe par la charge crédits (donc react-query) ; ce fichier ne monte pas de
// `QueryClientProvider` et ne mesure pas la démonstration.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false, useDemoSpaceStatus: () => 'real' }))
// F1-FIX #4345 — sur bureau la porte de Laura ouvre la bulle SUR PLACE ; ce test garde la route /chat (mobile,
// surcouche, ou déjà sur /chat : le hook rend `null` et l'entrée reste un lien).
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => null }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #4967 (L14) — l'entrée NUE sur /chat demande au serveur s'il reste un tour en cours avant de montrer
// l'accueil. Ce test ne mesure pas le retour sur conversation : rien ne tourne, l'accueil reste.
vi.mock('@/features/chat/api/chatTurnsApi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/chat/api/chatTurnsApi')>()
  return { ...actual, chatTurnsApi: { ...actual.chatTurnsApi, running: async () => ({ turns: [] }) } }
})
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
vi.mock('@/features/profiles/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ data: true, isLoading: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('@/features/discover/hooks/useDefaultDiscover', () => ({
  useDefaultDiscover: () => ({ isLoading: false }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [], workspace: { role: 'member' } }, isLoading: false, isError: false }),
  // Le lot RBAC a ajouté un lecteur de `TEAM_KEY` dans l'arbre monté ici. Un
  // `vi.mock` remplace le module ENTIER : l'export manquant fait lever le
  // module, la frontière d'erreur du routeur affiche « Something went wrong! »,
  // et le test accuse « DASHBOARD_MARKER introuvable » — donc l'écran, pas le
  // mock. La valeur est celle du vrai module, pour qu'il ne mente pas.
  TEAM_KEY: ['workspace-team'] as const,
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
// Keep the starting screen cheap — /dashboard redirige vers /briefing depuis la refonte Théo (today-jour.A8).
// La page du brief monte elle-même la coque client (barre latérale comprise) : le marqueur la garde.
vi.mock('@/features/briefing/view/BriefingPage', async () => {
  const { CustomerPage } = await import('@/components/page/CustomerPage')
  return {
    BriefingPage: () => createElement(CustomerPage, null, createElement('div', null, 'DASHBOARD_MARKER')),
  }
})
// Long-memory + rag hooks used by the copilot panel (mirrors Chat.test.tsx).
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
}))
// jsdom has no IndexedDB — the query cache persister (used by NavUser's
// useProfile) would throw unhandled. No-op it so the router test stays clean.
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  toSnapshotKey: (queryKey: readonly unknown[]) => JSON.stringify(queryKey),
  getQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  saveQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  useHydrateFromSnapshot: () => undefined,
}))

// jsdom has no matchMedia; @bellum/ui's sidebar (mobile detection) needs it.
beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }
})

async function buildRouter(initialPath: string) {
  const { routeTree } = await import('@/routeTree.gen')
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPendingMinMs: 0,
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

/**
 * Ce test monte le routeur COMPLET (toutes les routes de l'app) puis navigue :
 * son coût suit le poids de l'application entière, pas celui du chat. Il frôlait
 * le timeout par défaut de 5 s (~4,9 s) — n'importe quel écran ajouté ailleurs le
 * faisait tomber. Budget explicite : on teste la navigation, pas la vitesse.
 *
 * Relevé le 17/08, après l'ajout du neuvième écran (Missions) : **2 s en
 * isolation, plus de 20 s dans la suite complète**. L'écart ne vient pas du
 * chat ni du routeur mais de la CONTENTION — sept cent soixante fichiers de
 * test en parallèle sur la même machine. Un budget qu'il faut relever à chaque
 * tranche mesurerait la charge du portable, pas le produit ; celui-ci est donc
 * posé très large, une fois, pour cesser d'être un test qui tombe au hasard.
 */
const ROUTER_MOUNT_TIMEOUT_MS = 60_000

describe('Laura — l’entrée de nav mène à la conversation', () => {
  it(
    // L'entrée s'appelle « Laura » depuis le 23/08 : le copilote et le chatbot
    // du site sont la même personne, et deux noms pour un seul interlocuteur
    // seraient deux vérités possibles pour la même question.
    'clicking the "Laura" sidebar entry navigates to /chat and mounts the copilot',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      const router = await buildRouter('/briefing')
      await router.load()
      renderRouter(router)

      // We start on the dashboard.
      await waitFor(() => expect(screen.getByText('DASHBOARD_MARKER')).toBeInTheDocument())

      // The nav entry is a real link to /chat (not a dead/disabled button).
      // #1947 — it carries `?fresh=` so that every click opens a NEW thread, even
      // from /chat itself (the same URL would do nothing).
      const link = await screen.findByRole('link', { name: /Laura/i })
      expect(link.getAttribute('href')).toMatch(/^\/chat\?fresh=/)

      fireEvent.click(link)

      // The URL actually changes to /chat...
      await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
      // ...and the copilot screen mounts (Laura's home subtitle, chat.json:home.subtitle, #1600).
      // #3884.1 — the fallback title was dropped (it duplicated the opener bubble's greeting).
      await waitFor(() => expect(screen.getByText(/Je peux travailler sur ton portefeuille/)).toBeInTheDocument())
      // ...with a working composer, so the user can actually ask a question.
      expect(screen.getByPlaceholderText('Écris ton message...')).toBeInTheDocument()
    },
  )

  it(
    'the /chat route renders the copilot full-screen when opened cold',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      const router = await buildRouter('/chat')
      await router.load()
      renderRouter(router)

      await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
      // #3884.1 — the fallback title was dropped (it duplicated the opener bubble's greeting).
      await waitFor(() => expect(screen.getByText(/Je peux travailler sur ton portefeuille/)).toBeInTheDocument())
      expect(screen.getByPlaceholderText('Écris ton message...')).toBeInTheDocument()
    },
  )
})
