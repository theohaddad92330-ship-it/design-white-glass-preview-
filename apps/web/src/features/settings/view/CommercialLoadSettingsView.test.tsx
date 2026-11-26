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

const { CommercialLoadSettingsView } = await import('./CommercialLoadSettingsView')

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
 * `#2035.11` — LA CHARGE COMMERCIALE ET LA PRIORISATION DES BESOINS.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
 * concurrentes. Cet écran porte les DEUX plafonds du sujet, et il est le SEUL
 * à les porter (GA-26). Ce que ce test garde : la lecture et l'écriture par la
 * seule route restante, et la distinction entre les deux plafonds —
 * `maxTrackedAccounts` non réglé reste un inconnu NOMMÉ, jamais « 0 dossier »,
 * tandis que `maxOpenNeeds` a toujours une valeur (colonne de production
 * `NOT NULL DEFAULT 15`), donc jamais de « non renseigné » sur cette ligne.
 */
describe('#2035.11 — CommercialLoadSettingsView', () => {
  it('lit les trois plafonds en vigueur par la route existante', async () => {
    apiFetch.mockResolvedValue({ maxTrackedAccounts: 40, maxOpenNeeds: 15, weeklyAvailableHours: 32 })
    renderView(<CommercialLoadSettingsView />)

    expect(await screen.findByDisplayValue('40')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('32')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/commercial-load-settings' })
  })

  it('« non renseigné » reste un inconnu NOMMÉ — jamais 0 dossier ni 0 heure', async () => {
    apiFetch.mockResolvedValue({ maxTrackedAccounts: null, maxOpenNeeds: 15, weeklyAvailableHours: null })
    renderView(<CommercialLoadSettingsView />)

    // Deux inconnus nommés : les dossiers suivis et les heures disponibles.
    // Les besoins ouverts ont toujours une valeur, et l'afficher « non
    // renseigné » serait faux.
    expect(await screen.findAllByTitle('non renseigné')).toHaveLength(2)
    expect(screen.queryByDisplayValue('0')).toBeNull()
  })

  // #3245 (reste de #3209.3) — première pièce du budget d'effort réel.
  it('#3209.3 — ENREGISTRER les heures commerciales disponibles envoie PATCH avec ce seul champ', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (!args.method)
        return Promise.resolve({ maxTrackedAccounts: null, maxOpenNeeds: 15, weeklyAvailableHours: null })
      return Promise.resolve({ maxTrackedAccounts: null, maxOpenNeeds: 15, weeklyAvailableHours: 35 })
    })
    renderView(<CommercialLoadSettingsView />)

    const input = await screen.findByLabelText('Heures commerciales disponibles, par semaine')
    await userEvent.setup().type(input, '35')
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Enregistrer' })[1])

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/commercial-load-settings',
        method: 'PATCH',
        body: { weeklyAvailableHours: 35 },
      }),
    )
  })

  // #3289.29 — « préférences utilisateur » de la cadence : un jour imposé, ou aucun.
  it('#3289.29 — choisir un jour envoie PATCH avec ce seul champ ; « aucun jour imposé » envoie null', async () => {
    apiFetch.mockImplementation(
      (args: { path: string; method?: string; body?: { cadenceWeekday?: string | null } }) => {
        if (!args.method)
          return Promise.resolve({ maxTrackedAccounts: null, maxOpenNeeds: 15, cadenceWeekday: 'tuesday' })
        return Promise.resolve({
          maxTrackedAccounts: null,
          maxOpenNeeds: 15,
          cadenceWeekday: args.body?.cadenceWeekday,
        })
      },
    )
    renderView(<CommercialLoadSettingsView />)

    const select = await screen.findByLabelText('Jour des relances')
    expect(select).toHaveTextContent('Mardi')
    await userEvent.setup().click(select)
    await userEvent.setup().click(await screen.findByRole('option', { name: 'Vendredi' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/commercial-load-settings',
        method: 'PATCH',
        body: { cadenceWeekday: 'friday' },
      }),
    )
    await userEvent.setup().click(await screen.findByLabelText('Jour des relances'))
    await userEvent.setup().click(await screen.findByRole('option', { name: 'Aucun jour imposé' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/commercial-load-settings',
        method: 'PATCH',
        body: { cadenceWeekday: null },
      }),
    )
  })

  it('#3289.29 — sans droit d’écriture, le jour imposé se lit mais ne se change pas', async () => {
    mockRole = 'member'
    apiFetch.mockResolvedValue({ maxTrackedAccounts: null, maxOpenNeeds: 15, cadenceWeekday: null })
    renderView(<CommercialLoadSettingsView />)
    expect(await screen.findByLabelText('Jour des relances')).toBeDisabled()
  })

  it('le plafond de besoins ouverts n’est JAMAIS « non renseigné » — il porte le défaut du produit', async () => {
    apiFetch.mockResolvedValue({ maxTrackedAccounts: null, maxOpenNeeds: 15 })
    renderView(<CommercialLoadSettingsView />)

    expect(await screen.findByDisplayValue('15')).toBeInTheDocument()
    expect(screen.getByText(/15 besoins ouverts par commercial/)).toBeInTheDocument()
  })

  it('ENREGISTRER un plafond envoie PATCH avec ce seul champ', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (!args.method) return Promise.resolve({ maxTrackedAccounts: null, maxOpenNeeds: 15 })
      return Promise.resolve({ maxTrackedAccounts: null, maxOpenNeeds: 20 })
    })
    renderView(<CommercialLoadSettingsView />)

    const input = await screen.findByLabelText('Besoins ouverts, au maximum')
    await userEvent.setup().clear(input)
    await userEvent.setup().type(input, '20')
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Enregistrer' })[2])

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/commercial-load-settings',
        method: 'PATCH',
        body: { maxOpenNeeds: 20 },
      }),
    )
  })

  it('SAIT DIRE NON — sans team:manage, les valeurs se lisent mais aucun formulaire n’apparaît', async () => {
    mockRole = 'sales'
    apiFetch.mockResolvedValue({ maxTrackedAccounts: 40, maxOpenNeeds: 15 })
    renderView(<CommercialLoadSettingsView />)

    await screen.findByText(/40/)
    expect(screen.queryByLabelText('Dossiers suivis, au maximum')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })
})
