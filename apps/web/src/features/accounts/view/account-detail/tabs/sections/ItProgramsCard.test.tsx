import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItProgramsCard } from './ItProgramsCard'

describe('ItProgramsCard', () => {
  it('renders nothing when the analysis named no programme', () => {
    const { container } = render(<ItProgramsCard programs={[]} analyzedAt={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * Le motif de ce chantier : le nom SEUL était déjà exporté au PDF. Ce qui
   * n'existait nulle part, c'est l'entité qui porte le programme, son budget et
   * sa description — la matière qui fait d'un nom un point d'entrée.
   */
  it('shows the bearer entity, the budget and the description of a programme', () => {
    render(
      <ItProgramsCard
        programs={[
          {
            name: 'Plan stratégique 2029',
            entity: 'Société Générale',
            budget: '400 M€',
            description: 'Plan pluriannuel annoncé pour la fin 2026.',
          },
        ]}
        analyzedAt={null}
      />,
    )
    expect(screen.getByText('Plan stratégique 2029')).toBeInTheDocument()
    expect(screen.getByText(/Société Générale/)).toBeInTheDocument()
    expect(screen.getByText(/400 M€/)).toBeInTheDocument()
    expect(screen.getByText('Plan pluriannuel annoncé pour la fin 2026.')).toBeInTheDocument()
  })

  /** « Non mesuré » n'est jamais « 0 » : un budget absent se DIT. */
  // #2613 — un budget non renseigné ne fait plus de ligne « non renseigné » :
  // il se tait. L'entité, hors de ce lot, reste nommée.
  it('drops the budget line instead of naming it unknown', () => {
    render(
      <ItProgramsCard
        programs={[{ name: 'Socle data', entity: null, budget: null, description: null }]}
        analyzedAt={null}
      />,
    )
    expect(screen.getByText('Entité porteuse non précisée')).toBeInTheDocument()
    expect(screen.queryByText('Budget non renseigné')).not.toBeInTheDocument()
  })

  /** Un programme sans nom n'est pas un programme — il est ignoré, pas rendu vide. */
  it('drops entries the analysis left unnamed', () => {
    const { container } = render(
      <ItProgramsCard programs={[{ name: null, entity: 'X', budget: null, description: null }]} analyzedAt={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('carries the provenance of the analysis', () => {
    render(
      <ItProgramsCard
        programs={[{ name: 'Socle data', entity: null, budget: null, description: null }]}
        analyzedAt="2026-08-30T09:00:00.000Z"
      />,
    )
    expect(screen.getByText(/calculé par l.analyse/)).toBeInTheDocument()
    // R15-10 — le format de la date de provenance est décidé par la primitive
    // `Provenance` seule, depuis qu'elle formate elle-même (« 30 août 2026 »).
    expect(screen.getByText(/30 août 2026/)).toBeInTheDocument()
  })

  /** #3677.7 — objectif, périmètre documenté et horizon : affichés SEULEMENT quand la source les porte. */
  it('#3677.7 shows objective, documented scope and horizon when present, and nothing when absent', () => {
    render(
      <ItProgramsCard
        programs={[
          {
            name: 'Plan stratégique 2029',
            entity: 'Société Générale',
            objective: 'Réduire le coût d’exploitation du SI',
            scope: 'Banque de détail France',
            horizon: '2029',
          },
          { name: 'Programme Socle', entity: 'DSI groupe' },
        ]}
        analyzedAt={null}
      />,
    )
    expect(screen.getByText(/Objectif : Réduire le coût d’exploitation du SI/)).toBeInTheDocument()
    expect(screen.getByText(/Périmètre : Banque de détail France/)).toBeInTheDocument()
    expect(screen.getByText(/Horizon : 2029/)).toBeInTheDocument()
    // Un programme sans ces champs ne fait AUCUNE ligne « non renseigné » : 1 seul de chaque.
    expect(screen.getAllByText(/Objectif :/)).toHaveLength(1)
    expect(screen.getAllByText(/Horizon :/)).toHaveLength(1)
  })
})
