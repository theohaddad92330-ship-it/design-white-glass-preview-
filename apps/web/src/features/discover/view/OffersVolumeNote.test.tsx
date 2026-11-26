import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { OffersVolumeNote } from './OffersVolumeNote'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: '47.64Z',
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('OffersVolumeNote (DISCOVER-OFFRES)', () => {
  it('ne rend rien sans volume — jamais « 0 offre »', () => {
    const { container } = render(<OffersVolumeNote candidate={candidate()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('écrit « N offres en France sur 90 jours »', () => {
    render(<OffersVolumeNote candidate={candidate({ offersVolume: { count: 179, windowDays: 90, country: 'FR' } })} />)
    expect(screen.getByText(/179 offres en France sur 90 jours/)).toBeInTheDocument()
  })

  it('met « offre » au singulier pour une seule', () => {
    render(<OffersVolumeNote candidate={candidate({ offersVolume: { count: 1, windowDays: 90, country: 'FR' } })} />)
    expect(screen.getByText(/1 offre en France sur 90 jours/)).toBeInTheDocument()
  })
})
