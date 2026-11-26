import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ShortcutsTab } from './ShortcutsTab'

/**
 * Refonte Théo V22 (`settings-prefs#raccourcis`) — « Les raccourcis utiles » d'abord, en bloc ; puis TOUS les
 * raccourcis dans une carte repliée (`.t-acc`), fermée à l'arrivée.
 */
describe('Raccourcis — structure Théo V22', () => {
  it('les raccourcis utiles, puis le repli de tous les raccourcis, fermé', async () => {
    const { container } = renderWithRouter(<ShortcutsTab />)
    const useful = await screen.findByRole('heading', { level: 2, name: 'Les raccourcis utiles' })
    const all = container.querySelector('details[data-shortcuts-all]') as HTMLDetailsElement
    expect(all).not.toBeNull()
    expect(all.open).toBe(false)
    expect(useful.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // NON : le repli est une carte (`rounded-card`), pas un simple trait.
    expect(all.className).toContain('rounded-card')
  })
})
