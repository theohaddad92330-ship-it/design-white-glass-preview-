import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const drift = vi.fn()
vi.mock('@/features/missions/api', () => ({ useMissionDrift: () => drift() }))

const { MissionDriftPanel } = await import('./MissionDriftPanel')

const report = (missionId: string, label: string, kind: 'drifting' | 'unmeasurable') => ({
  missionId,
  missionLabel: label,
  accountName: 'Orange',
  verdict:
    kind === 'drifting'
      ? { kind, signals: ['late_timesheet'], months: 4, unmeasurable: ['satisfaction_drop'] }
      : { kind, signals: [], months: 1, unmeasurable: ['late_timesheet'] },
})

beforeEach(() => {
  cleanup()
  drift.mockReset()
})

describe('MissionDriftPanel sur UNE mission — Théo C missions-dossier.A5 / N7', () => {
  it('ne montre que la dérive de CETTE mission', () => {
    drift.mockReturnValue({
      isPending: false,
      data: [report('m1', 'Refonte SI', 'drifting'), report('m2', 'Autre mission', 'drifting')],
    })
    render(<MissionDriftPanel missionId="m1" />)
    expect(screen.getByText(/Refonte SI/)).toBeInTheDocument()
    expect(screen.queryByText(/Autre mission/)).toBeNull()
  })

  it('rien à signaler : dit ce qu’il ne sait pas, jamais une garantie', () => {
    drift.mockReturnValue({ isPending: false, data: [report('m2', 'Autre mission', 'drifting')] })
    render(<MissionDriftPanel missionId="m1" />)
    expect(screen.getByText(/Aucun point relevé dans les données de cette mission/)).toBeInTheDocument()
    expect(screen.getByText(/ne constitue pas une garantie exhaustive/)).toBeInTheDocument()
  })

  it('sans missionId (portefeuille), un panneau vide reste muet', () => {
    drift.mockReturnValue({ isPending: false, data: [] })
    const { container } = render(<MissionDriftPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('pendant le chargement, ni phrase rassurante ni zéro', () => {
    drift.mockReturnValue({ isPending: true, data: undefined })
    const { container } = render(<MissionDriftPanel missionId="m1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
