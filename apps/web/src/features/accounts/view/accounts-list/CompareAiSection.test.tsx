import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CompareData } from '@/features/accounts/battlecard-compare.types'
import { CompareAiSection } from './CompareAiSection'
import type { AccountRow } from './types'

// #3818 — l'objectif de l'espace, réglé par test (défaut : renseigné, comportement d'avant).
const mockHasObjective = vi.hoisted(() => ({ value: true }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => mockHasObjective.value }))

const mockCompareAI = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { compareAI: (...a: unknown[]) => mockCompareAI(...a) },
}))

function row(id: string, company_name: string): AccountRow {
  return { id, company_name, sector: null, priority_score: null, status: 'completed', created_at: '2026-01-01' }
}

const ACCOUNTS = [row('a1', 'EDF'), row('a2', 'SNCF')]

const RESULT: CompareData = {
  comparison: [
    { company: 'EDF', adjusted_score: 8.5, recommendation: 'GO', strengths: ['Budget'], risks: ['Cycle long'] },
    { company: 'SNCF', recommendation: 'PRUDENT' },
  ],
  priority_order: ['EDF', 'SNCF'],
  reasoning: 'EDF a un signal plus chaud.',
  quick_win: 'EDF cette semaine',
}

describe('CompareAiSection', () => {
  it('shows the hint and generate CTA before any run', () => {
    render(<CompareAiSection accounts={ACCOUNTS} />)
    expect(screen.getByText('Priorisation par IA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prioriser avec l'IA/i })).toBeInTheDocument()
  })

  // #2932 (constat recette 27/09/2026, salle démo) — même nom métier que la
  // fiche compte (`AccountVerdictSummary.tsx`) : l'IA écrit GO/NO-GO/PRUDENT
  // (vocabulaire fermé du prompt `bellum_compare.py`), l'écran affiche le nom
  // métier (`namedRecommendation`, GA-26), jamais le libellé brut de l'IA.
  it('renders the AI prioritisation (order, verdict, quick win) after a run — named verdict, not the raw IA label', async () => {
    mockCompareAI.mockResolvedValueOnce({ success: true, data: RESULT })
    render(<CompareAiSection accounts={ACCOUNTS} />)

    fireEvent.click(screen.getByRole('button', { name: /Prioriser avec l'IA/i }))

    await waitFor(() => expect(screen.getByText('EDF cette semaine')).toBeInTheDocument())
    expect(mockCompareAI).toHaveBeenCalledWith(['a1', 'a2'])
    expect(screen.getByText('AGIR MAINTENANT')).toBeInTheDocument()
    expect(screen.getByText('RÉSERVE')).toBeInTheDocument()
    expect(screen.queryByText('GO')).not.toBeInTheDocument()
    expect(screen.queryByText('PRUDENT')).not.toBeInTheDocument()
    expect(screen.getByText('EDF a un signal plus chaud.')).toBeInTheDocument()
  })

  // #3818 — sans objectif renseigné, la priorisation par IA ne dit pas « ÉCARTER POUR CET OBJECTIF ».
  it('#3818 — sans objectif : un NO-GO n’est jamais « ÉCARTER POUR CET OBJECTIF »', async () => {
    mockHasObjective.value = false
    try {
      mockCompareAI.mockResolvedValueOnce({
        success: true,
        data: {
          ...RESULT,
          comparison: [
            { company: 'EDF', recommendation: 'NO-GO' },
            { company: 'SNCF', recommendation: 'GO' },
          ],
        },
      })
      render(<CompareAiSection accounts={ACCOUNTS} />)
      fireEvent.click(screen.getByRole('button', { name: /Prioriser avec l'IA/i }))
      await waitFor(() => expect(screen.getByText('EDF cette semaine')).toBeInTheDocument())
      expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
      expect(screen.getByText('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')).toBeInTheDocument()
    } finally {
      mockHasObjective.value = true
    }
  })

  // #2284.1 — résoudre avant de comparer : deux comptes, une même entreprise.
  it('names two accounts that are the same company — never merges them', async () => {
    mockCompareAI.mockResolvedValueOnce({
      success: true,
      data: {
        ...RESULT,
        identity_overlaps: [
          {
            relation: 'same_entity',
            account_ids: ['a1', 'a2'],
            companies: ['EDF', 'Électricité de France'],
            siren: '552081317',
          },
        ],
      },
    })
    render(<CompareAiSection accounts={ACCOUNTS} />)
    fireEvent.click(screen.getByRole('button', { name: /Prioriser avec l'IA/i }))
    await waitFor(() => expect(screen.getByText(/Électricité de France/)).toBeInTheDocument())
    expect(screen.getByText(/552081317/)).toBeInTheDocument()
  })

  it('says nothing about identity when no overlap is measured (null) or found ([])', async () => {
    mockCompareAI.mockResolvedValueOnce({ success: true, data: { ...RESULT, identity_overlaps: null } })
    const { container } = render(<CompareAiSection accounts={ACCOUNTS} />)
    fireEvent.click(screen.getByRole('button', { name: /Prioriser avec l'IA/i }))
    await waitFor(() => expect(screen.getByText('EDF cette semaine')).toBeInTheDocument())
    expect(container.querySelector('[data-testid="compare-identity-overlap"]')).toBeNull()
  })

  it('surfaces an error state when the generation fails (no invented data)', async () => {
    mockCompareAI.mockRejectedValueOnce(new Error('boom'))
    render(<CompareAiSection accounts={ACCOUNTS} />)

    fireEvent.click(screen.getByRole('button', { name: /Prioriser avec l'IA/i }))

    await waitFor(() => expect(screen.getByText(/indisponible pour l'instant/i)).toBeInTheDocument())
  })
})
