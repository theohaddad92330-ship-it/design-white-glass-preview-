import { render, screen } from '@testing-library/react'
import type { MonthObjective } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    to: string
    'aria-label'?: string
  }) => (
    <a href={to} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('../api', () => ({ pilotageApi: { monthObjective: vi.fn() } }))
vi.mock('@/components/feedback/QueryLoadError', () => ({ QueryLoadError: () => <div data-testid="load-error" /> }))

const { MonthObjectiveBlock } = await import('./MonthObjectiveBlock')

const base: MonthObjective = {
  month: '2026-10-01',
  generatedAt: '2026-10-14T10:00:00.000Z',
  target: 100000,
  realised: 40000,
  openPipe: 90000,
  workingDaysLeft: 13,
  remaining: 60000,
  coverage: 1.5,
  expectedPacePerDay: 60000 / 13,
}

const seed = (data: MonthObjective) => useQuery.mockReturnValue({ data, isLoading: false, isError: false })

beforeEach(() => {
  vi.clearAllMocks()
  seed(base)
})

describe('MonthObjectiveBlock', () => {
  it('le cap du mois : anneau, signé, cible, couverture et rythme — chacun dit sa période et son dénominateur', () => {
    render(<MonthObjectiveBlock />)
    expect(screen.getByRole('heading', { name: 'Le cap d’octobre' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '40 % de l’objectif signé' })).toBeInTheDocument()
    expect(screen.getByText('Signé ce mois')).toBeInTheDocument()
    expect(screen.getByText('Cible déclarée')).toBeInTheDocument()
    expect(screen.getByText(/100\s?k€/)).toBeInTheDocument()
    expect(screen.getByText(/Couverture du pipe × 1,5/)).toBeInTheDocument()
    expect(screen.getByText(/Pipe ouvert non pondéré/)).toBeInTheDocument()
    expect(screen.getByText(/13 jours ouvrés restants/)).toBeInTheDocument()
    expect(screen.getByText(/Signé en octobre 2026/)).toBeInTheDocument()
  })

  it('les deux portes — crayon, « Détail » — mènent à la saisie des objectifs dans Équipe', () => {
    render(<MonthObjectiveBlock />)
    const edit = screen.getByRole('link', { name: 'Ajuster mon objectif' })
    const detail = screen.getByRole('link', { name: /Détail/ })
    expect(edit).toHaveAttribute('href', '/team')
    expect(detail).toHaveAttribute('href', '/team')
    expect(screen.getByText(/60\s?k€ pour atteindre le cap/)).toBeInTheDocument()
  })

  it('sans objectif saisi : « Aucun objectif saisi », un lien vers /team, aucun chiffre inventé', () => {
    seed({ ...base, target: null, remaining: null, coverage: null, expectedPacePerDay: null })
    render(<MonthObjectiveBlock />)
    expect(screen.getByText('Aucun objectif saisi')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/team')
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
    expect(screen.queryByText(/jour ouvré/)).not.toBeInTheDocument()
  })

  it('un réalisé illisible est « Non mesuré », jamais 0 €', () => {
    seed({ ...base, realised: null, remaining: null, coverage: null, expectedPacePerDay: null })
    render(<MonthObjectiveBlock />)
    expect(screen.getAllByText('Non mesuré').length).toBeGreaterThan(0)
  })

  it('objectif atteint : rien à couvrir', () => {
    seed({ ...base, realised: 120000, remaining: 0, coverage: null, expectedPacePerDay: 0 })
    render(<MonthObjectiveBlock />)
    expect(screen.getByText('Rien à couvrir : l’objectif est atteint.')).toBeInTheDocument()
  })

  it('échec de lecture : une erreur, pas un objectif absent', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MonthObjectiveBlock />)
    expect(screen.getByTestId('load-error')).toBeInTheDocument()
    expect(screen.queryByText('Aucun objectif saisi')).not.toBeInTheDocument()
  })
})
