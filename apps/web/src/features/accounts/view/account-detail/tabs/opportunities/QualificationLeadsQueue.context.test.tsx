import type { ProjectReadRow } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { QualificationLeadsQueue } from './QualificationLeadsQueue'

/**
 * #3683.3 — « Identifier un interlocuteur » GARDE le périmètre et le rôle de la piste : l'onglet Contacts
 * s'ouvre cherché dessus (le rôle d'abord, à défaut le périmètre), jamais sur une liste générale.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))

const lead = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({
    id: 'lead-1',
    account_id: 'acc-1',
    company_name: 'Transports Aurignac',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Ouverture d’un second entrepôt automatisé',
    detail: null,
    offer: 'Refonte du SI logistique',
    source: 'Communiqué de presse',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    ...over,
  }) as ProjectReadRow

function render(row: ProjectReadRow, onOpenTab = vi.fn()) {
  mockFetch.mockImplementation((args?: { path?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.includes('qualification-leads')) return Promise.resolve([])
    if (path.startsWith('/projects')) return Promise.resolve([row])
    return Promise.resolve({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderWithRouter(
    <QueryClientProvider client={client}>
      <QualificationLeadsQueue accountId="acc-1" contactCount={0} onOpenTab={onOpenTab} />
    </QueryClientProvider>,
  )
  return onOpenTab
}

beforeEach(() => mockFetch.mockReset())

describe('#3683.3 — Identifier un interlocuteur garde le périmètre et le rôle', () => {
  it('le rôle de la piste voyage avec l’ouverture de l’onglet Contacts', async () => {
    const user = userEvent.setup()
    const onOpenTab = render(lead({ btmmp: { management: 'Directeur des opérations' } as ProjectReadRow['btmmp'] }))
    await user.click(await screen.findByRole('button', { name: 'Identifier le responsable' }))
    expect(onOpenTab).toHaveBeenCalledWith('contacts', 'Directeur des opérations')
  })

  it('sans rôle connu, c’est le périmètre qui voyage — jamais un rôle deviné', async () => {
    const user = userEvent.setup()
    const onOpenTab = render(lead({}))
    await user.click(await screen.findByRole('button', { name: 'Identifier le responsable' }))
    expect(onOpenTab).toHaveBeenCalledWith('contacts', 'Refonte du SI logistique')
  })
})
