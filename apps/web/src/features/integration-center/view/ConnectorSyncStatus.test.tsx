import type { ConnectedTool } from '@bellum/contracts'
import { apiFetch, ApiError } from '@/lib/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime } from '@/lib/locale'
import { ConnectorSyncStatus } from './ConnectorSyncStatus'

/**
 * #3014 — recette du 25/09/2026 : `useLatestSyncRun` et `<SyncSummary>`
 * existaient déjà, testés, sans AUCUN appelant. Ce fichier prouve que
 * `ConnectorSyncStatus` — le nouvel appelant — choisit la bonne réponse selon
 * ce que le registre et le dernier run savent, jamais un résumé inventé.
 */

const mockedApiFetch = vi.mocked(apiFetch)

/** `latestSyncRun()` (`../api.ts`) traduit un 404 en `null` — « aucun run
 *  jamais lancé » — donc c'est ce que le double doit rendre pour ce cas. */
function mockLatestRun(run: unknown) {
  mockedApiFetch.mockImplementation(async (args: unknown) => {
    const { path } = args as { path: string }
    if (path.endsWith('/sync-runs/latest')) {
      if (run === null) throw new ApiError('sync_run_not_found', 404)
      return run
    }
    return {}
  })
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function baseTool(overrides: Partial<ConnectedTool> = {}): ConnectedTool {
  const tool = {
    provider: 'odoo',
    family: 'crm',
    display_name: 'Odoo',
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
    capability_state: 'operational',
    capabilities: [],
    ...overrides,
  }
  return tool as unknown as ConnectedTool
}

describe('ConnectorSyncStatus — le geste et le résumé, au bon endroit (#3014)', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset()
  })

  // #recette-21-10-K2 — Odoo : autorisation à refaire, la dernière synchro RÉUSSIE reste lisible.
  it('⚠️ action_required : le bloc « Dernière synchronisation » reste, daté, sans geste de synchro', () => {
    mockLatestRun(null)
    wrap(
      <ConnectorSyncStatus
        provider="odoo"
        name="Odoo"
        tools={[baseTool({ status: 'action_required', last_sync: '2026-09-01T10:00:00.000Z' })]}
      />,
    )
    expect(screen.getByText('Dernière synchronisation')).toBeInTheDocument()
    expect(screen.getByTestId('connector-last-sync-at')).toHaveTextContent(
      formatDateTime(new Date('2026-09-01T10:00:00.000Z')) ?? '',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/à l’instant/)).not.toBeInTheDocument()
  })

  it('action_required sans synchro réussie connue : rien (jamais une date inventée)', () => {
    mockLatestRun(null)
    const { container } = wrap(
      <ConnectorSyncStatus provider="odoo" name="Odoo" tools={[baseTool({ status: 'action_required' })]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien pour un connecteur non branché', () => {
    mockLatestRun(null)
    const { container } = wrap(
      <ConnectorSyncStatus provider="odoo" name="Odoo" tools={[baseTool({ status: 'available' })]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('un connecteur branché mais JAMAIS synchronisé propose le geste, jamais un résumé inventé', async () => {
    mockLatestRun(null)
    wrap(<ConnectorSyncStatus provider="odoo" name="Odoo" tools={[baseTool({ last_sync: null })]} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Synchroniser et comprendre mes données' })).toBeInTheDocument(),
    )
    expect(screen.queryByText(/Résumé disponible/)).not.toBeInTheDocument()
  })

  it('K.5 — un CRM jamais repris n’affiche pas de « Dernière synchronisation » même si un run est clos', async () => {
    mockedApiFetch.mockImplementation(async (args: unknown) => {
      const { path } = args as { path: string }
      if (path.endsWith('/sync-runs/latest')) return { id: 'r1', status: 'completed', summary: [] }
      if (path.endsWith('/crm/import/status')) return { items: [{ provider: 'salesforce', lastSyncAt: null }] }
      return {}
    })
    wrap(
      <ConnectorSyncStatus
        provider="salesforce"
        name="Salesforce"
        tools={[baseTool({ provider: 'salesforce', last_sync: '2026-10-18T00:00:00.000Z' })]}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /ynchronis/ })).toBeInTheDocument())
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/import/status' })),
    )
    expect(screen.queryByText('Dernière synchronisation')).not.toBeInTheDocument()
  })

  it('#3014 (26/09) — un connecteur connecté AVEC une sync passée rend TOUJOURS le geste, libellé « Resynchroniser »', async () => {
    mockLatestRun(null)
    wrap(
      <ConnectorSyncStatus
        provider="hubspot"
        name="HubSpot"
        tools={[baseTool({ provider: 'hubspot', last_sync: '2026-01-01T00:00:00.000Z' })]}
      />,
    )

    await waitFor(() =>
      expect(
        screen.getByText(
          'Résumé disponible à la prochaine synchronisation — cette connexion a été synchronisée avant que ce résumé n’existe.',
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Resynchroniser' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Synchroniser et comprendre mes données' })).not.toBeInTheDocument()
    // Rien à reporter sur un geste qui reste toujours là (#3014) : pas de « Plus tard ».
    expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
  })

  it('un run déjà complété affiche le résumé réel, ET le geste (libellé « Resynchroniser »)', async () => {
    mockLatestRun({
      id: 'run-1',
      provider: 'hubspot',
      status: 'completed',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:02:00.000Z',
      summary: [{ domain: 'contacts', count: 5, label: { fr: '5 contacts retrouvés', en: '5 contacts found' } }],
      error: null,
    })
    wrap(
      <ConnectorSyncStatus
        provider="hubspot"
        name="HubSpot"
        tools={[baseTool({ provider: 'hubspot', last_sync: '2026-09-20T00:00:00.000Z' })]}
      />,
    )

    await waitFor(() => expect(screen.getByText(/5 contacts retrouvés/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Resynchroniser' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Synchroniser et comprendre mes données' })).not.toBeInTheDocument()
  })

  it('cliquer sur le geste ouvre la prévisualisation avant de lancer quoi que ce soit', async () => {
    mockLatestRun(null)
    wrap(<ConnectorSyncStatus provider="odoo" name="Odoo" tools={[baseTool({ last_sync: null })]} />)

    const launchButton = await screen.findByRole('button', { name: 'Synchroniser et comprendre mes données' })
    launchButton.click()

    expect(await screen.findByText('Avant de synchroniser Odoo')).toBeInTheDocument()
    expect(mockedApiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
  })
})

describe('V4-CORRECTIFS 4290.2 — le bloc « Dernière synchronisation » porte la date absolue, sur tout CRM branché', () => {
  const LAST = '2026-10-19T08:30:00.000Z'

  beforeEach(() => {
    mockedApiFetch.mockReset()
  })

  it('Salesforce sans résumé de run : bloc « Dernière synchronisation » + date absolue (parité HubSpot)', async () => {
    mockLatestRun(null)
    wrap(
      <ConnectorSyncStatus
        provider="salesforce"
        name="Salesforce"
        tools={[baseTool({ provider: 'salesforce', last_sync: LAST })]}
      />,
    )
    await waitFor(() => expect(screen.getByText('Dernière synchronisation')).toBeInTheDocument())
    expect(screen.getByTestId('connector-last-sync-at')).toHaveTextContent(formatDateTime(new Date(LAST)) ?? '')
  })

  it('un run clos porte la même date, dans le MÊME bloc (une seule source)', async () => {
    mockLatestRun({ id: 'r1', status: 'completed', summary: [] })
    wrap(
      <ConnectorSyncStatus
        provider="hubspot"
        name="HubSpot"
        tools={[baseTool({ provider: 'hubspot', last_sync: LAST })]}
      />,
    )
    await waitFor(() => expect(screen.getAllByText('Dernière synchronisation')).toHaveLength(1))
    expect(screen.getAllByTestId('connector-last-sync-at')).toHaveLength(1)
  })

  it('sait dire NON : sans synchro connue, ni bloc, ni date, ni « Jamais vérifié » inventé', async () => {
    mockLatestRun(null)
    wrap(
      <ConnectorSyncStatus
        provider="salesforce"
        name="Salesforce"
        tools={[baseTool({ provider: 'salesforce', last_sync: null })]}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /ynchronis/ })).toBeInTheDocument())
    expect(screen.queryByText('Dernière synchronisation')).not.toBeInTheDocument()
    expect(screen.queryByTestId('connector-last-sync-at')).not.toBeInTheDocument()
    expect(screen.queryByText(/Jamais vérifié/)).not.toBeInTheDocument()
  })

  // #4290.16 — la carte portait deux dates (« Synchronisé il y a 13 min » de la note CRM, « Dernière synchro 19/10 »
  // du registre). Quand le serveur rend le statut du CRM, c'est LUI qui porte la date : ce bloc n'en redit pas une autre.
  it('#4290.16 — un CRM dont le serveur rend le statut ne montre pas une seconde date (celle du registre)', async () => {
    mockedApiFetch.mockImplementation(async (args: unknown) => {
      const { path } = args as { path: string }
      if (path.endsWith('/sync-runs/latest')) return { id: 'r1', status: 'completed', summary: [] }
      if (path.includes('/crm/import/status'))
        return { items: [{ provider: 'pipedrive', lastSyncAt: '2026-10-21T10:00:00.000Z' }] }
      return {}
    })
    wrap(
      <ConnectorSyncStatus
        provider="pipedrive"
        name="Pipedrive"
        tools={[baseTool({ provider: 'pipedrive', last_sync: '2026-10-19T08:30:00.000Z' })]}
      />,
    )
    await waitFor(() => expect(screen.getByText('Dernière synchronisation')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByTestId('connector-last-sync-at')).not.toBeInTheDocument())
  })
})
