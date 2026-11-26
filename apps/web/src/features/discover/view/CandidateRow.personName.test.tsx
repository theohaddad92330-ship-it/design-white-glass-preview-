import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { normalizeDiscoverResponse } from '@/features/discover/lib/discover-normalize'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

/**
 * #4626 — l'APPELANT, pas la fonction : la charge utile telle que l'IA la rend (`candidate["qualification"]`) traverse
 * le normaliseur puis la carte MONTÉE. Un test du seul `PersonNameMark` a déjà conclu « déjà là » sur un écran muet.
 */
function rowFor(qualification: Record<string, unknown>, name = 'BEN HRIZ AYA'): DiscoverCandidate {
  const response = normalizeDiscoverResponse({
    candidates: [
      {
        name,
        siren: '123456789',
        sector: 'Conseil en systèmes et logiciels informatiques',
        city: 'PARIS',
        department: '75',
        score: 40,
        scoreMax: 100,
        qualification,
      },
    ],
  })
  const [candidate] = response.candidates
  if (!candidate) throw new Error('no candidate')
  return candidate
}

function renderRow(candidate: DiscoverCandidate) {
  render(
    <CandidateRow
      candidate={candidate}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('CandidateRow — nom de personne (#4626)', () => {
  it('une personne NON prouvée garde sa ligne, motif affiché sur la carte', () => {
    renderRow(rowFor({ verdict: 'to_verify', code: 'person_like_name', reason: 'x', otherCodes: [] }))
    expect(screen.getByText('BEN HRIZ AYA')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-person-name')).toHaveTextContent('Nom de personne')
  })

  it('le motif n’est pas toujours le premier doute : il se dit quand même', () => {
    renderRow(
      rowFor(
        { verdict: 'to_verify', code: 'no_employees', reason: 'x', otherCodes: ['person_like_name'] },
        'BEN MECHLIA AYMEN',
      ),
    )
    expect(screen.getByTestId('candidate-person-name')).toBeInTheDocument()
  })

  it('sait dire NON : une société recommandée ou un autre doute ne porte pas le repère', () => {
    renderRow(rowFor({ verdict: 'recommended', code: null, reason: 'ok', otherCodes: [] }, 'IA DATA'))
    expect(screen.queryByTestId('candidate-person-name')).toBeNull()
  })
})
