import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

const base = {
  name: 'ACME',
  siren: '552100554',
  nafCode: null,
  sector: null,
  city: null,
  department: null,
  headcountRange: null,
  creationDate: null,
  establishmentCount: null,
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
} as DiscoverCandidate

const skillEvidence = {
  skill: 'java',
  offerCount: 2,
  offers: [
    { title: 'Senior Java Software Engineer', city: 'Lille', date: '2026-10-12', url: 'https://offres.example.org/a' },
    { title: 'Dev Java', url: 'https://offres.example.org/b' },
  ],
  latestOffer: {
    title: 'Senior Java Software Engineer',
    city: 'Lille',
    date: '2026-10-12',
    url: 'https://offres.example.org/a',
    source: null,
  },
}

// #4663 — la preuve d'offre se lit SUR la carte, sans ouvrir le tiroir « Aperçu du compte ».
describe('CandidateRow — la preuve d’offre sur la carte', () => {
  const noop = vi.fn()
  const props = { isFollowed: false, onToggleFollow: noop, onDismiss: noop, onAnalyze: noop }

  it('une carte trouvée par ses offres dit « N offres java » et lie la plus récente, tiroir fermé', () => {
    render(<CandidateRow candidate={{ ...base, skillEvidence }} {...props} />)
    const line = screen.getByTestId('skill-evidence')
    expect(within(line).getByText(/2 offres java/)).toBeInTheDocument()
    expect(within(line).getByRole('link', { name: /Senior Java Software Engineer/ })).toHaveAttribute(
      'href',
      'https://offres.example.org/a',
    )
    expect(screen.queryByTestId('skill-evidence-offers')).toBeNull()
  })

  it('un compte sans preuve d’offre ne fait aucune ligne', () => {
    render(<CandidateRow candidate={base} {...props} />)
    expect(screen.queryByTestId('skill-evidence')).toBeNull()
  })
})

// #4706.2 — la base de la zone (siège / implantation) se lit SUR la carte : le filtre posé est vérifiable à l'œil.
describe('CandidateRow — la base de la zone sur la carte', () => {
  const noop = vi.fn()
  const props = { isFollowed: false, onToggleFollow: noop, onDismiss: noop, onAnalyze: noop }

  it('une implantation dit « implantée dans la zone », tiroir fermé', () => {
    const geography = {
      basis: 'establishment' as const,
      headquarters: { city: 'PARIS', department: '75' },
      siteCount: 1,
      sites: [],
      zoneRegion: null,
    }
    render(<CandidateRow candidate={{ ...base, geography }} {...props} />)
    const line = screen.getByTestId('candidate-geography')
    expect(line).toHaveTextContent(/Siège à Paris \(75\)/)
    expect(line).toHaveTextContent(/implantée dans la zone/)
  })

  it('un siège dans la zone se dit siège', () => {
    const geography = {
      basis: 'headquarters' as const,
      headquarters: { city: 'NEUILLY-SUR-SEINE', department: '92' },
      siteCount: 0,
      sites: [],
      zoneRegion: null,
    }
    render(<CandidateRow candidate={{ ...base, geography }} {...props} />)
    expect(screen.getByTestId('candidate-geography')).toHaveTextContent(
      /Siège à Neuilly-Sur-Seine \(92\), dans la zone/,
    )
  })

  it('sans preuve du registre, aucune ligne (on n’affiche pas ce qu’on n’a pas)', () => {
    render(<CandidateRow candidate={base} {...props} />)
    expect(screen.queryByTestId('candidate-geography')).toBeNull()
  })
})
