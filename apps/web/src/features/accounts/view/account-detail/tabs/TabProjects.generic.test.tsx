import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { Account, ProjectReadRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #3714 — UNE GÉNÉRALITÉ N'EST PAS UNE AFFAIRE, UNE AFFAIRE MAL INTITULÉE RESTE.
 * Même titre générique pour les deux : seule la TRACE DE TRAVAIL les départage.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-generic' } as Account

const row = (over: Partial<ProjectReadRow> = {}): ProjectReadRow =>
  ({
    id: 'p-1',
    account_id: 'acc-generic',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Reprise du socle data',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    estimated_amount: null,
    ...over,
  }) as ProjectReadRow

function render(rows: ProjectReadRow[]) {
  mockFetch.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

const GENERIC = 'Cette activité implique des systèmes critiques'
const generic = (over: Partial<ProjectReadRow> = {}) =>
  row({ kind: 'implication', stage: 'detected', label: GENERIC, source: null, ...over })

describe('TabProjects — généralités hors des projets (#3714)', () => {
  it('range une déduction sans travail en contexte secondaire, hors du compte des projets', async () => {
    render([generic({ id: 'g-1' }), row({ id: 'p-2', label: 'Reprise du socle data' })])
    const ctx = await screen.findByTestId('generic-context')
    expect(ctx).toHaveTextContent(GENERIC)
    expect(ctx).toHaveTextContent('Contexte sectoriel (1)')
  })

  it('ne reclasse JAMAIS une ligne mal intitulée qui porte propriétaire, montant ou action', async () => {
    render([
      generic({ id: 'g-owner', owner_id: 'u-1' }),
      generic({ id: 'g-amount', amount_cents: 50_000 }),
      generic({ id: 'g-action', next_action: { title: 'Appeler', due_on: '2026-10-10' } }),
      row({ id: 'p-2', label: 'Reprise du socle data' }),
    ])
    expect((await screen.findAllByText('Reprise du socle data')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('generic-context')).toBeNull()
  })

  it('un programme nommé n’est pas éliminé par son titre', async () => {
    render([
      row({ id: 'p-prog', kind: 'program', stage: 'detected', label: 'Ambition 2026–2030', source: 'Rapport annuel' }),
    ])
    expect((await screen.findAllByText('Ambition 2026–2030')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('generic-context')).toBeNull()
  })
})
