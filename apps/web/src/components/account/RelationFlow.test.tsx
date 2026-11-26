import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RelationFlow } from './RelationFlow'

// React Flow mesure son conteneur et dessine en absolu : le monter pour de vrai
// en jsdom ne prouverait rien sur la hauteur. On le remplace donc par un marqueur
// et on inspecte ce qui EST en cause ici — le conteneur qui l'enveloppe.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

const PERSON = { id: 'p1', name: 'Hélène Garreau', title: 'Responsable Qualité', entity: 'Altiver', role: null }

describe('RelationFlow', () => {
  it('garantit une hauteur au graphe — sans plancher, la carte s’affiche VIDE', () => {
    // Le bug réel : l'onglet « Relations » d'une fiche contact ne fixe aucune
    // hauteur. Le conteneur valait `h-full` seul, donc 0 px : les relations
    // étaient bien en base et l'écran montrait un rectangle vide. Rien ne
    // plantait, aucun test ne tombait — ça ne se voyait qu'à l'écran.
    const { container } = render(<RelationFlow root={PERSON} levels={[[{ ...PERSON, id: 'p2', name: 'Pierre' }]]} />)

    const wrapper = screen.getByTestId('react-flow').parentElement!
    expect(wrapper.className).toMatch(/min-h-\[/)
    expect(container.querySelector('[data-testid="react-flow"]')).not.toBeNull()
  })
})
