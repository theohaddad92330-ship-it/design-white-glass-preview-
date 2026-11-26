import type { OfferProposal } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfferRecommendationsCard } from './OfferRecommendationsCard'

describe('OfferRecommendationsCard', () => {
  it('frames the duration / staffing / TJM chips as Bellum estimates, not retrieved facts (Théo p15 §1)', () => {
    const offers: OfferProposal[] = [
      {
        title: 'Coaching agile pilote',
        pitch: 'Atelier de cadrage produit',
        estimated_duration: '3-4 semaines',
        estimated_team_size: '1-2 consultants',
        estimated_tjm: '700-850 EUR/jour',
      },
    ]

    render(<OfferRecommendationsCard offers={offers} />)

    // The estimated values are still shown verbatim…
    expect(screen.getByText('3-4 semaines')).toBeInTheDocument()
    expect(screen.getByText('700-850 EUR/jour')).toBeInTheDocument()
    // …but they carry an honest "these are Bellum estimates" framing (FR default in tests).
    expect(screen.getAllByText('Estimations Bellum').length).toBeGreaterThan(0)
  })

  it('omits the estimate framing when an offer carries no duration / staffing / TJM (present-only, nothing invented)', () => {
    const offers: OfferProposal[] = [{ title: 'Cadrage', pitch: 'Atelier de cadrage' }]

    render(<OfferRecommendationsCard offers={offers} />)

    expect(screen.getByText('Cadrage')).toBeInTheDocument()
    expect(screen.queryByText('Estimations Bellum')).not.toBeInTheDocument()
  })
})
