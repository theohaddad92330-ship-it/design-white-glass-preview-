import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { TabEvaluation } from './TabEvaluation'

// Louis 13/10/2026 : les garde-fous ne s'affichent plus nulle part. La donnée
// (`raw_analysis.data_reliability_notes`) reste stockée ; aucun écran ne la rend.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/features/qualification-grid/view/AccountQualificationCard', () => ({
  AccountQualificationCard: () => null,
}))
vi.mock('./evaluation/ScoreSummaryCard', () => ({ ScoreSummaryCard: () => null }))
vi.mock('./evaluation/OpenAccountCard', () => ({ OpenAccountCard: () => null }))
vi.mock('./evaluation/RecommendationCard', () => ({ RecommendationCard: () => null }))
vi.mock('./evaluation/EmptyEvaluationCard', () => ({ EmptyEvaluationCard: () => null }))
vi.mock('./evaluation/SignalListCard', () => ({ SignalListCard: () => null }))

const account = {
  id: 'a1',
  name: 'Orange',
  raw_analysis: {
    data_reliability_notes: [
      { label: 'Siège social non confirmé', constat: 'Hypothèse', reliability: 'Garde-fou' },
      { label: 'Ivalua', constat: 'Discours éditeur', reliability: 'Garde-fou' },
    ],
  },
} as unknown as Account

describe('TabEvaluation — garde-fous', () => {
  it('ne rend aucune note de fiabilité des données, même quand elles sont stockées', () => {
    const { container, queryByText } = render(<TabEvaluation account={account} />)
    expect(queryByText('Siège social non confirmé')).toBeNull()
    expect(queryByText('Ivalua')).toBeNull()
    expect(container.textContent).not.toContain('Garde-fou')
    expect(container.textContent).not.toContain('dataReliabilityNotes.title')
  })
})
