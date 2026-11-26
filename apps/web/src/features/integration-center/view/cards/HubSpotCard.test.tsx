import type { ConnectedTool } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2261.8 / #2261.16 — le manifeste (période couverte, feature bêta) est
 * VÉRIFIÉ jusque dans `ConnectorDiagnostics` (`ConnectorDiagnostics.test.tsx`),
 * mais aucun test ne montait la carte RÉELLE qu'un utilisateur ouvre
 * (`HubSpotCard` → `OAuthProviderCard` → `Diagnostics` →
 * `ConnectorDiagnostics`). Une recette écran du 18/09 a cherché ces libellés
 * sur `/integrations`, carte HubSpot, et n'en a trouvé aucun — cette carte
 * était l'APPELANT jamais vérifié bout en bout. Ce fichier verrouille la
 * chaîne complète, sans mock sur `ConnectorDiagnostics`.
 */

vi.mock('@/features/crm/hooks/useCrmStatus', () => ({
  CRM_STATUS_KEY: ['crm-status'],
  useCrmStatus: () => ({
    data: {
      configured: true,
      connected: true,
      provider: 'hubspot',
      accountLabel: 'demo.hubspot.example',
      capabilities: {
        contactsRead: true,
        contactsWrite: true,
        companiesRead: true,
        dealsRead: true,
        dealsWrite: true,
        tasksWrite: true,
        meetingsWrite: true,
        notesWrite: true,
      },
    },
    isLoading: false,
  }),
}))
// #4189.8 — la note de périmètre lit l'état de synchro : sans session ici, ni requête ni mode démo.
vi.mock('@/features/crm-import/api', () => ({
  useCrmReadStatus: () => ({ data: undefined }),
  useKeepCrmValue: () => ({ mutate: () => undefined }),
  useCrmFirstImport: () => ({ data: undefined }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/crm/api', () => ({ crmApi: { connectUrl: vi.fn(), disconnect: vi.fn() } }))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function hubspotTool(over: Partial<ConnectedTool> = {}): ConnectedTool {
  return {
    provider: 'hubspot',
    family: 'crm',
    display_name: 'HubSpot',
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    capability_state: 'operational',
    data_types: { reads: ['contacts'], writes: ['contacts'] },
    allowed_actions: ['export_contact'],
    capabilities: [
      {
        key: 'contactsRead',
        state: 'operational',
        scope_required: [],
        last_proof_at: null,
        last_proof_sample: null,
        last_error_code: null,
        last_error_at: null,
      },
    ],
    coverage_period: null,
    latency: null,
    beta: null,
    ...over,
  } as unknown as ConnectedTool
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('la carte HubSpot rend le manifeste jusqu’à l’écran (#2261.8 / #2261.16)', () => {
  it('nomme l’absence de période couverte plutôt que de la taire', async () => {
    const { HubSpotCard } = await import('./connector-cards')
    wrap(<HubSpotCard state="connected" tools={[hubspotTool()]} />)
    expect(screen.getByTestId('connector-coverage-period').textContent).toMatch(/non précisée/)
  })

  it('dit la période couverte quand le catalogue la déclare', async () => {
    const { HubSpotCard } = await import('./connector-cards')
    wrap(
      <HubSpotCard
        state="connected"
        tools={[hubspotTool({ coverage_period: { fr: 'les 12 derniers mois', en: 'the last 12 months' } })]}
      />,
    )
    expect(screen.getByTestId('connector-coverage-period').textContent).toMatch(/les 12 derniers mois/)
  })

  it('nomme un statut bêta inconnu plutôt que de le taire', async () => {
    const { HubSpotCard } = await import('./connector-cards')
    wrap(<HubSpotCard state="connected" tools={[hubspotTool()]} />)
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/non communiqué/)
  })

  it('nomme la fonctionnalité bêta quand le catalogue la déclare', async () => {
    const { HubSpotCard } = await import('./connector-cards')
    wrap(
      <HubSpotCard
        state="connected"
        tools={[hubspotTool({ beta: { beta: true, feature: { fr: 'recherche assistée', en: 'assisted search' } } })]}
      />,
    )
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/recherche assistée/)
  })
})
