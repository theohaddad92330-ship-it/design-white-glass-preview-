import type { AccountVariationSignal } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { AccountVariationSignalsCard } from './AccountVariationSignalsCard'

const base = { windowDays: 30, compare: 'previous_period', asOf: '2026-10-15', source: 'job_offers' } as const

const SIGNALS: AccountVariationSignal[] = [
  { key: 'job_offers_mom', status: 'measured', current: 4, previous: 3, delta: 1, changePct: 33.3, base },
  { key: 'headcount_6m', status: 'not_measured', reason: 'no_history', source: 'registry_headcount' },
  {
    key: 'public_awards_12m',
    status: 'measured',
    current: 0,
    previous: 0,
    delta: 0,
    changePct: null,
    base: { ...base, windowDays: 365, source: 'public_awards' },
  },
  { key: 'it_moves_6m', status: 'not_measured', reason: 'source_not_read', source: 'contact_enrichment' },
]

// #3920.10 (Louis 15/10) — quatre signaux datés ; inconnu = « non mesuré », jamais 0.
describe('AccountVariationSignalsCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre la valeur, le pourcentage et la base datée d’un signal mesuré', () => {
    render(<AccountVariationSignalsCard signals={SIGNALS} />)
    const row = screen.getByTestId('variation-job_offers_mom')
    expect(row).toHaveTextContent('4 (contre 3 avant)')
    expect(row).toHaveTextContent('+33 %')
    expect(row).toHaveTextContent('2026-10-15')
  })

  // #3711.17 (décision Louis 17/10, recette R41 EDF : 4 « Non mesuré » hors score) — une absence ne fait AUCUNE ligne.
  it('un signal non mesuré ne fait AUCUNE ligne — ni « Non mesuré », ni sa raison, ni 0', () => {
    render(<AccountVariationSignalsCard signals={SIGNALS} />)
    expect(screen.queryByTestId('variation-headcount_6m')).toBeNull()
    expect(screen.queryByTestId('variation-it_moves_6m')).toBeNull()
    expect(screen.getByTestId('variation-signals').textContent).not.toMatch(/non mesuré/i)
  })

  it('aucun signal mesuré : le bloc entier se tait (une phrase d’absence serait la même absence)', () => {
    const none: AccountVariationSignal[] = [
      { key: 'headcount_6m', status: 'not_measured', reason: 'no_history', source: 'registry_headcount' },
      { key: 'it_moves_6m', status: 'not_measured', reason: 'source_not_read', source: 'contact_enrichment' },
    ]
    const { container } = render(<AccountVariationSignalsCard signals={none} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un vrai zéro mesuré reste 0, sans pourcentage inventé', () => {
    render(<AccountVariationSignalsCard signals={SIGNALS} />)
    const row = screen.getByTestId('variation-public_awards_12m')
    expect(row).toHaveTextContent('0 (contre 0 avant)')
    expect(row.textContent).not.toContain('%')
  })

  it('façade non montée : rien', () => {
    const { container } = render(<AccountVariationSignalsCard signals={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
