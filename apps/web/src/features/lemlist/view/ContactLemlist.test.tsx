import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4427.2 / #4427.3 — le panneau Lemlist de la fiche contact. Laura prépare,
 * la personne CHOISIT la campagne et clique ; rien ne part seul. Les statuts
 * relus ne montrent que ce que l'API expose.
 */
const state = vi.hoisted(() => ({
  connected: true,
  leads: [] as unknown[],
  campaignsEnabled: false,
  push: vi.fn(),
}))
vi.mock('@/features/lemlist/api', () => ({
  useLemlistStatus: () => ({ data: { connected: state.connected, connectedAt: null } }),
  useLemlistCampaigns: (enabled: boolean) => {
    state.campaignsEnabled = enabled
    return { data: enabled ? [{ id: 'cam_1', name: 'Relance DSI', status: 'running' }] : undefined, isLoading: false }
  },
  usePushToLemlist: () => ({ mutateAsync: state.push, isPending: false }),
  useLemlistContactLeads: () => ({ data: state.leads, isLoading: false }),
}))

const { ContactLemlist } = await import('./ContactLemlist')

describe('ContactLemlist (#4427)', () => {
  beforeEach(() => {
    state.connected = true
    state.leads = []
    state.campaignsEnabled = false
    state.push.mockReset()
  })

  it('sans Lemlist branché : AUCUNE ligne', () => {
    state.connected = false
    const { container } = render(<ContactLemlist contactId="ct-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('#4427.2 — rien ne part sans geste : les campagnes ne se lisent qu’à l’ouverture, l’ajout qu’au clic', async () => {
    state.push.mockResolvedValueOnce({
      outcome: 'pushed',
      campaignId: 'cam_1',
      campaignName: 'Relance DSI',
      leadId: 'l',
    })
    render(<ContactLemlist contactId="ct-1" />)
    expect(state.campaignsEnabled).toBe(false)
    expect(state.push).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter à une campagne de prospection/i }))
    expect(state.campaignsEnabled).toBe(true)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Relance DSI/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Ajouter$/i }))
    expect(state.push).toHaveBeenCalledWith('cam_1')
  })

  it('#4427.3 — affiche les statuts exposés, et nomme une relecture en échec', () => {
    state.leads = [
      {
        campaignId: 'cam_1',
        campaignName: 'Relance DSI',
        pushedAt: '2026-10-01T08:00:00.000Z',
        statuses: [
          { status: 'sent', at: '2026-10-02T08:00:00.000Z' },
          { status: 'replied', at: '2026-10-04T08:00:00.000Z' },
        ],
      },
      { campaignId: 'cam_2', campaignName: null, pushedAt: '2026-10-01T08:00:00.000Z', statuses: null },
    ]
    render(<ContactLemlist contactId="ct-1" />)
    expect(screen.getByText('Relance DSI')).toBeInTheDocument()
    expect(screen.getByText(/Envoyé/)).toBeInTheDocument()
    expect(screen.getByText(/Répondu/)).toBeInTheDocument()
    expect(screen.queryByText(/Ouvert/)).not.toBeInTheDocument()
    expect(screen.getByText('cam_2')).toBeInTheDocument()
    expect(screen.getByText(/statuts n’ont pas pu être relus/i)).toBeInTheDocument()
  })

  it('#4427.3 — une relecture en échec rend le DERNIER statut gardé, daté et dit périmé', () => {
    state.leads = [
      {
        campaignId: 'cam_1',
        campaignName: 'Relance DSI',
        pushedAt: '2026-10-01T08:00:00.000Z',
        statuses: [{ status: 'replied', at: '2026-10-04T08:00:00.000Z' }],
        statusesReadAt: '2026-10-06T09:00:00.000Z',
        statusesStale: true,
      },
    ]
    render(<ContactLemlist contactId="ct-1" />)
    expect(screen.getByText(/Répondu/)).toBeInTheDocument()
    expect(screen.getByTestId('lemlist-statuses-stale')).toHaveTextContent(/Dernier statut gardé/)
  })
})
