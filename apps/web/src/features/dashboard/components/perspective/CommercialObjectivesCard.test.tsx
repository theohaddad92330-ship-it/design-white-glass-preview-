import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { MyCommercialObjectivesResponse } from '@bellum/contracts'
import { CommercialObjectivesCard } from './CommercialObjectivesCard'

const { mockUse } = vi.hoisted(() => ({ mockUse: vi.fn() }))
vi.mock('../../hooks/useCommercialObjectives', () => ({ useCommercialObjectives: () => mockUse() }))

/**
 * « Mes objectifs commerciaux » (lot FA, #2114.16 à .27) — les sept axes,
 * toujours affichés, la cible et le réalisé qui ne se confondent jamais avec
 * un zéro fabriqué (GA-18/GA-19).
 */

function response(over: Partial<MyCommercialObjectivesResponse> = {}): MyCommercialObjectivesResponse {
  return {
    period_month: '2026-09-01',
    objectives: [
      { axis: 'meetings', target: 12, achieved: 9, period_month: '2026-09-01', coverage: { measured: 9, total: 9 } },
      {
        axis: 'qualified_needs',
        target: null,
        achieved: 2,
        period_month: '2026-09-01',
        coverage: { measured: 2, total: 3 },
      },
      {
        axis: 'placements',
        target: 3,
        achieved: 1,
        period_month: '2026-09-01',
        coverage: { measured: 1, total: 1 },
      },
      {
        axis: 'revenue',
        target: 180000,
        achieved: 42000,
        period_month: '2026-09-01',
        coverage: { measured: 1, total: 2 },
      },
      { axis: 'margin', target: 28, achieved: null, period_month: '2026-09-01', coverage: { measured: 0, total: 2 } },
      {
        axis: 'new_accounts',
        target: 20,
        achieved: 5,
        period_month: '2026-09-01',
        coverage: { measured: 5, total: 5 },
      },
      {
        axis: 'consultants_on_mission',
        target: 5,
        achieved: 4,
        period_month: '2026-09-01',
        coverage: { measured: 4, total: 4 },
      },
    ],
    ...over,
  }
}

describe('CommercialObjectivesCard', () => {
  it('se masque tant que la requête n’a pas abouti — jamais un bloc vide affiché', () => {
    mockUse.mockReturnValue({ data: undefined, isSuccess: false })
    const { container } = render(<CommercialObjectivesCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche toujours les sept axes, dans l’ordre', () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true })
    render(<CommercialObjectivesCard />)
    expect(screen.getByText('Rendez-vous')).toBeInTheDocument()
    expect(screen.getByText('Besoins qualifiés')).toBeInTheDocument()
    expect(screen.getByText('Démarrages')).toBeInTheDocument()
    expect(screen.getByText("Chiffre d'affaires")).toBeInTheDocument()
    expect(screen.getByText('Marge')).toBeInTheDocument()
    expect(screen.getByText('Comptes')).toBeInTheDocument()
    expect(screen.getByText('Consultants en mission')).toBeInTheDocument()
  })

  it('une cible non fixée dit « objectif non fixé », jamais un 0 fabriqué', () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true })
    render(<CommercialObjectivesCard />)
    expect(screen.getByText('objectif non fixé', { exact: false })).toBeInTheDocument()
  })

  it('un réalisé non mesurable (marge) dit pourquoi, jamais 0 %', () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true })
    render(<CommercialObjectivesCard />)
    expect(screen.getByText(/tjm et un coût/i)).toBeInTheDocument()
    expect(screen.queryByText('0 %')).toBeNull()
  })

  it('une couverture partielle nomme ce qui manque (X sur Y mesurés)', () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true })
    render(<CommercialObjectivesCard />)
    expect(screen.getByText('2 sur 3 mesurés')).toBeInTheDocument()
  })
})
