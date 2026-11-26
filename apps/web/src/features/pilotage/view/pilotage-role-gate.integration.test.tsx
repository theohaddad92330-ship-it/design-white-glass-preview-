import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'
import type { Intervention } from '@bellum/contracts'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'

/**
 * #2154.11/.12 — « Manager ouvrant Pilotage » et « Membre sans permission
 * manager », deux des dix-huit scénarios E2E nommés par #2154.11-.29 (#2958).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT — pas la règle, son branchement bout en bout
 * ─────────────────────────────────────────────────────────────────────────
 * `hasPermission(role, 'team:manage')` gate déjà « attribuer une
 * intervention » dans `InterventionsBlock` (`InterventionsBlock.test.tsx`,
 * #2206.53) — mais CE test monte le composant SEUL, hors routeur, avec
 * `InterventionsBlock` importé directement. Rien ne prouvait qu'un manager
 * ou un membre arrivant par l'URL RÉELLE `/pilotage` (celle que la nav, un
 * lien de Laura ou un favori ouvrent) atteint bien ce même geste gated. Ce
 * fichier monte le routeur COMPLET (patron de `chat-nav-route.integration.test.tsx`)
 * et laisse `InterventionsBlock` RÉEL — seules les données (membres, chaîne
 * pilotage, interventions) sont doublées, jamais la logique de permission.
 *
 * `sales_ops` (« Commercial + gestion d'équipe ») est le rôle réel le plus
 * proche du terme produit « manager » — c'est un des trois rôles qui
 * portent `team:manage` dans `ROLE_PERMISSIONS` (`workspace.ts`, avec
 * `owner`/`admin`) ; `member` n'en porte aucun.
 */

vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/features/auth/session-provider', async () => {
  const { SessionContext } = await import('@/features/auth/session-context')
  return {
    SessionProvider: ({ children }: { children: ReactNode }) =>
      createElement(
        SessionContext.Provider,
        {
          value: {
            user: { id: 'u-1', email: 'manager@esn.fr', created_at: '2026-01-01T00:00:00Z', roles: [] },
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
// Louis 23/10 — l'offre de l'espace (`manager_cockpit`), lue par la ROUTE : `undefined` = liste inconnue (ouverte).
const planFeatures = vi.hoisted(() => ({ current: undefined as string[] | undefined }))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: planFeatures.current ? { features: planFeatures.current } : undefined, isLoading: false }),
}))
vi.mock('@/features/plan-features/useRefreshEntitlementsOnLock', () => ({
  useRefreshEntitlementsOnLock: () => undefined,
}))
vi.mock('@/features/plan-features/PlanFeatureLocked', () => ({
  PlanFeatureLocked: ({ feature }: { feature: string }) => <div data-testid="plan-locked">{feature}</div>,
}))
vi.mock('@/features/discover/hooks/useDefaultDiscover', () => ({
  useDefaultDiscover: () => ({ isLoading: false }),
}))
const teamRole = vi.hoisted(() => ({ current: 'member' }))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [], workspace: { role: teamRole.current } }, isLoading: false, isError: false }),
  TEAM_KEY: ['workspace-team'] as const,
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  toSnapshotKey: (queryKey: readonly unknown[]) => JSON.stringify(queryKey),
  getQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  saveQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  useHydrateFromSnapshot: () => undefined,
}))

// ── Pilotage lui-même : on double la DONNÉE (chaîne, interventions, membres),
// jamais la RÈGLE de permission (`hasPermission`, réel, `@bellum/contracts`).
vi.mock('@/features/pilotage/api', () => ({
  pilotageApi: { chain: () => Promise.resolve({ levels: [], stockBaseline: null, generatedAt: null }) },
}))
const interventionsQuery = vi.fn<() => { data: Intervention[] }>(() => ({ data: [] }))
vi.mock('@/features/playbooks/api', () => ({
  useInterventions: () => interventionsQuery(),
  useAssignIntervention: () => ({ mutate: vi.fn(), isPending: false }),
  useDecideIntervention: () => ({ mutate: vi.fn(), isPending: false }),
}))
const membersQuery = vi.fn()
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => membersQuery() }))

// Les sept panneaux lourds de /pilotage n'ont rien à voir avec le geste
// testé (attribuer une intervention) — les doubler évite de doubler LEURS
// propres appels réseau, sans rapport avec ce scénario.
vi.mock('@/features/pilotage/view/CrmPipelinePanel', () => ({ CrmPipelinePanel: () => null }))
vi.mock('@/features/pilotage/view/RitualsPanel', () => ({ RitualsPanel: () => null }))
vi.mock('@/features/pilotage/view/WorkspaceLearningPanel', () => ({ WorkspaceLearningPanel: () => null }))
// #3258.13 (épopée #3362, lot P01) — même raison que ses voisins : un appel
// réseau (`/accounts/interest-penetrability-portfolio`) sans rapport avec le
// geste testé ici.
vi.mock('@/features/pilotage/view/InterestPenetrabilityPortfolioPanel', () => ({
  InterestPenetrabilityPortfolioPanel: () => null,
}))
vi.mock('@/features/pilotage/view/ContributionPanel', () => ({ ContributionPanel: () => null }))
vi.mock('@/features/playbooks/view/PlaybooksSummary', () => ({ PlaybooksSummary: () => null }))
// L1 Cockpit — les blocs neufs ont leurs propres tests et leurs propres lectures.
vi.mock('@/features/pilotage/view/WeekDeltaStrip', () => ({ WeekDeltaStrip: () => null, WeekDeltaFold: () => null }))
vi.mock('@/features/pilotage/view/MonthObjectiveBlock', () => ({ MonthObjectiveBlock: () => null }))
// Théo D — la page Pilotage porte maintenant les sections Pipe, Staffing et Finance : leurs écrans ont
// leurs propres tests et leurs propres lectures, sans rapport avec la permission testée ici.
vi.mock('@/features/pilotage/pipe/PipeScreen', () => ({
  PipeScreen: ({ manager, own }: { manager?: boolean; own?: boolean }) => (
    <div data-testid="pipe-screen" data-manager={String(manager)} data-own={String(own)} />
  ),
}))
vi.mock('@/features/pilotage/staffing/StaffingScreen', () => ({ StaffingScreen: () => <div data-testid="staffing" /> }))
vi.mock('@/features/pilotage/finance/FinanceScreen', () => ({ FinanceScreen: () => <div data-testid="finance" /> }))
// Louis 23/10 — le Cockpit de Théo (`view/cockpit/*`) : sa lecture des chiffres et sa courbe ont leurs propres tests ;
// les tuiles, elles, restent RÉELLES — c'est leur présence qui prouve que le Cockpit est monté au chargement direct.
vi.mock('@/features/pilotage/view/cockpit/useCockpitFigures', () => ({
  useCockpitFigures: () => ({
    month: '2026-10',
    objective: null,
    objectiveLoading: false,
    objectiveFailed: false,
    pipeOpen: null,
    won: null,
    bench: null,
    actions: null,
    stages: [],
    stagesLoaded: true,
    cash: null,
    cashLoading: false,
  }),
}))
vi.mock('@/features/pilotage/view/cockpit/CockpitPipeEvolution', () => ({ CockpitPipeEvolution: () => null }))
vi.mock('@/features/pilotage/view/cockpit/CockpitExportButton', () => ({ CockpitExportButton: () => null }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: () => ({ data: { user_role: null } }) }))

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

async function buildRouter() {
  const { routeTree } = await import('@/routeTree.gen')
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/pilotage'] }),
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

function member(role: WorkspaceMember['role']): WorkspaceMember {
  return { userId: 'u-1', email: 'manager@esn.fr', fullName: 'Louis', role, isSelf: true }
}

function openIntervention(): Intervention {
  return {
    id: 'itv-1',
    kind: 'account_untouched',
    subjectType: 'account',
    subjectId: '00000000-0000-4000-8000-000000000000',
    subjectLabel: null,
    ownerId: null,
    ownerName: null,
    detail: 'aucune prochaine action prévue',
    state: 'open',
    openedAt: '2026-08-20T09:00:00.000Z',
    resolvedAt: null,
  }
}

const ROUTER_MOUNT_TIMEOUT_MS = 60_000

describe('#2154.11 — un manager ouvrant /pilotage voit le geste d’attribution', () => {
  it(
    'un rôle `sales_ops` (team:manage) traverse VRAIMENT le routeur jusqu’au sélecteur d’attribution',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      teamRole.current = 'sales_ops'
      planFeatures.current = undefined
      membersQuery.mockReturnValue({ data: [member('sales_ops')] })
      interventionsQuery.mockReturnValue({ data: [openIntervention()] })

      const router = await buildRouter()
      await router.load()
      renderRouter(router)

      await waitFor(() => expect(router.state.location.pathname).toBe('/pilotage'))
      // Louis 23/10 — chez Théo, la file d'arbitrage s'ouvre depuis « Voir toutes les décisions » (Cockpit).
      fireEvent.click(await screen.findByRole('button', { name: /Voir toutes les décisions/ }))
      // Le sélecteur d'attribution n'existe QUE pour `canAssign === true` —
      // `InterventionsBlock.tsx:189`. S'il se rend, la permission a VRAIMENT
      // traversé le routeur jusqu'au composant réel.
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    },
  )
})

describe('#2154.12 — un membre sans team:manage reste sur Pilotage : son pipe et Parcours, jamais le Cockpit (Louis 22/10/2026, chacun son pipe)', () => {
  it(
    'un rôle `member` ouvrant /pilotage voit la page, sa section Pipe bornée à SES affaires, et ni le sélecteur ni les sections d’équipe',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      teamRole.current = 'member'
      planFeatures.current = undefined
      membersQuery.mockReturnValue({ data: [member('member')] })
      interventionsQuery.mockReturnValue({ data: [openIntervention()] })

      const router = await buildRouter()
      await router.load()
      renderRouter(router)

      await waitFor(() => expect(router.state.location.pathname).toBe('/pilotage'))
      const pipe = await screen.findByTestId('pipe-screen')
      expect(pipe).toHaveAttribute('data-manager', 'false')
      expect(pipe).toHaveAttribute('data-own', 'true')
      expect(screen.queryByTestId('staffing')).not.toBeInTheDocument()
      expect(screen.queryByTestId('finance')).not.toBeInTheDocument()
      expect(screen.getAllByText('Cette section n’est pas ouverte à ton rôle.').length).toBeGreaterThan(0)
      expect(screen.queryByText('aucune prochaine action prévue')).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    },
  )
})

/**
 * Louis 23/10 — LE COCKPIT DE THÉO REMPLACE LA PAGE PR11, et il plantait au chargement direct en laissant /pilotage
 * sans la porte de l'offre (il comptait sur `ManagerTabRoute`, supprimé). Ces trois scénarios traversent le routeur
 * RÉEL, depuis l'adresse tapée : la route lit l'offre `manager_cockpit`, la page règle le droit par section.
 */
describe('Louis 23/10 — /pilotage au chargement direct : le Cockpit de Théo, la porte de l’offre, le droit par section', () => {
  it(
    'chargement direct par un gestionnaire avec l’offre : le Cockpit de Théo, Staffing et Finance sont montés',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      teamRole.current = 'admin'
      planFeatures.current = ['manager_cockpit']
      membersQuery.mockReturnValue({ data: [member('admin')] })
      interventionsQuery.mockReturnValue({ data: [] })

      const router = await buildRouter()
      await router.load()
      renderRouter(router)

      await waitFor(() => expect(router.state.location.pathname).toBe('/pilotage'))
      expect(await screen.findByTestId('cockpit-tiles')).toBeInTheDocument()
      expect(screen.getByTestId('cockpit-chain-fold')).toBeInTheDocument()
      expect(screen.getByTestId('staffing')).toBeInTheDocument()
      expect(screen.getByTestId('finance')).toBeInTheDocument()
      expect(screen.getByTestId('pipe-screen')).toHaveAttribute('data-manager', 'true')
      expect(screen.queryByTestId('plan-locked')).not.toBeInTheDocument()
    },
  )

  it(
    'sait dire NON : sans l’offre `manager_cockpit`, la porte de l’offre — jamais un chiffre d’équipe',
    { timeout: ROUTER_MOUNT_TIMEOUT_MS },
    async () => {
      teamRole.current = 'admin'
      planFeatures.current = []
      membersQuery.mockReturnValue({ data: [member('admin')] })
      interventionsQuery.mockReturnValue({ data: [] })

      const router = await buildRouter()
      await router.load()
      renderRouter(router)

      await waitFor(() => expect(router.state.location.pathname).toBe('/pilotage'))
      const locks = await screen.findAllByTestId('plan-locked')
      expect(locks.map(lock => lock.textContent)).toContain('manager_cockpit')
      expect(screen.queryByTestId('cockpit-tiles')).not.toBeInTheDocument()
      expect(screen.queryByTestId('staffing')).not.toBeInTheDocument()
      expect(screen.queryByTestId('finance')).not.toBeInTheDocument()
      expect(screen.getByTestId('pipe-screen')).toHaveAttribute('data-manager', 'false')
    },
  )
})
