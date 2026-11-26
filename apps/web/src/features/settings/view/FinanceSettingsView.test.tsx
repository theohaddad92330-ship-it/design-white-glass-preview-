import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: vi.fn(),
  },
}))

let mockRole: string | null = 'finance'
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({
    team: mockRole ? { workspace: { role: mockRole } } : undefined,
    isLoading: false,
    isError: false,
  }),
}))

const { FinanceSettingsView } = await import('./FinanceSettingsView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  mockRole = 'finance'
})

/**
 * #2420.17 — LE SEUIL D'ALERTE DE MARGE DE L'ESPACE, ENFIN RÉGLABLE.
 *
 * `PATCH delivery/finance/margin-threshold` existait sans aucun appelant web
 * (`git grep` vide côté `apps/web`) : « Seuil d'alerte · non réglé » était en
 * LECTURE SEULE sur `/pilotage/finance`, et `diagnose()` rendait toujours
 * `null` côté moteur. Ce test vérifie que le formulaire des Réglages appelle
 * la route EXISTANTE plutôt que de la dupliquer, et qu'il sait dire NON s'il
 * cesse de le faire.
 */
describe('#2420.17 — FinanceSettingsView', () => {
  it('lit le seuil en cours par la route existante, et le montre', async () => {
    apiFetch.mockImplementation((args: { path: string }) => {
      if (args.path === '/delivery/finance/margin') return Promise.resolve({ threshold: 15 })
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<FinanceSettingsView />)

    expect(await screen.findByDisplayValue('15')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/delivery/finance/margin' })
  })

  it('« non réglé » reste un inconnu NOMMÉ — jamais 0, jamais un défaut', async () => {
    apiFetch.mockResolvedValue({ threshold: null })
    renderView(<FinanceSettingsView />)

    expect(await screen.findByText(/aucune alerte ne se déclenche/)).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByDisplayValue('0')).toBeNull()
  })

  it('ENREGISTRER appelle PATCH margin-threshold avec le pourcentage saisi', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }) => {
      if (args.path === '/delivery/finance/margin' && !args.method) return Promise.resolve({ threshold: null })
      if (args.path === '/delivery/finance/margin-threshold' && args.method === 'PATCH')
        return Promise.resolve({ thresholdPercent: 12 })
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<FinanceSettingsView />)

    const input = await screen.findByLabelText("Seuil d'alerte de marge, en pourcentage")
    await userEvent.setup().type(input, '12')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/delivery/finance/margin-threshold',
        method: 'PATCH',
        body: { thresholdPercent: 12 },
      }),
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Le seuil d'alerte est enregistré."))
  })

  it('« Remettre à non réglé » envoie `null` — le seul geste de retour arrière', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (args.path === '/delivery/finance/margin' && !args.method) return Promise.resolve({ threshold: 15 })
      if (args.path === '/delivery/finance/margin-threshold' && args.method === 'PATCH')
        return Promise.resolve({ thresholdPercent: null })
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<FinanceSettingsView />)

    await screen.findByDisplayValue('15')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remettre à « non réglé »' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/delivery/finance/margin-threshold',
        method: 'PATCH',
        body: { thresholdPercent: null },
      }),
    )
  })

  it('SAIT DIRE NON — un membre sans le droit de régler la marge voit la valeur, pas le formulaire', async () => {
    mockRole = 'sales'
    apiFetch.mockResolvedValue({ threshold: 15 })
    renderView(<FinanceSettingsView />)

    expect(await screen.findByText(/15/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Seuil d'alerte de marge, en pourcentage")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('un membre sans AUCUN droit financier voit un accès refusé, jamais un 403 brut', async () => {
    mockRole = 'member'
    renderView(<FinanceSettingsView />)

    expect(await screen.findByText('Réservé aux gestionnaires de la marge')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
