import type { ProjectReadRow } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SignalOpportunityAction } from './SignalOpportunityAction'

/**
 * #3683.2 — « Préparer une opportunité » : un brouillon, jamais une création au clic sur un fait public.
 * Un projet du même nom existe → « Ouvrir l'opportunité » (lien, retour au même compte/onglet), pas de doublon.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))

const signal: WatchSignal = {
  id: 's-1',
  category: 'historique',
  date: '2026-06',
  freshness: 'current',
  temporalStatus: 'RECENT',
  type: 'projet',
  signal: 'Appel d’offres ouvert pour la refonte du SI',
  source: 'BOAMP',
  sales_implication: 'Un cadrage peut être proposé avant la clôture.',
  score: 80,
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
}

function render(projects: Partial<ProjectReadRow>[], failCreate = false) {
  mockFetch.mockImplementation((args?: { path?: string; method?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.startsWith('/projects') && args?.method === 'POST') {
      return failCreate
        ? Promise.reject(new Error('indisponible'))
        : Promise.resolve({ project: { id: 'new-1', label: signal.signal }, renewal_linked: false })
    }
    if (path.startsWith('/projects')) return Promise.resolve(projects)
    return Promise.resolve({ data: [], pages: [] })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <SignalOpportunityAction accountId="acc-1" signal={signal} />
    </QueryClientProvider>,
  )
}

const posts = () => mockFetch.mock.calls.filter(([args]) => (args as { method?: string })?.method === 'POST')

beforeEach(() => mockFetch.mockReset())

describe('#3683.2 — Préparer une opportunité', () => {
  it('le clic ouvre le brouillon renseigné du fait et ne crée RIEN', async () => {
    const user = userEvent.setup()
    render([])
    await user.click(await screen.findByRole('button', { name: 'Préparer une opportunité' }))
    expect(await screen.findByText('Ce que le signal apporte')).toBeInTheDocument()
    expect(screen.getByText(/Source : BOAMP/)).toBeInTheDocument()
    expect(
      screen.getByText(/Montant estimé · Clôture espérée · Porteur de l’affaire · Interlocuteur côté client/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'affaire")).toHaveValue(signal.signal)
    expect(posts()).toHaveLength(0)
  })

  it('la validation crée UNE affaire, avec le contexte du fait', async () => {
    const user = userEvent.setup()
    render([])
    await user.click(await screen.findByRole('button', { name: 'Préparer une opportunité' }))
    await user.click(await screen.findByRole('button', { name: "Créer l'affaire" }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    const body = (posts()[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body).toMatchObject({ account_id: 'acc-1', label: signal.signal })
    expect(String(body.detail)).toContain('Source : BOAMP')
  })

  it('un échec de création garde le brouillon à l’écran', async () => {
    const user = userEvent.setup()
    render([], true)
    await user.click(await screen.findByRole('button', { name: 'Préparer une opportunité' }))
    await user.click(await screen.findByRole('button', { name: "Créer l'affaire" }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(screen.getByLabelText("Nom de l'affaire")).toHaveValue(signal.signal)
  })

  it('une affaire du même nom existe : « Ouvrir l’opportunité » mène à SON dossier, au retour compte/onglet', async () => {
    render([{ id: 'p-9', label: signal.signal, account_id: 'acc-1' }])
    const link = await screen.findByRole('link', { name: 'Ouvrir l’opportunité' })
    expect(link.getAttribute('href')).toMatch(/^\/projects\/p-9\?/)
    expect(link.getAttribute('href')).toContain('from=account')
    expect(link.getAttribute('href')).toContain('fromId=acc-1')
    expect(link.getAttribute('href')).toContain('fromTab=veille')
    expect(screen.queryByRole('button', { name: 'Préparer une opportunité' })).not.toBeInTheDocument()
  })
})
