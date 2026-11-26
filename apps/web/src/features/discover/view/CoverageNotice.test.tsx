import { render, screen } from '@testing-library/react'
import { CoverageNotice } from './CoverageNotice'
import type { DiscoverCoverage } from '../lib/discover-types'

const coverage = (over: Partial<DiscoverCoverage>): DiscoverCoverage => ({
  candidatesFound: 8,
  resolutionsAttempted: 6,
  resolved: 2,
  rejectedAmbiguous: 0,
  rejectedUnreachable: 0,
  notExamined: 6,
  notIdentifiedNames: [],
  stoppedOn: 'time-budget',
  resolveOffset: 0,
  hasMore: true,
  ...over,
})

// #4319.2 — « Je veux voir la liste » : les noms des entreprises détectées, pas seulement leur nombre.
describe('bandeau de couverture — liste des entreprises détectées', () => {
  it('liste chaque entreprise par son nom', () => {
    render(
      <CoverageNotice
        coverage={coverage({ notIdentifiedNames: ['Acme SA', 'Beta Industrie'], notExamined: 2 })}
        notExamined={null}
        shown={2}
      />,
    )
    const list = screen.getByTestId('coverage-names')
    expect(list).toHaveTextContent('Acme SA')
    expect(list).toHaveTextContent('Beta Industrie')
  })

  it('une liste sans élément ne fait aucune ligne', () => {
    render(<CoverageNotice coverage={coverage({ notIdentifiedNames: [] })} notExamined={null} shown={2} />)
    expect(screen.queryByTestId('coverage-names')).toBeNull()
  })

  it('dit combien d’autres quand la liste est plafonnée', () => {
    render(
      <CoverageNotice
        coverage={coverage({ notIdentifiedNames: ['Acme SA'], notExamined: 4 })}
        notExamined={null}
        shown={2}
      />,
    )
    expect(screen.getByTestId('coverage-names')).toHaveTextContent('et 3 autres')
  })
})
