import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPROVAL_THRESHOLD_UNBOUNDED, type ApprovalSettingsView } from '@bellum/contracts'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' }, loading: false }) }))

const { ApprovalSettingsCard } = await import('./ApprovalSettingsCard')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const DEFAULTS: ApprovalSettingsView = {
  defaultLevel: 'n2_user_approval',
  bulkThreshold: 10,
  spendThreshold: 20,
  customised: [],
  canEdit: true,
}

function serve(view: ApprovalSettingsView) {
  apiFetch.mockImplementation((args: { method?: string; body?: Partial<ApprovalSettingsView> }) =>
    Promise.resolve(args.method === 'PUT' ? { ...view, ...args.body } : view),
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

// #4016 L6 — Action OS N4/N5 autonome, seuils réglables jusqu'à « sans plafond » par l'admin.
describe('#4016 L6 — ApprovalSettingsCard', () => {
  it('lit les réglages de l’espace et DIT ce qu’aucun niveau ne lève', async () => {
    serve(DEFAULTS)
    renderView(<ApprovalSettingsCard />)

    expect(await screen.findByRole('radio', { name: /^Un clic de l’auteur/ })).toBeChecked()
    expect(screen.getByLabelText('Cibles par exécution')).toHaveValue(10)
    // #4463 — aucun seuil en crédits à l'écran : le champ n'existe plus (le plafond reste côté serveur).
    expect(screen.queryByLabelText(/crédit/i)).toBeNull()
    expect(screen.getByText(/n’envoie un e-mail ni n’écrit dans ton CRM sans ton go/)).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/action-os/approval-settings' })
  })

  it('un admin passe l’espace en autonomie étendue (N5)', async () => {
    serve(DEFAULTS)
    renderView(<ApprovalSettingsCard />)

    await userEvent.click(await screen.findByRole('radio', { name: /^Autonomie étendue/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/action-os/approval-settings',
        method: 'PUT',
        body: { defaultLevel: 'n5_extended_auto' },
      }),
    )
  })

  it('« Sans plafond » enregistre la valeur la plus haute, jamais 0 ni un trou', async () => {
    serve(DEFAULTS)
    renderView(<ApprovalSettingsCard />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /Sans plafond — cibles/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les seuils' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/action-os/approval-settings',
        method: 'PUT',
        body: { bulkThreshold: APPROVAL_THRESHOLD_UNBOUNDED, spendThreshold: 20 },
      }),
    )
  })

  it('un seuil de dépense « sans plafond » n’affiche ni case ni nombre de crédits', async () => {
    serve({ ...DEFAULTS, spendThreshold: APPROVAL_THRESHOLD_UNBOUNDED })
    renderView(<ApprovalSettingsCard />)

    // #4463 — le seuil en crédits n'a plus de contrôle à l'écran : ni case « sans plafond — crédits », ni nombre.
    expect(await screen.findByRole('checkbox', { name: /Sans plafond — cibles/ })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /crédit/i })).toBeNull()
    expect(screen.queryByDisplayValue(String(APPROVAL_THRESHOLD_UNBOUNDED))).toBeNull()
  })

  it('SAIT DIRE NON — un membre sans droit lit, mais ne règle rien', async () => {
    serve({ ...DEFAULTS, canEdit: false })
    renderView(<ApprovalSettingsCard />)

    expect(await screen.findByRole('radio', { name: /^Autonomie étendue/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Enregistrer les seuils' })).toBeNull()
    expect(screen.getByText(/Seul un responsable de l’espace/)).toBeInTheDocument()
  })
})
