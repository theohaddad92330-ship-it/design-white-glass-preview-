import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

let connections: unknown[] = []
vi.mock('@/features/mcp/api', () => ({
  MCP_CONNECTIONS_KEY: ['mcp', 'connections'],
  MCP_SERVER_URL: 'https://mcp.example.test/mcp',
  mcpApi: { listConnections: () => Promise.resolve(connections), revokeConnection: vi.fn() },
}))
const planAllowed = { value: true }
vi.mock('@/features/plan-features/usePlanFeature', () => ({ usePlanFeature: () => ({ allowed: planAllowed.value }) }))
// Les clés d'API (arbitrage Louis 24/10) vivent ICI : la carte réelle a ses propres tests (`ApiKeysCard.test.tsx`).
vi.mock('@/features/api-keys/components/ApiKeysCard', () => ({ ApiKeysCard: () => <p>CLES-API</p> }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' } }) }))

const { AiAssistantView } = await import('./AiAssistantView')

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AiAssistantView />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  connections = []
  planAllowed.value = true
})

describe('Réglages › Accès assistants (MCP) — maquette settings-outils (refonte Théo)', () => {
  it('une colonne de blocs : les accès réels d’abord, puis le cadre, les garde-fous, le guide, les exemples', async () => {
    connections = [{ id: 'c1', client_name: 'Claude Desktop', scope: 'mcp', created_at: '2026-10-09T08:00:00.000Z' }]
    renderView()
    expect(await screen.findByText('Claude Desktop', { selector: 'h3' })).toBeInTheDocument()
    const titles = within(screen.getByTestId('mcp-blocks'))
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent)
    expect(titles[0]).toBe('1 accès actif')
    expect(titles).toHaveLength(5)
    // Arbitrage Louis 24/10 : les clés d'API ne sont plus sur Intégrations, elles vivent ICI (GA-26) — la carte
    // réelle, pas un lien qui renverrait vers une page qui ne les porte plus.
    expect(screen.getByText('CLES-API')).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-api-keys-link')).toBeNull()
    expect(screen.queryByRole('link', { name: /Intégrations/ })).toBeNull()
    const access = screen.getByTestId('mcp-connections')
    expect(within(access).getByText('Actif')).toBeInTheDocument()
    expect(within(access).getByRole('button', { name: 'Révoquer Claude Desktop' })).toBeInTheDocument()
  })

  it('aucun accès : le bloc le dit, sans compteur à zéro', async () => {
    renderView()
    const access = await screen.findByTestId('mcp-connections')
    expect(within(access).queryByText(/0 accès/)).toBeNull()
    expect(within(access).queryByRole('button', { name: /Révoquer/ })).toBeNull()
  })

  it('les clés d’API restent atteignables même quand l’offre ne porte pas l’assistant MCP (jamais une fonction perdue)', async () => {
    planAllowed.value = false
    renderView()
    expect(await screen.findByText('CLES-API')).toBeInTheDocument()
  })
})
