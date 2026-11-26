import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabNav } from '@bellum/ui'

/**
 * #2653.1 — le bouton « Tableau » était rogné en permanence sur `/projects`,
 * même quand rien ne débordait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 * `TabNav` posait `[mask-image:linear-gradient(to_right,black_calc(100%-2rem),
 * transparent)]` INCONDITIONNELLEMENT sur son conteneur défilant, pour
 * indiquer qu'il reste des onglets cachés derrière le bord droit. Sur
 * `/projects`, la barre ne compte que deux onglets (« Kanban » / « Tableau »)
 * et ne déborde JAMAIS — mais le dégradé de masque, lui, efface quand même les
 * deux derniers rem du dernier onglet : « Tableau » apparaît à moitié effacé
 * en PERMANENCE, sans qu'aucun défilement ne l'explique.
 *
 * Le masque ne doit s'appliquer que quand la barre défile RÉELLEMENT — même
 * mesure que `useHorizontalOverflow` (GA-119, `Table`/`ResponsiveTable`) :
 * réutilisée ici plutôt que réécrite (GA-26).
 *
 * ⚠️ jsdom ne calcule aucune géométrie : `scrollWidth`/`clientWidth` valent 0
 * partout. `measureAs` les instrumente, comme dans
 * `table-columns-stay-readable.test.tsx`.
 */
describe('TabNav — le masque de bord ne vit que si la barre déborde vraiment', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  const MASK_CLASS = '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]'

  function measureAs(scrollWidth: number, clientWidth: number) {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  }

  const tabs = [
    { key: 'kanban', label: 'Kanban' },
    { key: 'table', label: 'Tableau' },
  ]

  it('rien ne déborde (cas `/projects`, deux onglets) : aucun masque', () => {
    measureAs(200, 200)
    render(<TabNav variant="pill" tabs={tabs} activeTab="kanban" />)

    const scroller = screen.getByText('Tableau').closest('[class*="overflow-x-auto"]')
    // Si ce test tombe (le masque revient sans condition) : le dernier onglet
    // redevient rogné en permanence sur tout écran qui ne déborde pas — le
    // défaut mesuré par #2653.1.
    expect(scroller).not.toHaveClass(MASK_CLASS)
  })

  it('la barre déborde vraiment : le masque apparaît', () => {
    measureAs(900, 200)
    render(<TabNav variant="pill" tabs={tabs} activeTab="kanban" />)

    const scroller = screen.getByText('Tableau').closest('[class*="overflow-x-auto"]')
    expect(scroller).toHaveClass(MASK_CLASS)
  })
})
