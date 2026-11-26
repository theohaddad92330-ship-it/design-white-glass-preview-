import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MissingExpertiseReport } from '@bellum/contracts'

const report = (over: Partial<MissingExpertiseReport>): MissingExpertiseReport => ({
  skill: 'Kubernetes',
  refusedCount: 3,
  needs: [{ needId: 'n1', title: 'Besoin K8s', refusedAt: '2026-10-01' }],
  unaddressedRevenueCents: 1_200_000,
  cumulativeDayRateCents: 60_000,
  revenueState: 'measured',
  countedNeeds: 2,
  withoutRate: 0,
  withoutDuration: 0,
  ...over,
})

const data = { items: [] as MissingExpertiseReport[], windowDays: 90 }
vi.mock('../hooks', () => ({ useMissingExpertise: () => ({ isPending: false, data }) }))

const { MissingExpertisePanel } = await import('./MissingExpertisePanel')

/** #3935 — « 0 sans durée renseignée » : une absence ne fait aucune ligne. */
describe('MissingExpertisePanel — ce qui reste hors du montant (#3935)', () => {
  it('ne nomme que la part non nulle : jamais « 0 sans durée renseignée »', () => {
    data.items = [report({ withoutRate: 2, withoutDuration: 0 })]
    render(<MissingExpertisePanel />)
    expect(screen.getByText(/2 sans TJM cible/)).toBeInTheDocument()
    expect(screen.queryByText(/sans durée renseignée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\b0 sans/)).not.toBeInTheDocument()
  })
  it('nomme les deux quand les deux sont non nuls', () => {
    data.items = [report({ withoutRate: 1, withoutDuration: 3 })]
    render(<MissingExpertisePanel />)
    expect(screen.getByText(/1 sans TJM cible, 3 sans durée renseignée/)).toBeInTheDocument()
  })
  it('SAIT DIRE NON : rien de laissé dehors → aucune ligne « Hors du montant »', () => {
    data.items = [report({})]
    render(<MissingExpertisePanel />)
    expect(screen.queryByText(/Hors du montant/)).not.toBeInTheDocument()
  })
})
