import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { MyCommercialObjectivesResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TrajectoryVerdict } from './TrajectoryVerdict'

/**
 * « Le verdict » (#2114.13/.14/.66/.70) — la phrase en tête du cockpit qui
 * répond « je travaille bien mon portefeuille ». Elle ne fabrique JAMAIS un
 * écart ni un pourcentage d'atteinte (déjà tranché HORS scope par #2114.28/
 * .29, `CommercialObjectivesCard.tsx:16-19`, doctrine « aucune probabilité,
 * le lecteur fait la soustraction ») : elle CITE sa mesure (cible + réalisé
 * de l'axe CA, la trajectoire financière), rien de dérivé ni d'évalué.
 */

const { mockUse } = vi.hoisted(() => ({ mockUse: vi.fn() }))
vi.mock('../../hooks/useCommercialObjectives', () => ({ useCommercialObjectives: () => mockUse() }))

function response(over: Partial<MyCommercialObjectivesResponse> = {}): MyCommercialObjectivesResponse {
  return {
    period_month: '2026-09-01',
    objectives: [
      { axis: 'meetings', target: 12, achieved: 9, period_month: '2026-09-01', coverage: { measured: 9, total: 9 } },
      {
        axis: 'revenue',
        target: 180000,
        achieved: 42000,
        period_month: '2026-09-01',
        coverage: { measured: 1, total: 2 },
      },
    ],
    ...over,
  }
}

function withRevenueTarget(target: number | null): MyCommercialObjectivesResponse {
  const base = response()
  return {
    ...base,
    objectives: base.objectives.map(o => (o.axis === 'revenue' ? { ...o, target } : o)),
  }
}

describe('TrajectoryVerdict', () => {
  it('ne rend rien tant que la requête n’a pas abouti', () => {
    mockUse.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    const { container } = renderWithRouter(<TrajectoryVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien si la feature objectifs est indisponible (isError) — jamais un zéro ni un message d’erreur', () => {
    mockUse.mockReturnValue({ data: undefined, isSuccess: false, isError: true })
    const { container } = renderWithRouter(<TrajectoryVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('#2114.14 — funnel incomplet (aucun objectif de CA fixé) : le message dédié « je ne peux pas mesurer » apparaît', async () => {
    mockUse.mockReturnValue({ data: withRevenueTarget(null), isSuccess: true, isError: false })
    renderWithRouter(<TrajectoryVerdict />)
    expect(await screen.findByText(/je ne peux pas encore mesurer/i)).toBeInTheDocument()
  })

  it('#3777 — réalisé NON mesuré (null) : jamais « 0 € facturés », la phrase nomme l’absence', async () => {
    const base = response()
    const data = {
      ...base,
      objectives: base.objectives.map(o => (o.axis === 'revenue' ? { ...o, achieved: null } : o)),
    }
    mockUse.mockReturnValue({ data, isSuccess: true, isError: false })
    renderWithRouter(<TrajectoryVerdict />)
    expect(await screen.findByText(/pas encore mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText(/(^|[^\d\s])\s?0\s?€|(^|\s)0\s?€/)).toBeNull()
    expect(screen.getByText(/180\s?000/)).toBeInTheDocument()
  })

  it('#3777 — un VRAI zéro mesuré (achieved = 0) reste « 0 € »', async () => {
    const base = response()
    const data = { ...base, objectives: base.objectives.map(o => (o.axis === 'revenue' ? { ...o, achieved: 0 } : o)) }
    mockUse.mockReturnValue({ data, isSuccess: true, isError: false })
    renderWithRouter(<TrajectoryVerdict />)
    expect(await screen.findByText(/0\s?€ facturés/)).toBeInTheDocument()
  })

  it('#2114.13 — le verdict cite sa mesure : cible et réalisé de l’axe CA, en toutes lettres', async () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true, isError: false })
    renderWithRouter(<TrajectoryVerdict />)
    // 42 000 € réalisé sur 180 000 € de cible — jamais un écart ni un %.
    expect(await screen.findByText(/42\s?000/)).toBeInTheDocument()
    expect(screen.getByText(/180\s?000/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('#2114.70 — le verdict mesuré porte le jeton violet du dépôt (--bellum-text-accent), jamais une nuance fixe', async () => {
    mockUse.mockReturnValue({ data: response(), isSuccess: true, isError: false })
    const { container } = renderWithRouter(<TrajectoryVerdict />)
    await screen.findByText(/42\s?000/)
    expect(container.querySelector('[class*="bellum-text-accent"]')).not.toBeNull()
  })
})
