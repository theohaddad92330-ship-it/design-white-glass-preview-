import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GroupedTabNav } from '@bellum/ui'

/**
 * #1831 — un groupe d'onglets à UN SEUL membre coûtait un clic pour rien : il
 * fallait ouvrir un menu pour révéler son unique destination. Ces tests
 * tiennent les deux moitiés de la règle :
 *
 *  1. un groupe à un membre navigue DIRECTEMENT, porte le libellé de
 *     l'ONGLET (pas du groupe), et ne montre ni chevron ni `aria-haspopup` ;
 *  2. un groupe à PLUSIEURS membres — le cas que ce composant tenait déjà —
 *     continue de se comporter EXACTEMENT comme avant. C'est le témoin : une
 *     garde qui ne prouve pas qu'elle épargne le cas voisin n'est pas une
 *     garde.
 *
 * ⚠️ Ce fichier a d'abord été écrit dans `packages/ui`, qui n'a AUCUN
 * exécuteur de test — ni `vitest`, ni `@testing-library/react`, ni config, et
 * zéro fichier `*.test.*` dans tout l'historique du dépôt. Une garde qui ne
 * peut pas s'exécuter ne garde rien : il vit donc ici, dans `apps/web`, qui
 * monte déjà `GroupedTabNav` depuis `@bellum/ui` et dont la suite tourne en
 * CI. Déplacé plutôt que réécrit — le test était juste, c'est son adresse qui
 * ne l'était pas.
 */

const SINGLE_GROUP = [{ key: 'open', label: 'Ouvrir' }]
const SINGLE_TABS = [{ key: '/missions/nouvelle', label: 'Nouvelle mission', group: 'open' }]

const MULTI_GROUPS = [
  { key: 'pilot', label: 'Piloter' },
  { key: 'cash', label: 'Encaisser' },
]
const MULTI_TABS = [
  { key: '/missions', label: 'Missions', group: 'pilot' },
  { key: '/missions/board', label: 'Board', group: 'pilot' },
  { key: '/missions/facturation', label: 'Facturation', group: 'cash' },
  { key: '/missions/paiements', label: 'Paiements', group: 'cash' },
]

describe('GroupedTabNav — un groupe à un seul membre est un bouton', () => {
  it('rend un bouton de navigation directe portant le libellé de l’ONGLET, pas du groupe', () => {
    const onTabChange = vi.fn()
    render(<GroupedTabNav groups={SINGLE_GROUP} tabs={SINGLE_TABS} activeTab="/missions" onTabChange={onTabChange} />)
    // Le bouton affiche « Nouvelle mission » (le libellé de l'ONGLET) —
    // jamais « Ouvrir » (le libellé du groupe), qui serait un doublon muet.
    expect(screen.getByRole('button', { name: 'Nouvelle mission' })).toBeInTheDocument()
    expect(screen.queryByText('Ouvrir')).not.toBeInTheDocument()
  })

  it('n’a ni chevron ni aria-haspopup — il n’y a rien à déplier', () => {
    render(<GroupedTabNav groups={SINGLE_GROUP} tabs={SINGLE_TABS} activeTab="/missions" onTabChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Nouvelle mission' })
    expect(button).not.toHaveAttribute('aria-haspopup')
    expect(button.querySelector('svg')).not.toBeInTheDocument()
  })

  it('navigue DIRECTEMENT au clic — aucun menu ne s’ouvre avant', () => {
    const onTabChange = vi.fn()
    render(<GroupedTabNav groups={SINGLE_GROUP} tabs={SINGLE_TABS} activeTab="/missions" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle mission' }))
    expect(onTabChange).toHaveBeenCalledWith('/missions/nouvelle')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('GroupedTabNav — témoin : un groupe à PLUSIEURS membres est inchangé', () => {
  it('reste un bouton à menu — aria-haspopup, chevron, et le libellé du GROUPE', () => {
    render(<GroupedTabNav groups={MULTI_GROUPS} tabs={MULTI_TABS} activeTab="/missions" onTabChange={vi.fn()} />)
    const pilot = screen.getByRole('button', { name: /Piloter/ })
    expect(pilot).toHaveAttribute('aria-haspopup', 'menu')
    expect(pilot.querySelector('svg')).toBeInTheDocument()
  })

  it('ouvre son menu au clic, et navigue au clic d’un membre', () => {
    const onTabChange = vi.fn()
    render(<GroupedTabNav groups={MULTI_GROUPS} tabs={MULTI_TABS} activeTab="/missions" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Encaisser/ }))
    const item = screen.getByRole('menuitem', { name: 'Paiements' })
    fireEvent.click(item)
    expect(onTabChange).toHaveBeenCalledWith('/missions/paiements')
  })

  it('nomme l’écran ouvert À CÔTÉ du libellé du groupe', () => {
    render(
      <GroupedTabNav groups={MULTI_GROUPS} tabs={MULTI_TABS} activeTab="/missions/facturation" onTabChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /Encaisser/ })).toHaveTextContent('Facturation')
  })
})
