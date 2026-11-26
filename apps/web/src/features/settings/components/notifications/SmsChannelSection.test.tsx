import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { smsChannelWithoutNumber, type SmsChannelSettings } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const { SmsChannelSection } = await import('./SmsChannelSection')

const apiFetchMock = vi.mocked(apiFetch)

type Call = { path: string; method?: string; body?: unknown }

// #4463 — l'alerte « crédits bientôt épuisés » n'est plus proposée par SMS (aucun crédit visible côté client).
const TYPE_SWITCHES = ["Signaux d'achat par SMS", 'Actions en retard par SMS']

function verified(overrides: Partial<SmsChannelSettings> = {}): SmsChannelSettings {
  return {
    ...smsChannelWithoutNumber('ready'),
    phone: '+33612345678',
    verified_at: '2026-09-13T08:00:00.000Z',
    ...overrides,
  }
}

/** Le serveur, route par route. `writes` garde tout ce qui n'est pas une lecture. */
function serve(settings: SmsChannelSettings | Record<string, unknown>, onWrite?: (call: Call) => unknown) {
  const writes: Call[] = []
  apiFetchMock.mockImplementation(async (call: Call) => {
    if ((call.method ?? 'GET') === 'GET') return settings
    writes.push(call)
    return onWrite ? onWrite(call) : settings
  })
  return writes
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <SmsChannelSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('SmsChannelSection — #1938.4, visible mais inactive tant qu’aucun fournisseur n’est branché', () => {
  it('sans fournisseur : annoncée « Bientôt disponible », rien ne se coche, rien ne se saisit, rien ne part', async () => {
    const writes = serve(smsChannelWithoutNumber('coming_soon'))
    renderSection()

    // Le titre s'affiche dès le chargement ; l'état, lui, vient du serveur.
    expect(screen.getByText('Alertes urgentes par SMS')).toBeInTheDocument()
    expect(await screen.findByText('Bientôt disponible')).toBeInTheDocument()
    expect(screen.getByText(/pas encore branché/)).toBeInTheDocument()
    for (const name of TYPE_SWITCHES) {
      const toggle = screen.getByRole('switch', { name })
      expect(toggle).not.toBeChecked()
      expect(toggle).toBeDisabled()
    }
    expect(screen.getByLabelText('Ton numéro de mobile')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Recevoir un code' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retirer mon numéro' })).not.toBeInTheDocument()
    expect(writes).toEqual([])
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/notifications/sms' })
  })

  it('en démonstration : « Inactif en démonstration », et le même silence', async () => {
    const writes = serve(smsChannelWithoutNumber('demo'))
    renderSection()

    expect(await screen.findByText('Inactif en démonstration')).toBeInTheDocument()
    for (const name of TYPE_SWITCHES) expect(screen.getByRole('switch', { name })).toBeDisabled()
    expect(screen.getByLabelText('Ton numéro de mobile')).toBeDisabled()
    expect(writes).toEqual([])
  })

  it('un réglage illisible le DIT — il ne se lit pas comme un canal vide', async () => {
    serve({ buy_signals: true })
    renderSection()
    expect(await screen.findByText(/pas pu lire ce réglage/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('SmsChannelSection — le consentement, quand le canal est prêt', () => {
  it('un numéro saisi avec des espaces demande un code, et le corps ne porte QUE le numéro', async () => {
    const user = userEvent.setup()
    const writes = serve(smsChannelWithoutNumber('ready'), () => ({
      ...smsChannelWithoutNumber('ready'),
      phone: '+33612345678',
      verification_pending: true,
    }))
    renderSection()

    await user.type(await screen.findByLabelText('Ton numéro de mobile'), '+33 6 12 34 56 78')
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }))

    await waitFor(() =>
      expect(writes).toEqual([
        { path: '/notifications/sms/verification', method: 'POST', body: { phone: '+33612345678' } },
      ]),
    )
    expect(await screen.findByLabelText('Code reçu par SMS')).toBeInTheDocument()
  })

  it('un numéro hors format international ne part pas, et la raison s’affiche', async () => {
    const user = userEvent.setup()
    const writes = serve(smsChannelWithoutNumber('ready'))
    renderSection()

    await user.type(await screen.findByLabelText('Ton numéro de mobile'), '0612345678')
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/format international/)
    expect(writes).toEqual([])
  })

  it('un code en attente se saisit et se valide', async () => {
    const user = userEvent.setup()
    const writes = serve(
      { ...smsChannelWithoutNumber('ready'), phone: '+33612345678', verification_pending: true },
      () => verified(),
    )
    renderSection()

    await user.type(await screen.findByLabelText('Code reçu par SMS'), '042917')
    await user.click(screen.getByRole('button', { name: 'Valider le code' }))

    await waitFor(() =>
      expect(writes).toEqual([
        { path: '/notifications/sms/verification/confirm', method: 'POST', body: { code: '042917' } },
      ]),
    )
    expect(await screen.findByText(/Numéro vérifié/)).toBeInTheDocument()
  })

  it('sans numéro vérifié, aucune alerte ne se coche — même quand le canal est prêt', async () => {
    serve(smsChannelWithoutNumber('ready'))
    renderSection()
    for (const name of TYPE_SWITCHES) expect(await screen.findByRole('switch', { name })).toBeDisabled()
  })

  it('numéro vérifié : cocher une alerte l’écrit, elle seule — rien n’est coché par défaut', async () => {
    const user = userEvent.setup()
    const writes = serve(verified(), () =>
      verified({ types: { buy_signal: false, credit_low: false, action_overdue: true } }),
    )
    renderSection()

    for (const name of TYPE_SWITCHES) expect(await screen.findByRole('switch', { name })).not.toBeChecked()
    // Et AUCUN interrupteur de crédit n'existe, coché ou non.
    expect(screen.queryByRole('switch', { name: /crédit/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Actions en retard par SMS' }))

    await waitFor(() =>
      expect(writes).toEqual([{ path: '/notifications/sms', method: 'PATCH', body: { action_overdue: true } }]),
    )
  })

  it('en pause, une alerte cochée se décoche encore — un retrait ne dépend jamais du fournisseur', async () => {
    const user = userEvent.setup()
    const writes = serve(
      verified({
        status: 'paused',
        consent_at: '2026-09-13T08:05:00.000Z',
        types: { buy_signal: true, credit_low: false, action_overdue: false },
      }),
    )
    renderSection()

    const toggle = await screen.findByRole('switch', { name: "Signaux d'achat par SMS" })
    expect(screen.getByText('En pause')).toBeInTheDocument()
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Actions en retard par SMS' })).toBeDisabled()
    await user.click(toggle)

    await waitFor(() =>
      expect(writes).toEqual([{ path: '/notifications/sms', method: 'PATCH', body: { buy_signal: false } }]),
    )
  })

  it('« Retirer mon numéro » retire tout, en un clic', async () => {
    const user = userEvent.setup()
    const writes = serve(
      verified({ types: { buy_signal: true, credit_low: true, action_overdue: false } }),
      () => undefined,
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: 'Retirer mon numéro' }))

    await waitFor(() => expect(writes).toEqual([{ path: '/notifications/sms', method: 'DELETE' }]))
    await waitFor(() => expect(screen.queryByText(/Numéro vérifié/)).not.toBeInTheDocument())
    for (const name of TYPE_SWITCHES) expect(screen.getByRole('switch', { name })).not.toBeChecked()
  })
})
