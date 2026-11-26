import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuditDirectionAndRoadmap } from './AuditDirectionAndRoadmap'

/**
 * #2061.15 / #2061.18 / #2061.20 — réouverture du 24/09/2026.
 *
 * Ces tests distinguent les trois états possibles de la roadmap/questions —
 * `null` (aucun profil), `[]` (profil mesuré, aucune tension) et la liste
 * remplie — jamais la même phrase pour les deux premiers.
 */
describe('AuditDirectionAndRoadmap — #2061.15 / #2061.18 / #2061.20', () => {
  it('NOMME l’absence des trois blocs quand rien n’est établi', () => {
    render(<AuditDirectionAndRoadmap recommendedDirection={null} conditionalRoadmap={null} questionsToRevisit={null} />)
    expect(screen.getByText(/Aucune direction n’a encore pu être recommandée/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune feuille de route conditionnelle/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune question à revisiter : ton profil/)).toBeInTheDocument()
  })

  it('distingue `[]` (mesuré, aucune tension) de `null` (aucun profil) sur la roadmap et les questions', () => {
    render(<AuditDirectionAndRoadmap recommendedDirection={null} conditionalRoadmap={[]} questionsToRevisit={[]} />)
    expect(screen.getByText(/Aucune tension détectée pour l’instant : rien à conditionner/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune tension détectée pour l’instant : aucune question à revisiter/)).toBeInTheDocument()
  })

  it('rend la direction recommandée, avec sa raison', () => {
    render(
      <AuditDirectionAndRoadmap
        recommendedDirection={{
          label: 'Resserrer la liste des secteurs prioritaires à 3 au maximum pour ce trimestre.',
          rationale: 'Plus de 3 secteurs visés à la fois, pour une seule activité commerciale.',
          confidence: 'deduced',
        }}
        conditionalRoadmap={null}
        questionsToRevisit={null}
      />,
    )
    const block = screen.getByTestId('audit-recommended-direction')
    expect(block).toHaveTextContent('Resserrer la liste des secteurs prioritaires')
    expect(block).toHaveTextContent('Plus de 3 secteurs visés à la fois')
  })

  it('rend chaque ligne de la roadmap conditionnelle comme un couple condition/geste', () => {
    render(
      <AuditDirectionAndRoadmap
        recommendedDirection={null}
        conditionalRoadmap={[
          {
            condition: 'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
            then: 'Resserrer la liste des secteurs prioritaires à 3 au maximum pour ce trimestre.',
          },
        ]}
        questionsToRevisit={null}
      />,
    )
    const list = screen.getByTestId('audit-conditional-roadmap')
    expect(list).toHaveTextContent('Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?')
    expect(list).toHaveTextContent('Resserrer la liste des secteurs prioritaires à 3 au maximum pour ce trimestre.')
  })

  it('rend chaque question à revisiter', () => {
    render(
      <AuditDirectionAndRoadmap
        recommendedDirection={null}
        conditionalRoadmap={null}
        questionsToRevisit={['Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?']}
      />,
    )
    expect(screen.getByTestId('audit-questions-to-revisit')).toHaveTextContent(
      'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
    )
  })
})
