import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoryReasonLine } from './HistoryReasonLine'

describe('#4758 — la raison affichée sur la carte', () => {
  it('« 11 offres Java entre 2025 et 2026, la dernière il y a 3 mois »', () => {
    render(
      <HistoryReasonLine
        reason={{ count: 11, kind: 'offers', subject: 'Java', fromYear: 2025, toYear: 2026, lastAgeDays: 92 }}
      />,
    )
    expect(screen.getByTestId('candidate-history-reason').textContent).toBe(
      '11 offres Java entre 2025 et 2026, la dernière il y a 3 mois',
    )
  })

  it('sans techno, ne nomme rien et ne nomme jamais une source', () => {
    render(
      <HistoryReasonLine
        reason={{ count: 1, kind: 'needs', subject: null, fromYear: 2025, toYear: 2025, lastAgeDays: 400 }}
      />,
    )
    expect(screen.getByTestId('candidate-history-reason').textContent).toBe('1 besoin en 2025, le dernier il y a 1 an')
  })
})
