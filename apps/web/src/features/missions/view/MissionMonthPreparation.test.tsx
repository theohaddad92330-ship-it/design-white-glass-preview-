import type { InvoiceMonthPreparation } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
const role = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: role() } } }),
}))

const { MissionMonthPreparation } = await import('./MissionMonthPreparation')

const MISSION = '11111111-1111-4111-8111-111111111111'

function preparation(over: Partial<InvoiceMonthPreparation> = {}): InvoiceMonthPreparation {
  return {
    missionId: MISSION,
    missionLabel: 'Renfort plateforme',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountName: 'ACME',
    legalEntityName: null,
    readinessState: 'blocked',
    periodMonth: '2026-09-01',
    previous: { periodMonth: '2026-08-01', days: 18, invoiceReference: 'FA-0042' },
    dailyRateCents: 65_000,
    days: null,
    daysSource: null,
    amountCents: null,
    poNumber: 'BC-1',
    poNumberOverridden: false,
    poCheck: { alerts: [], remainingDays: null, remainingAfterDays: null, validFrom: null, validUntil: null },
    prepared: false,
    preparedAt: null,
    invoiced: false,
    autoPrepare: false,
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MissionMonthPreparation missionId={MISSION} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  role.mockReturnValue('admin')
})
afterEach(() => {
  cleanup()
  apiFetch.mockReset()
})

describe('MissionMonthPreparation (#2563, #2566, #2567)', () => {
  it('reconduit le mois précédent et propose de saisir les jours quand il n’y a pas de CRA', async () => {
    apiFetch.mockResolvedValue(preparation())
    renderPanel()
    expect(await screen.findByText(/Reconduite de/)).toBeInTheDocument()
    // R3b-3 — placeholder COURT et champ assez large (≥ 10rem) pour ne pas être tronqué.
    const field = screen.getByLabelText('Jours à facturer')
    expect(field).toHaveAttribute('placeholder', 'préc. : 18 j')
    expect(field).toHaveClass('w-40')
    expect(field).not.toHaveClass('max-w-[120px]')
  })

  it('nomme « Jours saisis, sans CRA » quand les jours viennent d’une saisie', async () => {
    apiFetch.mockResolvedValue(preparation({ days: 19, daysSource: 'manual', amountCents: 19 * 65_000 }))
    renderPanel()
    expect(await screen.findByText('Jours saisis, sans CRA')).toBeInTheDocument()
  })

  it('jours issus du CRA : non modifiables à la main', async () => {
    apiFetch.mockResolvedValue(preparation({ days: 20, daysSource: 'cra', amountCents: 20 * 65_000 }))
    renderPanel()
    expect(await screen.findByText(/20 j \(relevé CRA\)/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Jours à facturer')).toBeNull()
  })

  it('affiche les alertes du bon de commande et le reste à consommer, sans empêcher de préparer', async () => {
    apiFetch.mockResolvedValue(
      preparation({
        days: 20,
        daysSource: 'cra',
        poCheck: {
          alerts: ['po_volume_exceeded', 'po_ends_mid_period'],
          remainingDays: 10,
          remainingAfterDays: -10,
          validFrom: null,
          validUntil: '2026-09-15',
        },
      }),
    )
    renderPanel()
    expect(await screen.findByText(/dépassent le volume du bon de commande de 10 j/)).toBeInTheDocument()
    expect(screen.getByText(/s’arrête le 2026-09-15/)).toBeInTheDocument()
    expect(screen.getByText(/Reste à consommer : 10 j/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Préparer la facture de/ })).toBeEnabled()
  })

  it('un reste inconnu ne s’affiche jamais « 0 j »', async () => {
    apiFetch.mockResolvedValue(preparation())
    renderPanel()
    await screen.findByText(/Reconduite de/)
    expect(screen.queryByText(/Reste à consommer/)).toBeNull()
  })

  it('préparer envoie les jours saisis et le N° de BC, et dit « pas encore créée ni envoyée »', async () => {
    const user = userEvent.setup()
    let saved = false
    const after = preparation({ days: 19, daysSource: 'manual', prepared: true, preparedAt: '2026-10-07T08:00:00Z' })
    apiFetch.mockImplementation(async (options: { method?: string }) => {
      if (options.method === 'PUT') saved = true
      return saved ? after : preparation()
    })
    renderPanel()
    const days = await screen.findByLabelText('Jours à facturer')
    await user.type(days, '19')
    await user.click(screen.getByRole('button', { name: /Préparer la facture de/ }))
    await waitFor(() => expect(screen.getByText('Préparée — pas encore créée ni envoyée')).toBeInTheDocument())
    const put = apiFetch.mock.calls.map(call => call[0]).find((o: { method?: string }) => o.method === 'PUT')
    expect(put.body).toEqual({ days: 19 })
  })

  it('un rôle sans droit d’écriture ne voit pas le geste mais lit la raison', async () => {
    role.mockReturnValue('viewer')
    apiFetch.mockResolvedValue(preparation())
    renderPanel()
    expect(await screen.findByText(/droit d’écriture sur la finance/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Préparer la facture de/ })).toBeNull()
  })

  it('un mois déjà facturé ne se prépare plus', async () => {
    apiFetch.mockResolvedValue(preparation({ invoiced: true }))
    renderPanel()
    expect(await screen.findByText(/déjà déclaré facturé/)).toBeInTheDocument()
  })
})
