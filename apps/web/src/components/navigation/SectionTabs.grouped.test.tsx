import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GroupedTabNav } from '@bellum/ui'

/**
 * LA BARRE GROUPÉE (option B, tranchée par Louis le 01/09/2026).
 *
 * « Les onglets sont super moches, et dans des cas comme Missions on a une
 * barre d'onglets infinie. » Treize onglets débordaient ; deux d'entre eux
 * sortaient du champ sans que rien ne dise qu'ils existaient.
 *
 * Ce que ces tests tiennent, et qui est le cœur du choix : la barre montre les
 * GROUPES et rien d'autre — donc sa largeur ne dépend plus du nombre d'écrans —
 * et le groupe actif NOMME l'écran ouvert, sans quoi on ne saurait plus où l'on
 * est en refermant un menu.
 */

const GROUPS = [
  { key: 'pilot', label: 'Piloter' },
  { key: 'produce', label: 'Produire' },
  { key: 'cash', label: 'Encaisser' },
]

const TABS = [
  { key: '/missions', label: 'Missions', group: 'pilot' },
  { key: '/missions/board', label: 'Board', group: 'pilot' },
  { key: '/missions/cra', label: 'Relevés d’activité', group: 'produce' },
  { key: '/missions/facturation', label: 'Facturation', group: 'cash' },
  { key: '/missions/paiements', label: 'Paiements', group: 'cash' },
]

function renderBar(active = '/missions', onTabChange = vi.fn()) {
  render(<GroupedTabNav groups={GROUPS} tabs={TABS} activeTab={active} onTabChange={onTabChange} />)
  return onTabChange
}

describe('GroupedTabNav — la barre porte les moments, pas les écrans', () => {
  it('ne rend QUE les groupes : sa largeur ne dépend plus du nombre d’écrans', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /Piloter/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Encaisser/ })).toBeInTheDocument()
    // Les écrans d'un groupe fermé ne sont pas dans la barre.
    expect(screen.queryByRole('menuitem', { name: 'Paiements' })).not.toBeInTheDocument()
  })

  it('le groupe actif NOMME l’écran ouvert — sinon on ne sait plus où l’on est', () => {
    renderBar('/missions/facturation')
    expect(screen.getByRole('button', { name: /Encaisser/ })).toHaveTextContent('Facturation')
    // Et lui seul : deux groupes qui nomment un écran voudraient dire deux écrans ouverts.
    expect(screen.getByRole('button', { name: /Piloter/ })).not.toHaveTextContent('Missions')
  })

  it('ouvre les écrans de son groupe, et navigue au clic', () => {
    const onTabChange = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Encaisser/ }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByRole('menuitem', { name: 'Facturation' })).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Paiements' })).toBeInTheDocument()

    fireEvent.click(menu.getByRole('menuitem', { name: 'Paiements' }))
    expect(onTabChange).toHaveBeenCalledWith('/missions/paiements')
  })

  it('n’ouvre qu’UN menu à la fois', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Piloter/ }))
    fireEvent.click(screen.getByRole('button', { name: /Encaisser/ }))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  it('referme le menu à la touche Échap — un menu ouvert masque le contenu', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Piloter/ }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marque l’écran ouvert DANS son menu — le rouvrir doit dire où l’on est', () => {
    renderBar('/missions/paiements')
    fireEvent.click(screen.getByRole('button', { name: /Encaisser/ }))
    expect(screen.getByRole('menuitem', { name: 'Paiements' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('menuitem', { name: 'Facturation' })).toHaveAttribute('aria-current', 'false')
  })

  /**
   * #1831 — la barre porte désormais DEUX formes, et « aucun écran perdu »
   * doit valoir pour les deux : un groupe à PLUSIEURS membres garde son menu,
   * un groupe à UN SEUL membre se rend en bouton direct qui porte le libellé
   * de l'ONGLET (ici « Relevés d'activité », pas « Produire »).
   *
   * Ce test comptait auparavant les seuls `menuitem`, donc il aurait déclaré
   * l'onglet unique PERDU alors qu'il est devenu plus accessible qu'avant.
   * Le corriger en donnant un second onglet à `produce` aurait fait
   * disparaître le cas d'un membre de ce fichier : c'est l'assertion qui
   * change, pas la donnée.
   */
  it('ne perd aucun écran : chaque onglet est atteignable, en menu ou en bouton direct', () => {
    renderBar()
    const seen: string[] = []
    for (const group of GROUPS) {
      const members = TABS.filter(tab => tab.group === group.key)
      if (members.length === 1) {
        // Pas de menu à ouvrir : le bouton EST l'onglet.
        expect(screen.getByRole('button', { name: new RegExp(members[0]!.label) })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: new RegExp(`^${group.label}$`) })).not.toBeInTheDocument()
        seen.push(members[0]!.label)
        continue
      }
      fireEvent.click(screen.getByRole('button', { name: new RegExp(group.label) }))
      for (const item of within(screen.getByRole('menu')).getAllByRole('menuitem')) {
        seen.push(item.textContent ?? '')
      }
    }
    expect(seen.sort()).toEqual(TABS.map(tab => tab.label).sort())
  })
})
