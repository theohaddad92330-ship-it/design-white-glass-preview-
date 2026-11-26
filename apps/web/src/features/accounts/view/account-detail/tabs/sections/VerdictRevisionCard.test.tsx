import { render, screen } from '@testing-library/react'
import { VerdictRevisionCard } from './VerdictRevisionCard'

/**
 * #3235 (recette R14 du 15/10) — « pourquoi le verdict a changé » se lit avec le vocabulaire de la
 * Synthèse (RÉSERVE, pas PRUDENT) et ne fait AUCUNE ligne sans verdict précédent.
 */
describe('VerdictRevisionCard — #3235', () => {
  it('nomme l’ancien et le nouveau verdict comme la Synthèse, avec date et causes', () => {
    render(
      <VerdictRevisionCard
        hasObjective
        revision={{
          previousVerdict: 'GO',
          newVerdict: 'PRUDENT',
          changedAt: '2026-10-12T08:00:00Z',
          causes: ['modèle différent'],
        }}
      />,
    )
    const card = screen.getByTestId('verdict-revision')
    expect(card).toHaveTextContent('AGIR MAINTENANT')
    expect(card).toHaveTextContent('RÉSERVE')
    expect(card).not.toHaveTextContent('PRUDENT')
    expect(card).toHaveTextContent('modèle différent')
  })

  it('sans verdict précédent (null) : aucune ligne, rien d’inventé', () => {
    const { container } = render(<VerdictRevisionCard hasObjective revision={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  // #4180 — verdict identique : la fiche le DIT, avec la date depuis laquelle il tient.
  it('verdict identique : « Même verdict depuis le … », sans carte de révision', () => {
    render(<VerdictRevisionCard hasObjective revision={null} unchanged={{ unchangedSince: '2026-09-01T08:00:00Z' }} />)
    expect(screen.getByTestId('verdict-unchanged')).toHaveTextContent(/Même verdict depuis le/)
    expect(screen.queryByTestId('verdict-revision')).not.toBeInTheDocument()
  })

  it('un verdict changé prime : la révision s’affiche, pas « même verdict »', () => {
    render(
      <VerdictRevisionCard
        hasObjective
        revision={{ previousVerdict: 'GO', newVerdict: 'PRUDENT', changedAt: '2026-10-12T08:00:00Z', causes: ['x'] }}
        unchanged={{ unchangedSince: '2026-09-01T08:00:00Z' }}
      />,
    )
    expect(screen.getByTestId('verdict-revision')).toBeInTheDocument()
    expect(screen.queryByTestId('verdict-unchanged')).not.toBeInTheDocument()
  })
})
