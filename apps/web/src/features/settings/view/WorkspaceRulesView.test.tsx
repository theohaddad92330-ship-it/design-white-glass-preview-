import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRulesView as Rules } from '@bellum/contracts'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Le profil d'espace est lu depuis la session (barre latérale, onglets) : ici on lui donne la valeur lue du profil ESN.
const workspaceProfile = vi.hoisted(() => ({ value: null as 'staffing' | 'forfait_conseil' | null }))
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => workspaceProfile.value }))

const { WorkspaceRulesView } = await import('./WorkspaceRulesView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const neverChanged = { changedByUserId: null, changedByName: null, changedAt: null }

function rules(overrides: Partial<Rules> = {}): Rules {
  return {
    businessUnitAccountsVisibility: { value: 'shared', ...neverChanged },
    exportPolicy: { value: 'everyone', ...neverChanged },
    canEdit: true,
    dataExitAllowed: true,
    ...overrides,
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  workspaceProfile.value = null
})

/**
 * #2081.14 — Réglages › Règles d'espace : le SEUL endroit où l'on pose une
 * règle d'espace (GA-26). L'écran lit la route de l'API, montre la trace, et
 * ne propose le changement qu'à qui peut le faire — l'API le re-vérifie.
 */
describe('#2081.14 — WorkspaceRulesView', () => {
  it('lit les règles par la route de l’API et dit qu’une valeur par défaut n’a jamais été changée', async () => {
    apiFetch.mockResolvedValue(rules())
    renderView(<WorkspaceRulesView />)

    expect(await screen.findByRole('radio', { name: /Partagés à tout l’espace/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Tous ceux qui en ont le droit/ })).toBeChecked()
    expect(screen.getAllByText(/Valeur par défaut, jamais changée/)).toHaveLength(2)
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/rules' })
  })

  it('montre QUI a changé une règle, et QUAND', async () => {
    apiFetch.mockResolvedValue(
      rules({
        exportPolicy: {
          value: 'admins',
          changedByUserId: 'u-1',
          changedByName: 'Claire Martin',
          changedAt: '2026-09-19T08:30:00.000Z',
        },
      }),
    )
    renderView(<WorkspaceRulesView />)

    expect(await screen.findByRole('radio', { name: /Administrateurs seulement/ })).toBeChecked()
    expect(screen.getByText(/Changée par Claire Martin le 19 septembre 2026/)).toBeInTheDocument()
  })

  it('l’administrateur change une règle : la route de l’API reçoit la seule règle changée', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) =>
      Promise.resolve(
        args.method === 'PATCH' ? rules({ exportPolicy: { value: 'admins', ...neverChanged } }) : rules(),
      ),
    )
    renderView(<WorkspaceRulesView />)

    await userEvent.click(await screen.findByRole('radio', { name: /Administrateurs seulement/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/rules',
        method: 'PATCH',
        body: { exportPolicy: 'admins' },
      }),
    )
  })

  it('NON : un membre non administrateur LIT les règles mais ne peut pas les changer', async () => {
    apiFetch.mockResolvedValue(rules({ canEdit: false }))
    renderView(<WorkspaceRulesView />)

    const radios = await screen.findAllByRole('radio')
    for (const radio of radios) expect(radio).toBeDisabled()
    expect(screen.getByText(/Seul un administrateur de l’espace peut changer ces règles/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Administrateurs seulement/ }))
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
  })

  // #4291.5 — « 0 occurrence “forfait” sur 4 pages de réglages » : le profil d'espace se règle ICI.
  it('#4291.5 — le profil d’espace « Forfait / conseil » se lit et se change dans les règles d’espace', async () => {
    workspaceProfile.value = 'staffing'
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (args.path === '/esn-profile') return Promise.resolve({})
      return Promise.resolve(rules())
    })
    renderView(<WorkspaceRulesView />)

    expect(await screen.findByRole('radio', { name: /Staffing \(régie\)/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Forfait \/ conseil/ }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/esn-profile',
          method: 'PUT',
          body: { workspace_profile: 'forfait_conseil' },
        }),
      ),
    )
  })

  it('#4291.5 — NON : sans droit d’administrer l’espace, le profil se lit mais ne se change pas ; sans choix, il le dit', async () => {
    apiFetch.mockImplementation((args: { path: string }) =>
      Promise.resolve(args.path === '/esn-profile' ? {} : rules({ canEdit: false })),
    )
    renderView(<WorkspaceRulesView />)

    const forfait = await screen.findByRole('radio', { name: /Forfait \/ conseil/ })
    expect(forfait).toBeDisabled()
    expect(forfait).not.toBeChecked()
    expect(screen.getByText(/Aucun profil choisi/)).toBeInTheDocument()
  })
})
