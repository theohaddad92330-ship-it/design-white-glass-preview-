import type { ConnectedTool } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2261.8 / #2261.16 — même garde que `HubSpotCard.test.tsx` : la recette
 * écran du 18/09 a aussi cherché ces libellés sur la carte Salesforce et n'en
 * a trouvé aucun. Verrouille la chaîne réelle `SalesforceCard` →
 * `OAuthProviderCard` → `Diagnostics` → `ConnectorDiagnostics`, sans mock sur
 * `ConnectorDiagnostics`.
 */

vi.mock('@/features/salesforce/hooks/useSalesforceStatus', () => ({
  SALESFORCE_STATUS_KEY: ['salesforce-status'],
  useSalesforceStatus: () => ({
    data: {
      configured: true,
      connected: true,
      accountLabel: 'demo.salesforce.example',
    },
    isLoading: false,
  }),
}))
vi.mock('@/features/salesforce/api', () => ({ salesforceApi: { connectUrl: vi.fn(), disconnect: vi.fn() } }))
// #4189.8 — la note de périmètre lit le mode démo (session) : hors démo ici.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function salesforceTool(over: Partial<ConnectedTool> = {}): ConnectedTool {
  return {
    provider: 'salesforce',
    family: 'crm',
    display_name: 'Salesforce',
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

describe('la carte Salesforce rend le manifeste jusqu’à l’écran (#2261.8 / #2261.16)', () => {
  it('nomme l’absence de période couverte plutôt que de la taire', async () => {
    const { SalesforceCard } = await import('./connector-cards')
    wrap(<SalesforceCard state="connected" tools={[salesforceTool()]} />)
    expect(screen.getByTestId('connector-coverage-period').textContent).toMatch(/non précisée/)
  })

  // #3918.3 (lot W-C 13/10) — l'appelant réel : la carte branchée porte la mention.
  it('dit ce qui est lu — les affaires le sont désormais, donc plus de « hors périmètre » (#3918.7)', async () => {
    const { SalesforceCard } = await import('./connector-cards')
    wrap(<SalesforceCard state="connected" tools={[salesforceTool()]} />)
    const note = screen.getByTestId('crm-read-scope')
    expect(note).toHaveTextContent(/Lu : tes comptes, tes contacts, tes affaires/)
    expect(note).not.toHaveTextContent(/Hors périmètre/)
  })

  it('nomme un statut bêta inconnu plutôt que de le taire', async () => {
    const { SalesforceCard } = await import('./connector-cards')
    wrap(<SalesforceCard state="connected" tools={[salesforceTool()]} />)
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/non communiqué/)
  })

  it('nomme la fonctionnalité bêta quand le catalogue la déclare', async () => {
    const { SalesforceCard } = await import('./connector-cards')
    wrap(
      <SalesforceCard
        state="connected"
        tools={[
          salesforceTool({ beta: { beta: true, feature: { fr: 'scoring prédictif', en: 'predictive scoring' } } }),
        ]}
      />,
    )
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/scoring prédictif/)
  })
})
