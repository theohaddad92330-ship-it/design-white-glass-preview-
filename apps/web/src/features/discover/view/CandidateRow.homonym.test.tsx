import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

const candidate = {
  name: 'PREVOIR',
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

// #3819.11 / #3901.9 — deux sociétés privées au même nom : la carte NOMME l'ambiguïté, sans en choisir une.
describe('CandidateRow — homonyme possible', () => {
  const noop = vi.fn()
  const props = { isFollowed: false, onToggleFollow: noop, onDismiss: noop, onAnalyze: noop }

  it('nomme les deux SIREN', () => {
    render(<CandidateRow candidate={candidate} {...props} homonymSirens={['440123456']} />)
    expect(screen.getByTestId('candidate-homonym').textContent).toBe('Homonyme possible : 552 100 554 / 440 123 456')
  })

  it('aucun homonyme : aucune ligne', () => {
    render(<CandidateRow candidate={candidate} {...props} />)
    expect(screen.queryByTestId('candidate-homonym')).toBeNull()
  })
})
