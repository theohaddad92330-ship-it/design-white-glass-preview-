import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { SimilarityHeadlineNote } from './SimilarityHeadlineNote'

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

/**
 * #2166.11 (épopée #2806) — la référence comparable, en clair sur le résultat
 * compte de Découvrir. Seul `kind: 'sector'` arrive ici (contrat serveur) ; le
 * composant reste défensif sur les deux autres pour ne jamais rendre une
 * phrase muette (`referenceAccount` non porté par `SimilarHeadlineText`).
 */
describe('SimilarityHeadlineNote', () => {
  it('ne rend rien sans similarityHeadline — jamais un texte de repli deviné', () => {
    const { container } = render(<SimilarityHeadlineNote candidate={candidate()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme le compte de référence, en gras, pour un headline « sector »', () => {
    render(
      <SimilarityHeadlineNote
        candidate={candidate({ similarityHeadline: { kind: 'sector', referenceAccount: 'Decathlon' } })}
      />,
    )
    expect(screen.getByText('Decathlon')).toBeInTheDocument()
    expect(screen.getByText(/dans ton portefeuille/i)).toBeInTheDocument()
  })

  it('ne rend rien pour un kind qui n’est pas « sector » — jamais atteignable sur ce chemin, mais défensif', () => {
    const { container } = render(
      <SimilarityHeadlineNote
        candidate={
          candidate({
            similarityHeadline: { kind: 'twin', referenceAccount: 'Decathlon' },
          }) as DiscoverCandidate
        }
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
