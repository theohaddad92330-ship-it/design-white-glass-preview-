import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntitiesGraphCard } from './EntitiesGraphCard'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

// #2966 (#2119.64) — « la carte et la liste des périmètres racontent la même
// chose ». `EntityFlowGraph` mesure son conteneur et dessine en absolu : le
// monter pour de vrai en jsdom ne prouverait rien (même choix que
// `RelationFlow.test.tsx`) — on le remplace par un marqueur et on vérifie ce
// qui EST en cause ici : que le TOGGLE bascule bien entre les deux vues, et
// que la carte reçoit les MÊMES entités que la liste, jamais une seconde
// lecture qui pourrait diverger.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes }: { nodes: { data: { name: string } }[] }) => (
    <div data-testid="entity-flow-graph">{nodes.map(node => node.data.name).join(',')}</div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
}))

const ENTITIES = [
  { name: 'Groupe Exemple', type: 'groupe', region: 'France' },
  { name: 'Filiale Exemple', type: 'filiale', region: 'Paris' },
]

describe('EntitiesGraphCard — vue Carte / Liste (#2119.64)', () => {
  it('rend la liste par défaut, jamais la carte', () => {
    render(<EntitiesGraphCard entities={ENTITIES} rootName="EXEMPLE" sites={[]} siteCategoryFilter="all" />)

    expect(screen.getAllByRole('row').length).toBe(ENTITIES.length + 1) // + l'en-tête
    expect(screen.queryByTestId('entity-flow-graph')).not.toBeInTheDocument()
  })

  it('bascule sur la carte au clic, avec EXACTEMENT les périmètres de la liste — jamais une seconde source', () => {
    render(<EntitiesGraphCard entities={ENTITIES} rootName="EXEMPLE" sites={[]} siteCategoryFilter="all" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Carte' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const graph = screen.getByTestId('entity-flow-graph')
    for (const entity of ENTITIES) {
      expect(graph.textContent).toContain(entity.name)
    }
  })

  it('revient à la liste au clic sur « Liste »', () => {
    render(<EntitiesGraphCard entities={ENTITIES} rootName="EXEMPLE" sites={[]} siteCategoryFilter="all" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Carte' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }))

    expect(screen.queryByTestId('entity-flow-graph')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBe(ENTITIES.length + 1)
  })
})
