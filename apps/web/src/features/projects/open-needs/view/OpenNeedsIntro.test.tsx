import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #2173.1 / #2173.2 — l'en-tête EXACT que l'issue cite, mot pour mot :
 * « Les besoins à traiter, Théo. » et un sous-titre qui priorise l'échéance
 * proche, l'absence de profil défendable et la décision client en attente.
 *
 * L'ancien texte (« {{firstName}}, voici les besoins clients à traiter » /
 * « Qualifie les demandes, repère celles sans profil… ») disait autre chose :
 * il ne nommait ni l'échéance ni la décision client, les deux critères que
 * l'issue met en premier.
 *
 * Même patron de montage que `OpenNeedsQuickViews.test.tsx` : l'écran ENTIER.
 */

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
      data: [],
      pagination: { totalItems: 0, currentPage: 1, totalPages: 1, hasNext: false },
      counters: { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
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

// Théo C projects-besoins.R1 / N3 / R7 (22/10) — l'intro « Les besoins à pourvoir, {prénom} »
// (#4342) cède la place au titre « Besoins », à la phrase de Théo, et au repère permanent
// de la chaîne « besoin qualifié → critères → profils comparés → sélection ».
describe('besoins — en-tête (Théo C projects-besoins)', () => {
  afterEach(() => cleanup())

  it('R1 — une seule phrase d’introduction, celle de Théo, plus de salutation', () => {
    draw()
    expect(screen.getByRole('heading', { name: 'Besoins' })).toBeInTheDocument()
    expect(screen.getByText('Les demandes à qualifier ou à couvrir, reliées à leur affaire.')).toBeInTheDocument()
    expect(screen.queryByText('Les besoins à pourvoir, Théo.')).not.toBeInTheDocument()
    expect(screen.queryByText(/besoins à traiter/)).not.toBeInTheDocument()
  })

  it('N3 — la chaîne est un repère permanent, en une phrase', () => {
    draw()
    expect(
      screen.getByText('Un besoin qualifié → critères de recherche → profils comparés → sélection.'),
    ).toBeInTheDocument()
  })

  it('refonte Théo — l’ordre de la maquette : chaîne, onglets, barre d’outils, puis résumé', () => {
    draw()
    const chain = screen.getByTestId('needs-chain')
    const tabs = screen.getByRole('navigation', { name: 'Sections d’Affaires' })
    const toolbar = screen.getByTestId('needs-toolbar')
    const summary = screen.getByTestId('needs-summary')
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(chain, tabs)).toBe(true)
    expect(follows(tabs, toolbar)).toBe(true)
    expect(follows(toolbar, summary)).toBe(true)
    // La barre d'outils porte « Filtres » (menu) et la bascule Kanban / Liste ; l'en-tête, l'ajout.
    expect(screen.getByRole('button', { name: 'Filtres rapides' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Ajouter un besoin/ })).toBeInTheDocument()
    // NON : plus de tuiles de bandeau, le résumé est UNE ligne.
    expect(summary.className).toMatch(/flex-wrap/)
    expect(summary.className).not.toMatch(/grid-cols/)
  })
})
