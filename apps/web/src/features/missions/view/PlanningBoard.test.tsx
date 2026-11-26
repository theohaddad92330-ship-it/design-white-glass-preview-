import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const board = vi.hoisted(() => ({
  state: { isLoading: false, isError: false, data: undefined as unknown },
}))
vi.mock('../api', () => ({
  useMissionBoard: () => board.state,
  useMoveBoardCard: () => ({ mutate: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { PlanningBoard } = await import('./PlanningBoard')

function card(over: Record<string, unknown>) {
  return {
    id: 'm1',
    source: 'mission',
    column: 'en_cours',
    label: 'Fiabilisation plateforme',
    accountName: 'SNCF',
    originState: 'active',
    role: null,
    consultantName: 'Yanis Berthier',
    endsOn: '2026-11-30',
    dailyRateCents: null,
    marginPercent: null,
    daysInColumn: null,
    alert: null,
    ...over,
  }
}

afterEach(() => {
  cleanup()
  board.state = { isLoading: false, isError: false, data: undefined }
})

// Théo missions-planning.A1 — le board, troisième vue : les colonnes occupées, les vides nommées.
describe('PlanningBoard', () => {
  it('ne dessine que les colonnes occupées et NOMME les colonnes vides', () => {
    board.state.data = {
      cards: [card({}), card({ id: 'm2', column: 'renouvellement', label: 'Convergence temps réel' })],
      columns: [
        { column: 'en_cours', count: 1, remainingRevenueCents: null, withoutEndDateCount: 0 },
        { column: 'renouvellement', count: 1, remainingRevenueCents: null, withoutEndDateCount: 0 },
      ],
      intakeCount: 0,
    }
    render(<PlanningBoard />)
    expect(screen.getByRole('region', { name: 'En cours' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Renouvellement' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Perdue' })).not.toBeInTheDocument()
    expect(screen.getByText(/colonnes vides repliées :.*perdue.*en veille/i)).toBeInTheDocument()
  })

  it('une carte de mission mène au dossier et propose « Déplacer vers… »', () => {
    board.state.data = {
      cards: [card({})],
      columns: [{ column: 'en_cours', count: 1, remainingRevenueCents: null, withoutEndDateCount: 0 }],
      intakeCount: 0,
    }
    render(<PlanningBoard />)
    const column = screen.getByRole('region', { name: 'En cours' })
    expect(within(column).getByRole('link', { name: 'Fiabilisation plateforme' })).toHaveAttribute(
      'href',
      '/missions/m1',
    )
    expect(within(column).getByRole('combobox', { name: 'Déplacer vers…' })).toBeInTheDocument()
  })

  it('n’écrit aucun montant quand la colonne n’a rien de mesurable, et compte les cartes sans fin', () => {
    board.state.data = {
      cards: [card({ endsOn: null, alert: 'no_end_date' })],
      columns: [{ column: 'en_cours', count: 1, remainingRevenueCents: null, withoutEndDateCount: 1 }],
      intakeCount: 0,
    }
    render(<PlanningBoard />)
    const column = screen.getByRole('region', { name: 'En cours' })
    expect(column.textContent).not.toMatch(/€/)
    expect(within(column).getAllByText(/sans date de fin/i).length).toBeGreaterThan(0)
  })

  it('ne rend jamais un échec de lecture comme « aucune carte »', () => {
    board.state = { isLoading: false, isError: true, data: undefined }
    render(<PlanningBoard />)
    expect(screen.getByText('Le board n’a pas pu être chargé')).toBeInTheDocument()
    expect(screen.queryByText('Aucune carte sur le board')).not.toBeInTheDocument()
  })

  it('un board sans carte le dit', () => {
    board.state.data = { cards: [], columns: [], intakeCount: 0 }
    render(<PlanningBoard />)
    expect(screen.getByText('Aucune carte sur le board')).toBeInTheDocument()
  })
})
