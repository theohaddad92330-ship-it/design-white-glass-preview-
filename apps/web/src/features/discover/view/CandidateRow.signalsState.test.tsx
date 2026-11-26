import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { shiftLocalDays } from '@bellum/contracts'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { label: string; alwaysVisible?: boolean; accountId?: string }) => (
    <span
      data-testid="ask-laura"
      data-always={String(Boolean(props.alwaysVisible))}
      data-account={props.accountId ?? ''}
    >
      {props.label}
    </span>
  ),
}))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
// LUDB.3 — le vocabulaire suit le pack de l'espace (session) ; ici l'espace IT : libellés d'origine.
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))

import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 60,
    scoreMax: 70,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: 'Proposer un renfort DevOps',
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function mount(over: Partial<DiscoverCandidate> = {}, signalsSearching?: boolean) {
  return render(
    <CandidateRow
      candidate={candidate(over)}
      signalsSearching={signalsSearching}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('CandidateRow — #4677 trois états de signaux, jamais confondus', () => {
  it('en cours : la ligne le dit, sans dire « aucun signal »', () => {
    mount({ signalsSearched: false, signalsState: 'pending' })
    expect(screen.getByTestId('candidate-signals-pending')).toBeInTheDocument()
    expect(screen.queryByTestId('candidate-signals-unavailable')).toBeNull()
    expect(screen.queryByText(/aucun signal/i)).toBeNull()
  })
  it('#4677 — la recherche des signaux est FINIE (même sans rien) : la pastille « en cours » disparaît', () => {
    mount({ signalsSearched: false, signalsState: 'pending' }, false)
    expect(screen.queryByTestId('candidate-signals-pending')).toBeNull()
    expect(screen.queryByText(/aucun signal/i)).toBeNull()
  })
  it('source indisponible : sa propre ligne', () => {
    mount({ signalsSearched: false, signalsState: 'unavailable' })
    expect(screen.getByTestId('candidate-signals-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('candidate-signals-pending')).toBeNull()
  })
  it('cherché, rien : « aucun signal mesuré », ni en cours ni indisponible', () => {
    mount({ signalsSearched: true, signalsState: 'none' })
    expect(screen.getByText(/aucun signal mesuré/i)).toBeInTheDocument()
    expect(screen.queryByTestId('candidate-signals-pending')).toBeNull()
  })
  it('jamais ciblée : muette', () => {
    mount({})
    expect(screen.queryByTestId('candidate-signals-pending')).toBeNull()
    expect(screen.queryByTestId('candidate-signals-unavailable')).toBeNull()
  })
})
