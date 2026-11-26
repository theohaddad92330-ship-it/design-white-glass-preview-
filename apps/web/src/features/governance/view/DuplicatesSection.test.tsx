import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * « Doublons à trancher » sur `/contacts` (Louis 14/10/2026, refonte Pilotage
 * L0a : l'onglet Qualité des données est supprimé, le panneau d'arbitrage
 * descend où vivent les contacts). Visible SEULEMENT s'il y a au moins une
 * paire ouverte — on n'affiche pas ce qu'on n'a pas.
 */
const duplicates = vi.fn()
const autoMerged = vi.fn()
vi.mock('../api', () => ({ useDuplicates: () => duplicates(), useAutoMergedDuplicates: () => autoMerged() }))
vi.mock('./DuplicatesPanel', () => ({ DuplicatesPanel: () => <p>Contenu du panneau</p> }))

const { DuplicatesSection } = await import('./DuplicatesSection')

beforeEach(() => {
  duplicates.mockReset()
  autoMerged.mockReset()
  autoMerged.mockReturnValue({ data: [] })
})

describe('DuplicatesSection', () => {
  it('ne rend rien tant qu’aucune paire n’est ouverte', () => {
    duplicates.mockReturnValue({ data: [], isError: false })
    expect(render(<DuplicatesSection />).container).toBeEmptyDOMElement()
  })

  it('ne rend rien pendant le chargement ni en échec — pas de section vide', () => {
    duplicates.mockReturnValue({ data: undefined, isError: false })
    expect(render(<DuplicatesSection />).container).toBeEmptyDOMElement()
    duplicates.mockReturnValue({ data: undefined, isError: true })
    expect(render(<DuplicatesSection />).container).toBeEmptyDOMElement()
  })

  it('annonce « 1 doublon à relire » en bandeau, panneau fermé, sur la bonne ancre', () => {
    duplicates.mockReturnValue({ data: [{ id: 'p1' }], isError: false })
    const { container } = render(<DuplicatesSection />)
    expect(screen.getByText('1 doublon à relire')).toBeInTheDocument()
    expect(screen.queryByText('Contenu du panneau')).toBeNull()
    expect(container.querySelector('#hygiene-doublons')).not.toBeNull()
  })

  it('« Relire les doublons » ouvre le panneau d’arbitrage dans une fenêtre', () => {
    duplicates.mockReturnValue({ data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], isError: false })
    render(<DuplicatesSection />)
    expect(screen.getByText('3 doublons à relire')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Relire les doublons' }))
    expect(screen.getByText('Contenu du panneau')).toBeInTheDocument()
  })

  it('quand seule une fusion automatique existe, le bandeau le dit sans parler de « trancher »', () => {
    duplicates.mockReturnValue({ data: [], isError: false })
    autoMerged.mockReturnValue({ data: [{ id: 'm1' }] })
    const { container } = render(<DuplicatesSection />)
    expect(screen.getByText('Doublons fusionnés')).toBeInTheDocument()
    expect(screen.queryByText(/à relire/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir les fusions' }))
    expect(screen.getByText('Contenu du panneau')).toBeInTheDocument()
    expect(container.querySelector('#hygiene-doublons')).not.toBeNull()
  })

  it('ne rend rien sans paire ouverte ni fusion automatique', () => {
    duplicates.mockReturnValue({ data: [], isError: false })
    autoMerged.mockReturnValue({ data: [] })
    expect(render(<DuplicatesSection />).container).toBeEmptyDOMElement()
    autoMerged.mockReturnValue({ data: undefined })
    expect(render(<DuplicatesSection />).container).toBeEmptyDOMElement()
  })
})
