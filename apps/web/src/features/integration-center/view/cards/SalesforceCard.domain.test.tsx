import type { ConnectedTool } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { clearConnectorFailure, rememberConnectorFailure } from '../../lib/connector-callback-failure'

/**
 * #4431 — la carte Salesforce non branchée : le domaine de l'organisation et la case sandbox, AVANT « Connecter ».
 * La chaîne réelle `SalesforceCard` → `OAuthProviderCard` → `salesforceApi.connectUrl`, sans mock du champ.
 */

const connectUrl = vi.hoisted(() => vi.fn())
const salesforceStatus = vi.hoisted(() => ({ connected: false }))
vi.mock('@/features/salesforce/hooks/useSalesforceStatus', () => ({
  SALESFORCE_STATUS_KEY: ['salesforce-status'],
  useSalesforceStatus: () => ({ data: { configured: true, connected: salesforceStatus.connected }, isLoading: false }),
}))
vi.mock('@/features/salesforce/api', () => ({ salesforceApi: { connectUrl, disconnect: vi.fn() } }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

async function mountCard(state: 'available' | 'connected' | 'action_required' = 'available') {
  const { SalesforceCard } = await import('./connector-cards')
  wrap(<SalesforceCard state={state} tools={[] as ConnectedTool[]} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  salesforceStatus.connected = false
  connectUrl.mockReset()
  connectUrl.mockResolvedValue({ url: 'about:blank#sf' })
  clearConnectorFailure('salesforce')
})

describe('la carte Salesforce — domaine de l’organisation (#4431)', () => {
  it('sans rien saisir : « Connecter » part comme avant, sans domaine', async () => {
    await mountCard()
    fireEvent.click(screen.getByRole('button', { name: /Connecter Salesforce/ }))
    await waitFor(() => expect(connectUrl).toHaveBeenCalledTimes(1))
    expect(connectUrl).toHaveBeenCalledWith({ domain: '', sandbox: false })
  })

  it('transmet le domaine saisi', async () => {
    await mountCard()
    fireEvent.change(screen.getByLabelText(/Domaine de ton organisation Salesforce/), {
      target: { value: 'societe.lightning.force.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connecter Salesforce/ }))
    await waitFor(() =>
      expect(connectUrl).toHaveBeenCalledWith({ domain: 'societe.lightning.force.com', sandbox: false }),
    )
  })

  it('transmet la case sandbox', async () => {
    await mountCard()
    fireEvent.click(screen.getByRole('checkbox', { name: /sandbox/i }))
    fireEvent.click(screen.getByRole('button', { name: /Connecter Salesforce/ }))
    await waitFor(() => expect(connectUrl).toHaveBeenCalledWith({ domain: '', sandbox: true }))
  })

  it('refuse un autre hôte avec un message clair, sans appeler le serveur', async () => {
    await mountCard()
    fireEvent.change(screen.getByLabelText(/Domaine de ton organisation Salesforce/), {
      target: { value: 'evil.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connecter Salesforce/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/salesforce\.com ou force\.com/)
    expect(connectUrl).not.toHaveBeenCalled()
  })

  it('affiche en clair l’erreur rendue par Salesforce au retour — fr puis en', async () => {
    await mountCard()
    act(() => rememberConnectorFailure('salesforce', 'redirect_uri_mismatch'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Salesforce a répondu.*redirect_uri_mismatch/)
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    expect(screen.getByRole('alert').textContent).toMatch(/Salesforce replied.*redirect_uri_mismatch/)
  })
})

describe('la carte Salesforce EXPIRÉE — le domaine reste modifiable à la reconnexion (#4431.2)', () => {
  it('montre le domaine et la case sandbox, sans lancer l’OAuth avant « Reconnecter »', async () => {
    salesforceStatus.connected = true
    await mountCard('action_required')
    const field = screen.getByLabelText(/Domaine de ton organisation Salesforce/)
    expect(screen.getByRole('checkbox', { name: /sandbox/i })).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'societe.lightning.force.com' } })
    expect(connectUrl).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Reconnecter/i }))
    await waitFor(() =>
      expect(connectUrl).toHaveBeenCalledWith({ domain: 'societe.lightning.force.com', sandbox: false }),
    )
  })

  it('branchée et saine : le champ ne s’affiche pas (il n’a de sens qu’à la (re)connexion)', async () => {
    salesforceStatus.connected = true
    await mountCard('connected')
    expect(screen.queryByLabelText(/Domaine de ton organisation Salesforce/)).not.toBeInTheDocument()
  })
})
