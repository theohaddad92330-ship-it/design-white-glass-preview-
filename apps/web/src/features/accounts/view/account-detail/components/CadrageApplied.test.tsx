import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CadrageApplied } from './CadrageApplied'

const runs = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({ data: runs.value }),
}))

/**
 * Cadrage analyse (15/10, décision D) — le dossier livré dit en tête, en UNE
 * ligne, ce que le cadrage du dernier run a filtré et classé.
 */
describe('CadrageApplied', () => {
  beforeEach(() => window.localStorage.clear())

  it('nomme chaque paramètre posé ET ce qu’il a fait', () => {
    runs.value = [
      {
        id: 'r2',
        scope_selection: {
          geo_perimeter: 'city',
          geo_areas: ['Lyon'],
          excluded_entities: ['Siemens Healthineers'],
          business_families: ['Cyber'],
          hierarchy_levels: ['n2', 'n1'],
          depth: 'deep',
        },
      },
      { id: 'r1', scope_selection: null },
    ]
    render(<CadrageApplied accountId="acc-1" />)
    const line = screen.getByRole('note')
    expect(line).toHaveTextContent(/^Cadrage appliqué :/)
    expect(line).toHaveTextContent('Ville / site · Lyon — entités, signaux et contacts filtrés')
    expect(line).toHaveTextContent('Exclu : Siemens Healthineers — retiré du dossier')
    expect(line).toHaveTextContent('Postes à placer : Cyber — recrutements filtrés, contacts classés')
    expect(line).toHaveTextContent('Niveau : Manager › Direction locale — contacts classés')
  })

  // Théo B r1-recherche.N6 — le cadrage conservé accompagne le dossier : objectifs choisis puis angle, en tête.
  it('N6 — nomme les objectifs choisis et l’angle, avant ce qu’ils ont filtré', () => {
    runs.value = [
      {
        id: 'r3',
        scope_selection: {
          objectives: ['open_account', 'find_decision_makers'],
          angle: 'Placer deux profils Data',
          geo_perimeter: 'france',
        },
      },
    ]
    render(<CadrageApplied accountId="acc-1" />)
    const line = screen.getByRole('note')
    expect(line).toHaveTextContent('Objectifs : Ouvrir ce compte, Trouver les décideurs')
    expect(line).toHaveTextContent('Angle : Placer deux profils Data')
    expect(line.textContent!.indexOf('Objectifs')).toBeLessThan(line.textContent!.indexOf('France'))
  })

  it('un run d’avant la feature, ou sans cadrage, n’affiche RIEN (on n’affiche pas ce qu’on n’a pas)', () => {
    runs.value = [{ id: 'r1', scope_selection: { depth: 'quick' } }]
    const { container } = render(<CadrageApplied accountId="acc-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('aucun run : rien', () => {
    runs.value = []
    const { container } = render(<CadrageApplied accountId="acc-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  // Théo B r1-recherche.N6 — « Voir le cadrage / Masquer ce rappel ».
  describe('Voir le cadrage / Masquer ce rappel', () => {
    const run = (id: string) => ({
      id,
      scope_selection: { objectives: ['open_account'], geo_perimeter: 'france', excluded_entities: ['Natixis'] },
    })

    it('« Voir le cadrage » déplie chaque réglage sur sa ligne, « Masquer le détail » le replie', () => {
      runs.value = [run('r1')]
      render(<CadrageApplied accountId="acc-1" />)
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Voir le cadrage' }))
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'Masquer le détail' }))
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('« Masquer ce rappel » le retire pour ce run, et une nouvelle analyse le ramène', () => {
      runs.value = [run('r1')]
      const { container, unmount } = render(<CadrageApplied accountId="acc-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Masquer ce rappel' }))
      expect(container).toBeEmptyDOMElement()
      unmount()
      render(<CadrageApplied accountId="acc-1" />)
      expect(screen.queryByRole('note')).not.toBeInTheDocument()
      unmount()
      runs.value = [run('r2')]
      render(<CadrageApplied accountId="acc-1" />)
      expect(screen.getByRole('note')).toBeInTheDocument()
    })

    it('sait dire NON : sans cadrage, aucun bouton', () => {
      runs.value = [{ id: 'r1', scope_selection: null }]
      const { container } = render(<CadrageApplied accountId="acc-1" />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
