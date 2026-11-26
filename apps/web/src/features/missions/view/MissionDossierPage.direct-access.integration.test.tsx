import { render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'

/**
 * #4191 (recette 2, E1) — `/missions/<id>` OUVERT EN ACCÈS DIRECT (URL collée,
 * rechargement) : on monte le routeur COMPLET sur l'adresse, sans jamais passer
 * par la liste, et la fiche doit se rendre.
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
            user: { id: 'u-1', email: 'm@esn.fr', created_at: '2026-01-01T00:00:00Z', roles: [] },
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
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [], workspace: { role: 'member' } }, isLoading: false, isError: false }),
  TEAM_KEY: ['workspace-team'] as const,
}))
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  toSnapshotKey: (queryKey: readonly unknown[]) => JSON.stringify(queryKey),
  getQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  saveQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  useHydrateFromSnapshot: () => undefined,
}))

const MISSION = {
  id: '966aa66b-0000-4000-8000-000000000001',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  account_id: '33333333-3333-4333-8333-333333333333',
  opportunity_id: '44444444-4444-4444-8444-444444444444',
  label: 'Renfort plateforme data',
  status: 'active',
  started_on: '2026-05-01',
  ends_on: '2026-11-20',
  daily_rate: 780,
  daily_cost: 520,
  contract_kind: 'regie',
  role_title: 'Architecte cloud',
  billing_contact_id: null,
  owner_id: 'u-1',
  stage_entered_at: '2026-05-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  accountName: 'ACME',
  renewal: 'j30',
  risks: ['renewal_not_started'],
  nextAction: 'renew_now',
  marginPercent: 31.8,
  is_private: false,
  assignees: [{ id: 'c-1', fullName: 'Yanis Bensaïd', photoUrl: null }],
}
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(({ path }: { path: string }) => {
    if (path.startsWith('/delivery/missions')) return Promise.resolve({ missions: [MISSION], canReadFinance: true })
    if (path.includes('onboarding')) return Promise.resolve({ completed: true })
    if (path.startsWith('/record-links')) return Promise.resolve({ links: [] })
    return Promise.resolve({})
  }),
}))

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

async function openDirectly(path: string) {
  const { routeTree } = await import('@/routeTree.gen')
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  })
  // « Accès direct » : l'URL est chargée telle quelle, SANS jamais être passée par la liste.
  await router.load()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
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
  return router
}

describe('#4191 E1 — fiches ouvertes en accès direct (URL collée, rechargement)', () => {
  it('/missions/:id : la fiche se rend sans être passée par la liste', { timeout: 120_000 }, async () => {
    const router = await openDirectly(`/missions/${MISSION.id}`)
    await waitFor(() => expect(screen.getAllByText('Renfort plateforme data').length).toBeGreaterThan(0), {
      timeout: 30_000,
    })
    expect(router.state.location.pathname).toBe(`/missions/${MISSION.id}`)
    expect(document.querySelector('.animate-spin')).toBeNull()
  })

  it.each([
    ['/projects/needs/66666666-6666-4666-8666-666666666666'],
    ['/projects/77777777-7777-4777-8777-777777777777'],
    ['/consultants/88888888-8888-4888-8888-888888888888'],
  ])(
    '%s : le routeur se résout sur l’adresse, sans spinner global (les charges utiles sont doublées à vide : on ne juge pas le contenu)',
    { timeout: 120_000 },
    async path => {
      const router = await openDirectly(path)
      await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 30_000 })
      await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull(), { timeout: 30_000 })
      expect(router.state.location.pathname).toBe(path)
    },
  )
})
