import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #4499 (Louis 23/10) — ce qui quitte la page Pipeline et ARRIVE dans l'onglet Besoins : « Créer un besoin »
 * (ici « Ajouter un besoin », le mot de la maquette), « Exporter les besoins » (ici « Exporter », avec
 * « Exporter pour un partenaire » à côté) et la file de qualification (« Affaires à qualifier → Ouvrir la file »).
 * Chaque geste retiré du Pipeline doit rester atteignable : ce test le prouve à son nouvel endroit.
 */
vi.mock('@/lib/data-exit', () => ({
  useDataExit: () => ({ allowed: true, grant: {} }),
  workspaceRuleRefusalText: () => null,
}))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => ({ data: { intake: 3 } }) }))
vi.mock('@/features/crm-counters/usePistesToReview', () => ({ usePistesToReview: () => null }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Théo' }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.resolve({ lines: [] }) } }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/matching/hooks', () => ({
  useRunMatch: () => ({ mutate: vi.fn(), data: undefined, isPending: false }),
}))
vi.mock('@/features/matching/view/MatchDrawer', () => ({ MatchDrawer: () => null }))
vi.mock('@/features/consultants/hooks', () => ({
  useTalentSearch: () => ({ data: { total: 3 }, isSuccess: true }),
}))
vi.mock('./NeedProposalsPanel', () => ({ NeedProposalsPanel: () => null }))
vi.mock('./OpenNeedsTable', () => ({ OpenNeedsTable: () => null }))
vi.mock('./NeedConsultantDoor', () => ({ NeedConsultantDoor: () => null }))
vi.mock('./CreateNeedDialog', () => ({ CreateNeedDialog: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({
    data: {
      data: [{ id: 'n-1', title: 'Tech lead Java', status: 'open' }],
      pagination: { totalItems: 1, currentPage: 1, totalPages: 1, hasNext: false },
      counters: { total: 1, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

const { OpenNeedsPage } = await import('./OpenNeedsPage')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsPage />
    </QueryClientProvider>,
  )
}

describe('#4499 — l’onglet Besoins reçoit ce qui quitte le Pipeline', () => {
  afterEach(() => cleanup())

  it('« Ajouter un besoin » (ex-« Créer un besoin » de l’en-tête d’Affaires)', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Ajouter un besoin' })).toBeInTheDocument()
  })

  it('l’export des besoins, et celui pour un partenaire', () => {
    draw()
    // #4295.14 a nommé les deux boutons (GA-32) : l'intitulé accessible porte le nombre et la cible.
    expect(screen.getByRole('button', { name: /^Exporter les \d+ besoins affichés en CSV$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /besoins affichés en CSV pour un partenaire/ })).toBeInTheDocument()
  })

  it('la file de qualification : « Affaires à qualifier » et son nombre, puis « Ouvrir la file de qualification »', () => {
    draw()
    expect(screen.getByTestId('intake-queue')).toHaveTextContent('Affaires à qualifier3')
    expect(screen.getByText(/Ouvrir la file de qualification/)).toBeInTheDocument()
  })
})
