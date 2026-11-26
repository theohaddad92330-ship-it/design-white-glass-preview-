import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn(), info: vi.fn() },
}))

let mockRole: string | null = 'admin'
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({
    team: mockRole ? { workspace: { role: mockRole } } : undefined,
    isLoading: false,
    isError: false,
  }),
}))

const { ReverseMarketSettingsView } = await import('./ReverseMarketSettingsView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  toastSuccess.mockReset()
  mockRole = 'admin'
})

/**
 * `#2035.10` — LE MARCHÉ INVERSÉ : UN SEUL ÉCRAN POUR TOUT LE SUJET.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
 * concurrentes. Le nombre de recruteurs affichés se réglait sur un AUTRE écran
 * (« Priorisation commerciale »), sur une AUTRE route. Ce test garde qu'il est
 * ici, sur la même route que les deux autres réglages du sujet (GA-26).
 *
 * 🔴 La ligne rouge testée ici : une capacité NON RENSEIGNÉE ne s'affiche
 * jamais « 0 » (GA-18/GA-19), et le libellé de la capacité posée ne se lit
 * jamais comme un pourcentage de chances.
 */
describe('#2035.10 — ReverseMarketSettingsView', () => {
  it('lit le réglage en vigueur par la route existante', async () => {
    apiFetch.mockResolvedValue({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
    renderView(<ReverseMarketSettingsView />)

    expect(await screen.findByDisplayValue('8')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/reverse-market-settings' })
  })

  it('« non renseignée » reste un inconnu NOMMÉ — jamais 0', async () => {
    apiFetch.mockResolvedValue({ enabled: false, responseCapacityPerWeek: null, maxRecruitersShown: 10 })
    renderView(<ReverseMarketSettingsView />)

    expect(await screen.findByTitle('non renseignée')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('0')).toBeNull()
  })

  it('ENREGISTRER envoie PATCH avec la capacité saisie', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (args.path === '/workspaces/reverse-market-settings' && !args.method)
        return Promise.resolve({ enabled: false, responseCapacityPerWeek: null, maxRecruitersShown: 10 })
      if (args.path === '/workspaces/reverse-market-settings' && args.method === 'PATCH')
        return Promise.resolve({ enabled: false, responseCapacityPerWeek: 5, maxRecruitersShown: 10 })
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<ReverseMarketSettingsView />)

    const input = await screen.findByLabelText('Capacité de réponse')
    await userEvent.setup().type(input, '5')
    // Deux formulaires depuis la fusion : le premier « Enregistrer » est celui
    // de la capacité, le second celui des recruteurs affichés.
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Enregistrer' })[0] as HTMLElement)

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/reverse-market-settings',
        method: 'PATCH',
        body: { responseCapacityPerWeek: 5 },
      }),
    )
  })

  it('l’interrupteur envoie PATCH `enabled`, jamais la capacité', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (!args.method) return Promise.resolve({ enabled: false, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
      return Promise.resolve({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
    })
    renderView(<ReverseMarketSettingsView />)

    await screen.findByDisplayValue('8')
    await userEvent.setup().click(screen.getByLabelText('Marché inversé activé'))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/reverse-market-settings',
        method: 'PATCH',
        body: { enabled: true },
      }),
    )
  })

  it('SAIT DIRE NON — sans team:manage, la valeur se lit mais aucun formulaire n’apparaît', async () => {
    mockRole = 'sales'
    apiFetch.mockResolvedValue({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
    renderView(<ReverseMarketSettingsView />)

    expect(await screen.findByText(/8/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Capacité de réponse')).toBeNull()
    expect(screen.queryByLabelText('Recruteurs affichés par consultant')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('porte le réglage venu de « Priorisation commerciale » — sur CETTE route, pas une seconde', async () => {
    apiFetch.mockResolvedValue({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 25 })
    renderView(<ReverseMarketSettingsView />)

    expect(await screen.findByDisplayValue('25')).toBeInTheDocument()
    expect(screen.getByText(/25 recruteurs remontés par consultant/)).toBeInTheDocument()
    // UNE seule lecture, sur UNE seule route : l'écran ne va pas chercher un
    // second endpoint pour un réglage du même sujet.
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/reverse-market-settings' })
  })

  it('ENREGISTRER les recruteurs affichés envoie PATCH avec ce SEUL champ', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (!args.method) return Promise.resolve({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
      return Promise.resolve({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 30 })
    })
    renderView(<ReverseMarketSettingsView />)

    const input = await screen.findByLabelText('Recruteurs affichés par consultant')
    await userEvent.setup().clear(input)
    await userEvent.setup().type(input, '30')
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Enregistrer' })[1] as HTMLElement)

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/reverse-market-settings',
        method: 'PATCH',
        body: { maxRecruitersShown: 30 },
      }),
    )
  })

  it('un nombre de recruteurs hors bornes (1-50) ne part pas — la borne est celle du CHECK SQL', async () => {
    apiFetch.mockResolvedValue({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 10 })
    renderView(<ReverseMarketSettingsView />)

    const input = await screen.findByLabelText('Recruteurs affichés par consultant')
    await userEvent.setup().clear(input)
    await userEvent.setup().type(input, '51')

    const submit = screen.getAllByRole('button', { name: 'Enregistrer' })[1] as HTMLButtonElement
    expect(submit).toBeDisabled()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
