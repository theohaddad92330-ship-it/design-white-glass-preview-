import { calibrateDealProbability } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// #4016.1b — la probabilité calibrée vit aussi dans le dossier de l'affaire.
const useProbableQuarter = vi.fn()
vi.mock('./useProbableQuarter', () => ({ useProbableQuarter: () => useProbableQuarter() }))

const { ProjectDealProbability } = await import('./ProjectDealProbability')
const { CalibratedProbabilityBadge } = await import('./CalibratedProbabilityBadge')

const won = { outcome: 'won' as const, highestStage: null }
const calibrated = calibrateDealProbability({
  stage: 'negotiation',
  history: [won, won, won, { outcome: 'lost', highestStage: 'negotiation' }, won],
  shared: null,
})

const quarter = (id: string) => ({
  data: {
    deals: [{ opportunity_id: id, closing_probability: calibrated }],
  },
})

describe('ProjectDealProbability — #4016.1b', () => {
  it('rend la probabilité calibrée complète (chiffre, intervalle, axes) de CETTE affaire', () => {
    useProbableQuarter.mockReturnValue(quarter('p-1'))
    render(<ProjectDealProbability opportunityId="p-1" />)
    expect(screen.getByText('71 %')).toBeInTheDocument()
    expect(screen.getByText(/entre \d+ % et \d+ %/)).toBeInTheDocument()
    expect(screen.getByText(/calibrée sur les issues réelles/i)).toBeInTheDocument()
  })

  it('SAIT DIRE NON : affaire hors du trimestre, ou lecture absente ⇒ aucune ligne', () => {
    useProbableQuarter.mockReturnValue(quarter('p-2'))
    const { container, rerender } = render(<ProjectDealProbability opportunityId="p-1" />)
    expect(container.textContent).toBe('')
    useProbableQuarter.mockReturnValue({ data: undefined })
    rerender(<ProjectDealProbability opportunityId="p-1" />)
    expect(container.textContent).toBe('')
  })

  it('SAIT DIRE NON : une réponse sans `deals` (lecture vide ou dégradée) ne casse PAS le dossier (#4256)', () => {
    // E2E vague 2 : un filet renvoyait `{ items: [], total: 0 }` — `data.deals.find` levait et le
    // dossier se remontait en boucle (bouton « Planifier un entretien » détaché du DOM).
    useProbableQuarter.mockReturnValue({ data: { items: [], total: 0 } })
    const { container } = render(<ProjectDealProbability opportunityId="p-1" />)
    expect(container.textContent).toBe('')
  })
})

describe('CalibratedProbabilityBadge — #4016.1b', () => {
  it('une ligne : le chiffre ET son intervalle', () => {
    const { container } = render(<CalibratedProbabilityBadge probability={calibrated} />)
    expect(container.textContent).toMatch(/71 %\s+entre \d+ % et \d+ %/)
  })

  it('SAIT DIRE NON : non mesuré ⇒ aucune ligne (jamais 0 %) ; chiffre nu ⇒ aucune ligne', () => {
    const vide = calibrateDealProbability({ stage: 'negotiation', history: [], shared: null })
    expect(render(<CalibratedProbabilityBadge probability={vide} />).container.textContent).toBe('')
    const nue = { ...calibrated, axes: [], unevaluable_axes: [] }
    expect(render(<CalibratedProbabilityBadge probability={nue} />).container.textContent).toBe('')
  })
})
