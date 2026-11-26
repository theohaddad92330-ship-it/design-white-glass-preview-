import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { CandidateRow } from './CandidateRow'

/**
 * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS NOMMÉ, DÈS DÉCOUVRIR, SUR UN
 * CANDIDAT SANS FICHE COMPTE.
 *
 * Louis : « c'est là que ça sert le plus, savoir avant d'analyser si le
 * compte est atteignable en direct. » Avant ce lot, cette information
 * n'existait nulle part avant l'ouverture d'une fiche compte.
 */

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

function mount(c: DiscoverCandidate) {
  return renderWithRouter(
    <CandidateRow
      defaultOpen
      candidate={c}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('CandidateRow (détail) — l’accès nommé sans fiche compte (#2646.1)', () => {
  it('affiche `Rang 3 ou plus` quand un signal d’attribution NOMME un titulaire', async () => {
    mount(
      candidate({
        signals: [{ type: 'award', label: 'Marché attribué', date: '2026-06-01', detail: 'Titulaire : Capgemini' }],
      }),
    )
    expect(await screen.findByText('Rang 3 ou plus')).toBeInTheDocument()
  })

  it('n’affiche RIEN sans signal d’attribution — `inconnu` n’est pas une chance de réussite à afficher partout', async () => {
    mount(candidate({ signals: [] }))
    await screen.findByTestId('candidate-row')
    expect(screen.queryByText('Rang 3 ou plus')).not.toBeInTheDocument()
  })

  it('n’affiche RIEN pour un candidat déjà possédé (`accountId` connu) — la version précise vit sur l’onglet Accès', async () => {
    mount(
      candidate({
        accountId: 'acc-1',
        signals: [{ type: 'award', label: 'Marché attribué', date: '2026-06-01', detail: 'Titulaire : Capgemini' }],
      }),
    )
    await screen.findByTestId('candidate-row')
    expect(screen.queryByText('Rang 3 ou plus')).not.toBeInTheDocument()
  })
})
