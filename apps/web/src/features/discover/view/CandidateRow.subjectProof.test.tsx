/**
 * #4285.1 (recette prod 26/10) — la carte REPLIÉE lisait « Levée de fonds : 12 M€ · série B » sans date ni lien :
 * l'un et l'autre n'existaient que dans l'Aperçu ouvert au clic. Le sujet porte maintenant sa date et son lien ;
 * sans URL, aucun lien (rien d'inventé).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

function candidate(url?: string): DiscoverCandidate {
  return {
    name: 'Askelia',
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
    signals: [
      { type: 'funding' as const, label: 'Levée de fonds : 12 M€ · série B', date: dayAgo(3), ...(url ? { url } : {}) },
    ],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
  }
}

const renderRow = (c: DiscoverCandidate) =>
  render(
    <CandidateRow
      candidate={c}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )

describe('#4285.1 — le sujet de la carte repliée porte sa date et son lien', () => {
  it('une levée avec URL : la date et « Voir la source » sont SUR la carte', () => {
    renderRow(candidate('https://askelia.example/actualites/levee'))
    const proof = screen.getByTestId('candidate-subject-proof')
    expect(proof.querySelector('time')).not.toBeNull()
    const link = within(proof).getByRole('link')
    expect(link).toHaveAttribute('href', 'https://askelia.example/actualites/levee')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sait dire NON : une levée sans URL connue a sa date mais AUCUN lien factice', () => {
    renderRow(candidate())
    const proof = screen.getByTestId('candidate-subject-proof')
    expect(proof.querySelector('time')).not.toBeNull()
    expect(within(proof).queryByRole('link')).toBeNull()
  })
})
