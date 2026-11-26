import { parseAccountAnalysis, type Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { readStoredVerdict } from '../useAccountOverviewData'
import { readDossierRead } from './dossierReadViewData'
import { buildEvaluationViewData } from './evaluationViewData'
import { ScoreSummaryCard } from './ScoreSummaryCard'

vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn(() => true) }
})

/**
 * #4016.L9.a (recette prod 14/10, THALES) — le Score disait « 5 axes sur 5 évalués · PRUDENT »,
 * la Vue d'ensemble « RÉSERVE · 1 axe(s) non mesuré(s) : Capacité d'achat externe ». UNE source
 * (GA-26) : les deux surfaces lisent le verdict stocké et la lecture en sept axes de la Vue d'ensemble.
 */
const SEVEN_AXES_ONE_UNKNOWN = [
  { key: 'adequation_offre', state: 'measured', value: 4 },
  { key: 'potentiel_commercial', state: 'measured', value: 3 },
  { key: 'fraicheur', state: 'measured', value: 3 },
  { key: 'accessibilite', state: 'measured', value: 2 },
  { key: 'capacite_achat_externe', state: 'unknown' },
  { key: 'concurrence', state: 'measured', value: 3 },
  { key: 'qualite_preuves', state: 'measured', value: 4 },
]

const thales = (): Account =>
  ({
    id: 'thales',
    priority_score: 5,
    raw_analysis: {
      evaluation: {
        score: 15,
        verdict: 'PRUDENT',
        dossier_read: { axes: SEVEN_AXES_ONE_UNKNOWN },
      },
      score_factors: [1, 2, 3, 4, 5].map(i => ({ label: `Axe ${i}`, weight: 3, kind: 'axis', max: 5 })),
    },
  }) as unknown as Account

describe('Score ↔ Vue d’ensemble — même verdict, mêmes axes (THALES)', () => {
  it('expose la lecture en sept axes de la Vue d’ensemble', () => {
    const data = buildEvaluationViewData(thales())
    expect(data.dossierRead?.score.scoredAxes).toBe(6)
    expect(data.dossierRead?.score.unknownAxes).toEqual(['capacite_achat_externe'])
    expect(data.dossierRead).toEqual(readDossierRead({ axes: SEVEN_AXES_ONE_UNKNOWN }))
  })

  it('le verdict du Score est celui que lit la Vue d’ensemble (`readStoredVerdict`)', () => {
    const account = thales()
    const overview = readStoredVerdict(parseAccountAnalysis(account.raw_analysis))
    expect(overview).toBe('PRUDENT')
    expect(buildEvaluationViewData(account).goNoGo).toBe(overview)
  })

  it('le Score dit « 6 axes sur 7 évalués » et NOMME l’axe non mesuré', () => {
    render(<ScoreSummaryCard data={buildEvaluationViewData(thales())} />)
    expect(screen.getByText(/6 axes sur 7/)).toBeInTheDocument()
    expect(screen.queryByText(/5 axes sur 5/)).not.toBeInTheDocument()
    expect(screen.getByText(/Capacité d.achat externe/)).toBeInTheDocument()
  })

  it('sans lecture en sept axes, le Score garde le décompte des facteurs (dossier ancien)', () => {
    const account = {
      id: 'old',
      priority_score: 5,
      raw_analysis: {
        score_factors: [1, 2, 3, 4, 5].map(i => ({ label: `Axe ${i}`, weight: 3, kind: 'axis', max: 5 })),
      },
    } as unknown as Account
    render(<ScoreSummaryCard data={buildEvaluationViewData(account)} />)
    expect(screen.getByText(/5 axes sur 5/)).toBeInTheDocument()
  })
})
