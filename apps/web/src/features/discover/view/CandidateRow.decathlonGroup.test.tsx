/**
 * Lot T point 2b (recette prod 01/11) — la réponse RÉELLE de « Decathlon » : DECATHLON (tête, 306138900) et DECATHLON
 * FRANCE (membre, headSiren 306138900). Deux candidats ⇒ UNE tête avec son membre dépliable ; si seul le membre passe
 * les filtres web, il se dit « fait partie du groupe DECATHLON » (la tête n'est plus masquée en silence).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { collapseBrandMembers } from '@/features/discover/lib/discover-brand-group'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

function base(over: Partial<DiscoverCandidate>): DiscoverCandidate {
  return {
    name: 'X',
    siren: '1',
    nafCode: '47.64Z',
    sector: null,
    city: 'VILLENEUVE-D’ASCQ',
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
    ...over,
  }
}

// Les deux candidats de la réponse limit 25 capturée en prod.
const HEAD = base({
  name: 'DECATHLON',
  siren: '306138900',
  brandGroup: { role: 'head', members: [{ siren: '500569405', name: 'DECATHLON FRANCE' }] },
})
const MEMBER = base({
  name: 'DECATHLON FRANCE',
  siren: '500569405',
  brandGroup: { role: 'member', headSiren: '306138900', headName: 'DECATHLON' },
})

function renderRow(c: DiscoverCandidate) {
  render(
    <CandidateRow
      candidate={c}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('Decathlon — le JSON exact de la recherche', () => {
  it('2 candidats ⇒ 1 tête portant « + 1 entité du groupe »', () => {
    const shown = collapseBrandMembers([HEAD, MEMBER])
    expect(shown.map(c => c.siren)).toEqual(['306138900'])
    renderRow(shown[0] as DiscoverCandidate)
    expect(screen.getByTestId('candidate-brand-members').textContent).toContain('1')
    expect(screen.getByTestId('candidate-brand-member').textContent).toContain('DECATHLON FRANCE')
  })

  it('seul le membre passe les filtres : il dit « fait partie du groupe DECATHLON »', () => {
    const shown = collapseBrandMembers([MEMBER])
    expect(shown).toHaveLength(1)
    renderRow(shown[0] as DiscoverCandidate)
    expect(screen.getByTestId('candidate-brand-member-of').textContent).toContain('DECATHLON')
  })

  it('une tête n’affiche pas « fait partie du groupe »', () => {
    renderRow(HEAD)
    expect(screen.queryByTestId('candidate-brand-member-of')).toBeNull()
  })
})
