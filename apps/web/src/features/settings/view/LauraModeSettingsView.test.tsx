import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLauraDefaultDepthStore } from '@/features/chat/laura-default-depth-store'
import { researchModeFor } from '@/features/chat/researchModeStore'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

const { LauraModeSettingsView } = await import('./LauraModeSettingsView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE.
 *
 * ⚠️ Ce n'est PAS une règle d'espace (#2081.14) — écran séparé, route séparée
 * (`GET`/`PATCH /workspaces/laura-mode`), jamais ajouté à Réglages › Règles.
 */
describe('#2451.9 — LauraModeSettingsView', () => {
  it('lit le mode réglé par la route de l’espace', async () => {
    apiFetch.mockResolvedValue({ defaultContextMode: 'neutral', canEdit: true })
    renderView(<LauraModeSettingsView />)

    expect(await screen.findByRole('radio', { name: /Neutre/ })).toBeChecked()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/laura-mode' })
  })

  it('l’administrateur change le mode par défaut : la route reçoit le nouveau mode', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) =>
      Promise.resolve(
        args.method === 'PATCH'
          ? { defaultContextMode: 'one_off_mission', canEdit: true }
          : { defaultContextMode: 'my_activity', canEdit: true },
      ),
    )
    renderView(<LauraModeSettingsView />)

    await userEvent.click(await screen.findByRole('radio', { name: /Mission ponctuelle/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/laura-mode',
        method: 'PATCH',
        body: { defaultContextMode: 'one_off_mission' },
      }),
    )
  })

  it('NON : un membre non administrateur LIT le réglage mais ne peut pas le changer', async () => {
    apiFetch.mockResolvedValue({ defaultContextMode: 'my_activity', canEdit: false })
    renderView(<LauraModeSettingsView />)

    // Seul le MODE de l'espace est réservé à l'administrateur ; la profondeur par défaut est personnelle.
    const modeGroup = await screen.findByRole('radiogroup', { name: /Mode par défaut d’une conversation neuve/ })
    for (const radio of within(modeGroup).getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(screen.getByText(/Seul un administrateur de l’espace peut changer ce réglage/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Mission ponctuelle/ }))
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
  })
})

/**
 * Maquette `settings-laura` (Théo V22, Louis 22/10/2026) — la PROFONDEUR par défaut (N1) et la matrice des
 * autorisations (N2), en lecture.
 */
describe('Réglages › Laura › Comportement — profondeur et autorisations', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useLauraDefaultDepthStore.setState({ depth: 'auto' })
    apiFetch.mockResolvedValue({ defaultContextMode: 'my_activity', canEdit: false })
  })

  it('la profondeur part sur Auto et se règle sans être administrateur', async () => {
    renderView(<LauraModeSettingsView />)
    const group = await screen.findByRole('radiogroup', { name: 'Profondeur par défaut' })
    expect(within(group).getByRole('radio', { name: /Auto/ })).toBeChecked()

    await userEvent.click(within(group).getByRole('radio', { name: /Approfondi/ }))

    expect(useLauraDefaultDepthStore.getState().depth).toBe('approfondi')
    expect(within(group).getByRole('radio', { name: /Approfondi/ })).toBeChecked()
  })

  it('un fil neuf lit la profondeur par défaut, un fil déjà réglé la sienne', () => {
    useLauraDefaultDepthStore.setState({ depth: 'rapide' })
    expect(researchModeFor({}, 'fil-neuf')).toBe('rapide')
    expect(researchModeFor({ 'fil-regle': 'verifie' }, 'fil-regle')).toBe('verifie')
  })

  it('annonce que le coût de l’approfondi s’affiche avant chaque recherche, sans le chiffrer', async () => {
    renderView(<LauraModeSettingsView />)
    expect(await screen.findByText(/Le coût est annoncé avant chaque recherche/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('montre la matrice : Laura prépare, tu envoies — en lecture, sans interrupteur', async () => {
    renderView(<LauraModeSettingsView />)
    expect(await screen.findByText('Recherche et préparation')).toBeInTheDocument()
    expect(screen.getByText('Envois et écritures externes')).toBeInTheDocument()
    expect(screen.getByText('Validation requise')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir la mémoire' })).toHaveAttribute('href', '/settings/memory')
  })
})
