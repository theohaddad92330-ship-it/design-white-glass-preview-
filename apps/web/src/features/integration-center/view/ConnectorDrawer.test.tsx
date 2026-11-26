import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { crmApi } from '@/features/crm/api'
import type { ConnectorTile } from '../lib/connector-tiles'
import { ConnectorDrawer } from './ConnectorDrawer'

/**
 * #4510 — « Voir le parcours » ouvre le tiroir, qui rend la carte COMPLÈTE d'avant : la carte RÉELLE
 * (`HubSpotCard` → `OAuthProviderCard`), sans mock sur la carte, pour prouver que Déconnecter y part bien vers
 * l'API et que Reconnecter y est sur une autorisation expirée.
 */

vi.mock('@/features/crm/hooks/useCrmStatus', () => ({
  CRM_STATUS_KEY: ['crm-status'],
  useCrmStatus: () => ({
    data: {
      configured: true,
      connected: true,
      provider: 'hubspot',
      accountLabel: 'demo.hubspot.example',
      capabilities: { contactsRead: true, companiesRead: true, dealsRead: true },
    },
    isLoading: false,
  }),
}))
vi.mock('@/features/crm-import/api', () => ({
  useCrmReadStatus: () => ({ data: undefined }),
  useKeepCrmValue: () => ({ mutate: () => undefined }),
  useCrmFirstImport: () => ({ data: undefined }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/crm/api', () => ({
  crmApi: { connectUrl: vi.fn(), disconnect: vi.fn(async () => ({ warning: null })) },
}))

const HUBSPOT: ConnectorTile = {
  id: 'hubspot',
  connector: 'hubspot',
  family: 'crm',
  status: 'connected',
  action: 'manage',
  name: 'HubSpot',
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('#4510 — le tiroir d’un connecteur porte tout le détail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(crmApi.disconnect).mockClear()
  })

  it('fermé tant qu’aucune carte n’est ouverte', () => {
    wrap(<ConnectorDrawer tile={null} state={undefined} tools={[]} demoNote={[]} onClose={() => undefined} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ouvert : le nom, les trois garanties, puis la carte complète (compte branché, Déconnecter)', () => {
    wrap(<ConnectorDrawer tile={HUBSPOT} state="connected" tools={[]} demoNote={[]} onClose={() => undefined} />)
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getAllByText('HubSpot').length).toBeGreaterThan(0)
    expect(within(drawer).getByText('Périmètre de lecture')).toBeInTheDocument()
    expect(within(drawer).getByText('Rapprochement sans doublon')).toBeInTheDocument()
    expect(within(drawer).getByText('Écritures à relire')).toBeInTheDocument()
    expect(within(drawer).getByText('demo.hubspot.example')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /Déconnecter/ })).toBeInTheDocument()
  })

  it('Déconnecter, dans le tiroir, appelle bien la déconnexion de l’outil', async () => {
    wrap(<ConnectorDrawer tile={HUBSPOT} state="connected" tools={[]} demoNote={[]} onClose={() => undefined} />)
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(within(screen.getByRole('dialog')).getByRole('button', { name: /Déconnecter/ }))
    expect(crmApi.disconnect).toHaveBeenCalledTimes(1)
  })

  it('autorisation expirée : le tiroir porte le geste « Reconnecter » de la carte complète', () => {
    wrap(
      <ConnectorDrawer
        tile={{ ...HUBSPOT, status: 'action_required', action: 'repair' }}
        state="action_required"
        tools={[]}
        demoNote={[]}
        onClose={() => undefined}
      />,
    )
    expect(within(screen.getByRole('dialog')).getAllByRole('button', { name: /Reconnecter/ }).length).toBeGreaterThan(0)
  })
})
