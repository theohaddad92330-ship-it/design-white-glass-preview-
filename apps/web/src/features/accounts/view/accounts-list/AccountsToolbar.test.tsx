/**
 * #3145 (27/09/2026, bêta) — le lien « Voir le board d'effort » doublait
 * l'onglet « Énergie de pilotage » (supprimé le 14/10/2026), qui référence déjà
 * la même vue (`/accounts?lens=effort`, l'ancienne page de référence). Il est
 * retiré d'`AccountsToolbar` ; ce test sait dire NON à son retour.
 *
 * #4497 / #4498 (PR 12C, maquette V22 `.a4-toolbar`) — la barre suit la maquette : Rechercher · Filtres ·
 * (Toute l'équipe · tri) · à droite présentation et export. « Analyser une entreprise » n'y est plus (le geste
 * vit en haut de page, « Analyser un compte ») ; « Filtres » ouvre la modale et dit combien de critères sont
 * posés. La bascule du panneau, hors maquette, est gardée.
 */
import { fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsToolbar } from './AccountsToolbar'

function renderToolbar({
  leading,
  trailing,
  activeFilterCount = 0,
  onOpenFilters = () => {},
}: {
  leading?: ReactNode
  trailing?: ReactNode
  activeFilterCount?: number
  onOpenFilters?: () => void
} = {}) {
  return renderWithRouter(
    <AccountsToolbar
      search=""
      onSearchChange={() => {}}
      onOpenFilters={onOpenFilters}
      activeFilterCount={activeFilterCount}
      isSidebarVisible={false}
      onToggleSidebar={() => {}}
      leading={leading}
      trailing={trailing}
    />,
    '/accounts',
  )
}

/** `a` précède `b` dans le document. */
function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('AccountsToolbar — #3145', () => {
  it("n'affiche plus le lien « Voir le board d'effort »", async () => {
    renderToolbar()
    expect(await screen.findByRole('button', { name: 'Filtres' })).toBeInTheDocument()
    expect(screen.queryByText('Voir le board d’effort')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /effort/i })).not.toBeInTheDocument()
  })
})

describe('AccountsToolbar — V22 (#4497, #4498)', () => {
  it('Rechercher → Filtres → tête (équipe, tri) → droite (présentation, export), dans UNE ligne repliable', async () => {
    renderToolbar({
      leading: <button type="button">Toute l’équipe</button>,
      trailing: <button type="button">Exporter</button>,
    })
    const search = await screen.findByRole('textbox')
    const filters = screen.getByRole('button', { name: 'Filtres' })
    const team = screen.getByRole('button', { name: 'Toute l’équipe' })
    const exportButton = screen.getByRole('button', { name: 'Exporter' })
    expect(before(search, filters)).toBe(true)
    expect(before(filters, team)).toBe(true)
    expect(before(team, exportButton)).toBe(true)
    const row = search.closest('[data-testid="accounts-toolbar"]') as HTMLElement
    expect(row.className).toContain('flex-wrap')
    expect(row.contains(exportButton)).toBe(true)
  })

  it('« Analyser une entreprise » n’est plus dans la barre', async () => {
    renderToolbar()
    await screen.findByRole('button', { name: 'Filtres' })
    expect(screen.queryByRole('button', { name: /analyser/i })).not.toBeInTheDocument()
  })

  it('« Filtres » ouvre la modale et dit combien de critères sont posés', async () => {
    const onOpenFilters = vi.fn()
    renderToolbar({ activeFilterCount: 2, onOpenFilters })
    const button = await screen.findByRole('button', { name: 'Filtrer mon portefeuille : 2 critères posés' })
    expect(button).toHaveTextContent('Filtres (2)')
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(button)
    expect(onOpenFilters).toHaveBeenCalledTimes(1)
  })

  it('garde la bascule du panneau (hors maquette)', async () => {
    renderToolbar()
    expect(await screen.findByRole('button', { name: /afficher le panneau/i })).toBeInTheDocument()
  })
})
