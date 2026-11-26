import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StaffingCapacity, StaffingOverview } from '@bellum/contracts'

const state: { capacity: StaffingCapacity | null; overview: StaffingOverview | null } = {
  capacity: null,
  overview: null,
}

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./api', () => ({
  useStaffingCapacity: () => ({ isLoading: false, isError: false, data: state.capacity }),
  useStaffingOverview: () => ({ isLoading: false, isError: false, data: state.overview }),
  useSetTaceThreshold: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #4349 V.2 — le bloc « compétences qui te coûtent des besoins » a son propre test (MissingExpertisePanel.test.tsx).
vi.mock('@/features/consultants/view/MissingExpertisePanel', () => ({
  MissingExpertisePanel: () => <div data-testid="missing-expertise" />,
}))

const missing = vi.fn(() => ({ isSuccess: false, data: undefined }) as { isSuccess: boolean; data: unknown })
vi.mock('@/features/consultants/hooks', () => ({ useMissingExpertise: () => missing() }))

import { StaffingScreen } from './StaffingScreen'

const unmeasured = { percent: null, days: null, availableDays: 20 }
const measured = (percent: number) => ({ percent, days: (percent * 20) / 100, availableDays: 20 })

function overview(threshold: number | null): StaffingOverview {
  return {
    generatedAt: '2026-10-14T08:00:00.000Z',
    bench: {
      month: '2026-10',
      countedUntil: '2026-10-14',
      knownCostCents: null,
      withoutCost: 1,
      consultants: [
        {
          consultantId: 'c1',
          fullName: 'Camille Durand',
          freeSince: '2026-10-03',
          benchDaysThisMonth: 8,
          mainSkills: ['Java'],
          cost: { state: 'unknown' },
        },
      ],
    },
    endings: {
      within30: [
        {
          missionId: 'm1',
          consultantName: 'Léa Martin',
          accountName: 'Orange',
          endsOn: '2026-10-30',
          daysLeft: 16,
          renewal: 'unknown',
        },
      ],
      within60: [],
      within90: [],
    },
    tace: {
      thresholdPercent: threshold,
      periods: [
        {
          month: '2026-10',
          from: '2026-10-01',
          to: '2026-10-14',
          global: { planned: measured(50), actual: unmeasured },
          consultants: [{ consultantId: 'c1', fullName: 'Camille Durand', planned: measured(50), actual: unmeasured }],
        },
      ],
    },
  }
}

const capacity: StaffingCapacity = {
  generatedAt: '2026-10-14T08:00:00.000Z',
  from: '2026-10-12',
  to: '2026-10-18',
  undatedOpenNeeds: 2,
  weeks: [
    {
      weekStart: '2026-10-12',
      workingDays: 5,
      consultants: 4,
      capacityDays: 20,
      signedMissionDays: 15,
      openNeedDays: 5,
    },
  ],
}

afterEach(cleanup)

describe('StaffingScreen', () => {
  // #4349 V.2 — décision Louis 19/10 : « expertises sans consultant » quitte le Vivier pour Pilotage › Staffing.
  it('#4349 V.2 — porte le bloc des compétences sans profil, sorti du Vivier', () => {
    state.capacity = { weeks: [], undatedOpenNeeds: 0 } as unknown as StaffingCapacity
    state.overview = overview(null)
    render(<StaffingScreen />)
    expect(screen.getByTestId('missing-expertise')).toBeInTheDocument()
  })

  it('names what is not measured instead of showing 0 %', () => {
    state.capacity = capacity
    state.overview = overview(null)
    render(<StaffingScreen />)
    expect(screen.getAllByText(/Non mesuré/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^0 %$/)).toBeNull()
    expect(screen.getAllByText(/Coût non renseigné/i).length).toBeGreaterThan(0)
  })

  it('shows an alert only when the firm has set a threshold', () => {
    state.capacity = capacity
    state.overview = overview(null)
    const { unmount } = render(<StaffingScreen />)
    expect(screen.queryByText(/Sous le seuil/i)).toBeNull()
    expect(screen.getByText(/Aucun seuil d'alerte saisi/i)).toBeTruthy()
    unmount()
    state.overview = overview(80)
    render(<StaffingScreen />)
    expect(screen.getAllByText(/Sous le seuil de 80/i).length).toBeGreaterThan(0)
  })

  it('has exactly one top-level section tree: no h1 of its own (the page header owns it)', () => {
    state.capacity = capacity
    state.overview = overview(null)
    const { container } = render(<StaffingScreen />)
    expect(container.querySelectorAll('h1')).toHaveLength(0)
  })

  it('lists the ending missions with their consultant, client and renewal status', () => {
    state.capacity = capacity
    state.overview = overview(null)
    render(<StaffingScreen />)
    expect(screen.getByText('Léa Martin')).toBeTruthy()
    expect(screen.getByText('Orange')).toBeTruthy()
    expect(screen.getByText(/Prolongation non connue/i)).toBeTruthy()
  })

  it('names the undated open needs that are not counted', () => {
    state.capacity = capacity
    state.overview = overview(null)
    render(<StaffingScreen />)
    expect(screen.getByText(/2 besoins ouverts sans date/i)).toBeTruthy()
  })
})

describe('Théo D pilotage › Staffing — la bande de chiffres et la grille', () => {
  afterEach(cleanup)

  it('quatre chiffres : intercontrat, fins à 30/60/90 j, TACE (non mesuré, jamais 0 %), expertises manquantes', () => {
    missing.mockReturnValue({ isSuccess: true, data: { items: [{}, {}] } })
    state.capacity = capacity
    state.overview = overview(70)
    render(<StaffingScreen />)
    const facts = screen.getByTestId('staffing-facts')
    const value = (key: string) => facts.querySelector(`[data-fact="${key}"] dd`)?.textContent
    expect(value('bench')).toBe('1')
    expect(value('endings')).toBe('1 · 0 · 0')
    expect(value('tace')).toBe('Non mesuré')
    expect(value('missing')).toBe('2')
  })

  it('les expertises manquantes illisibles ne font pas de tuile', () => {
    missing.mockReturnValue({ isSuccess: false, data: undefined })
    state.capacity = capacity
    state.overview = overview(70)
    render(<StaffingScreen />)
    expect(screen.getByTestId('staffing-facts').querySelector('[data-fact="missing"]')).toBeNull()
  })

  it('la capacité et les fins de mission se lisent côte à côte, le banc et le TACE dessous', () => {
    missing.mockReturnValue({ isSuccess: true, data: { items: [] } })
    state.capacity = capacity
    state.overview = overview(70)
    render(<StaffingScreen />)
    const grid = screen.getByTestId('staffing-grid')
    expect(grid.className).toContain('lg:grid-cols-2')
    expect(within(grid).getByRole('heading', { name: /Fins de mission|fins de mission/ })).toBeInTheDocument()
    expect(within(grid).queryByRole('heading', { name: /TACE/ })).not.toBeInTheDocument()
  })
})
