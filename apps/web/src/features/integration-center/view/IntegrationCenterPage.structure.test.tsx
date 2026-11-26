import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorView } from '../lib/connectors'
import { IntegrationCenterPage } from './IntegrationCenterPage'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('../api', () => ({ useToolRegistry: () => ({ data: [], isLoading: false, isError: false }) }))

const view = (id: ConnectorView['id'], displayName: string, state: ConnectorView['state']) =>
  ({ id, displayName, state, tools: [] }) as unknown as ConnectorView
vi.mock('../lib/connectors', () => ({
  buildConnectorsView: () => ({
    counts: { connected: 1, available: 1, actionRequired: 1 },
    all: [view('hubspot', 'HubSpot', 'connected'), view('zoho', 'Zoho CRM', 'action_required')],
    groups: [],
  }),
}))
vi.mock('@/features/crm-import/api', () => ({ useCrmReadStatus: () => ({ data: [] }) }))
vi.mock('./ReviewTab', () => ({ ReviewTab: () => <p>A-RELIRE</p> }))
vi.mock('@/features/api-keys/components/ApiKeysCard', () => ({ ApiKeysCard: () => <p>CLES-API</p> }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({ usePlanFeature: () => ({ allowed: true }) }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/guide/GuideHelpCenter', () => ({ GuideHelpCenter: () => null }))
// Retirés par #4511 (et, le 24/10, les clés d'API — mockées ci-dessus) : s'ils revenaient, leur marqueur apparaîtrait.
vi.mock('./IntegrationsHero', () => ({ IntegrationsHero: () => <p>PASTILLES-COMPTEURS</p> }))
vi.mock('./LauraSourcesPanel', () => ({ LauraSourcesPanel: () => <p>CE-QUE-LAURA-LIT</p> }))
vi.mock('./ImportEntryCard', () => ({
  ImportEntryAction: () => <a href="/settings/mes-donnees?tab=imports">IMPORTER</a>,
}))
vi.mock('./IntegrationHistory', () => ({ IntegrationHistory: () => <p>HISTORIQUE</p> }))
// Le tiroir : on prouve qu'il s'ouvre sur LA bonne carte ; son contenu est prouvé par `ConnectorDrawer.test.tsx`.
vi.mock('./ConnectorDrawer', () => ({
  ConnectorDrawer: ({ tile, state }: { tile: { name: string } | null; state?: string }) =>
    tile ? (
      <div role="dialog">
        TIROIR {tile.name} {state}
      </div>
    ) : null,
}))

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('#4511 — l’en-tête de /integrations = maquette V22', () => {
  it('titre, phrase, « Importer un fichier », « Comment travailler ici ? », puis les trois onglets, dans cet ordre', () => {
    render(<IntegrationCenterPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'grid.title' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    const order = ['grid.title', 'grid.subtitle', 'IMPORTER', 'grid.tabs.connectors', 'grid.tabs.review'].map(part =>
      text.indexOf(part),
    )
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(screen.getByText('IMPORTER').closest('a')).toHaveAttribute('href', '/settings/mes-donnees?tab=imports')
    // Le repli « Comment travailler ici ? » déplie le texte de CET écran.
    expect(document.querySelector('details[data-shell="screen-guide"]')).not.toBeNull()
    expect(screen.getByText('grid.guide.heading')).toBeInTheDocument()
  })

  it('onglets Connecteurs / À relire / Historique — « À relire » montre son compteur, même à 0', () => {
    render(<IntegrationCenterPage />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['grid.tabs.connectors', 'grid.tabs.review0', 'grid.tabs.history'])
  })

  it('retirés : pastilles de compteurs, « Ce que Laura lit », filtres Branchés / À reconnecter / À brancher / Plus de filtres', () => {
    render(<IntegrationCenterPage />)
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('PASTILLES-COMPTEURS')
    expect(text).not.toContain('summary')
    expect(text).not.toContain('CE-QUE-LAURA-LIT')
    expect(text).not.toMatch(/filters\./)
    expect(screen.queryByRole('button', { name: /filters\./ })).not.toBeInTheDocument()
  })

  it('un seul petit champ « Chercher un outil », qui filtre les cartes', async () => {
    render(<IntegrationCenterPage />)
    const search = screen.getByRole('searchbox', { name: 'searchPlaceholder' })
    expect(screen.getByTestId('connector-tile-hubspot')).toBeInTheDocument()
    expect(screen.getByTestId('connector-tile-zoho')).toBeInTheDocument()
    await user().type(search, 'hub')
    expect(screen.getByTestId('connector-tile-hubspot')).toBeInTheDocument()
    expect(screen.queryByTestId('connector-tile-zoho')).not.toBeInTheDocument()
    await user().clear(search)
    await user().type(search, 'introuvable')
    expect(screen.getByText('noMatch')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'noMatchClear' }))
    expect(screen.getByTestId('connector-tile-zoho')).toBeInTheDocument()
  })

  it('#4510 — les cartes se rangent sous les légendes de famille, et RIEN ne vient sous la grille', () => {
    render(<IntegrationCenterPage />)
    expect(screen.getByRole('heading', { level: 2, name: 'grid.families.crm' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    // Arbitrage Louis 24/10 (#4510/#4511, « Retirer les blocs ») : « Par quoi commencer », les préférences de
    // notification et les clés d'API ne sont plus sous la grille. Les clés vivent dans Outils › MCP
    // (`AiAssistantView.test.tsx`), les préférences dans Mon compte › Notifications.
    for (const gone of ['CLES-API', 'grid.families.apiKeys', 'starter.title', 'notificationsEntry.title']) {
      expect(text).not.toContain(gone)
    }
    expect(screen.queryByRole('link', { name: /notificationsEntry/ })).not.toBeInTheDocument()
  })

  it('les préférences de notification restent atteignables : Mon compte › Notifications (jamais une fonction perdue)', () => {
    const reachable = SETTINGS_SECTIONS.flatMap(section => section.items).some(
      item => item.to === '/settings/notifications',
    )
    expect(reachable).toBe(true)
  })

  it('#4510 — « Voir le parcours » ouvre le tiroir de CETTE carte, avec son état', async () => {
    render(<IntegrationCenterPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const card = screen.getByTestId('connector-tile-zoho')
    await user().click(within(card).getByText('grid.actions.journey'))
    expect(screen.getByRole('dialog')).toHaveTextContent('TIROIR Zoho CRM action_required')
  })

  it('#4510 — autorisation expirée : « Reconnecter » est sur la carte et ouvre le même tiroir', async () => {
    render(<IntegrationCenterPage />)
    const card = screen.getByTestId('connector-tile-zoho')
    expect(within(card).getAllByRole('button')).toHaveLength(2)
    expect(within(screen.getByTestId('connector-tile-hubspot')).getAllByRole('button')).toHaveLength(1)
    await user().click(within(card).getByText('grid.actions.reconnect'))
    expect(screen.getByRole('dialog')).toHaveTextContent('TIROIR Zoho CRM')
  })
})
