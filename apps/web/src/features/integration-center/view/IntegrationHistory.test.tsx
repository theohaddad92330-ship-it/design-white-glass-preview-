import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntegrationSyncRun } from '@bellum/contracts'
import { i18n } from '@/i18n'
import type { ConnectorView } from '../lib/connectors'

const latestSyncRun = vi.fn()
vi.mock('../api', () => ({ integrationCenterApi: { latestSyncRun: (...args: unknown[]) => latestSyncRun(...args) } }))

const { IntegrationHistory } = await import('./IntegrationHistory')
const { renderWithRouter, resetTestQueryClient } = await import('@/test-utils/renderWithRouter')

const connector = (id: string, displayName: string, state: ConnectorView['state']): ConnectorView =>
  ({ id, family: 'crm', displayName, registryProviders: [id], state, tools: [] }) as unknown as ConnectorView

const run = (over: Partial<IntegrationSyncRun> = {}): IntegrationSyncRun => ({
  id: 'run-1',
  provider: 'hubspot',
  status: 'completed',
  started_at: '2026-10-22T08:40:00.000Z',
  finished_at: '2026-10-22T08:41:00.000Z',
  summary: [{ domain: 'accounts', count: 38, label: { fr: '38 comptes rapprochés', en: '38 accounts matched' } }],
  error: null,
  ...over,
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  latestSyncRun.mockReset()
  // Le client de test est un singleton : sans ceci, la lecture du test précédent reste en cache (staleTime 60 s).
  resetTestQueryClient()
})

describe('IntegrationHistory — l’onglet « Historique » des intégrations', () => {
  it('liste la dernière synchronisation de chaque outil branché : date, outil, opération, résultat', async () => {
    latestSyncRun.mockResolvedValue(run())
    renderWithRouter(<IntegrationHistory connectors={[connector('hubspot', 'HubSpot', 'connected')]} />)

    const table = await screen.findByRole('table')
    expect(table).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Date',
      'Outil',
      'Opération',
      'Résultat',
    ])
    expect(screen.getByText('HubSpot')).toBeInTheDocument()
    expect(screen.getByText('38 comptes rapprochés')).toBeInTheDocument()
    expect(latestSyncRun).toHaveBeenCalledWith('hubspot')
  })

  it('un outil qui n’a jamais synchronisé ne fait AUCUNE ligne — et la page le dit', async () => {
    latestSyncRun.mockResolvedValue(null)
    renderWithRouter(<IntegrationHistory connectors={[connector('hubspot', 'HubSpot', 'connected')]} />)
    await waitFor(() => expect(screen.getByText(/Aucune synchronisation n’a encore été lancée/)).toBeInTheDocument())
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('un outil non branché n’est jamais interrogé', async () => {
    renderWithRouter(<IntegrationHistory connectors={[connector('zoho', 'Zoho CRM', 'available')]} />)
    expect(await screen.findByText(/Aucun outil branché/)).toBeInTheDocument()
    expect(latestSyncRun).not.toHaveBeenCalled()
  })

  it('un échec est dit avec sa raison, jamais « Fait »', async () => {
    latestSyncRun.mockResolvedValue(
      run({ status: 'failed', summary: null, error: { fr: 'Autorisation expirée', en: 'Authorisation expired' } }),
    )
    renderWithRouter(<IntegrationHistory connectors={[connector('hubspot', 'HubSpot', 'action_required')]} />)
    expect(await screen.findByText('Autorisation expirée')).toBeInTheDocument()
  })
})
