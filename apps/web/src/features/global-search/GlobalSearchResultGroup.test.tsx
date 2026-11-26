import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { globalSearchOptionId } from './global-search-option-id'
import { GlobalSearchResultGroup } from './GlobalSearchResultGroup'

describe('GlobalSearchResultGroup', () => {
  it("ne rend RIEN — pas même son libellé — quand la liste est vide (doctrine « on n'affiche pas ce qu'on n'a pas »)", () => {
    const { container } = render(
      <GlobalSearchResultGroup groupKey="accounts" label="Comptes" items={[]} onSelect={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('rend le libellé et une ligne par résultat, avec le sous-titre quand il existe', () => {
    render(
      <GlobalSearchResultGroup
        groupKey="accounts"
        label="Comptes"
        items={[
          { id: 'a1', primary: 'Groupe TF1', secondary: 'Média' },
          { id: 'a2', primary: 'Renault', secondary: null },
        ]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Comptes')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Groupe TF1/ })).toBeTruthy()
    expect(screen.getByText('Média')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Renault/ })).toBeTruthy()
  })

  it("appelle `onSelect` avec l'identifiant de la ligne cliquée", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <GlobalSearchResultGroup
        groupKey="accounts"
        label="Comptes"
        items={[{ id: 'a1', primary: 'Groupe TF1' }]}
        onSelect={onSelect}
      />,
    )
    await user.click(screen.getByRole('option', { name: /Groupe TF1/ }))
    expect(onSelect).toHaveBeenCalledWith('a1')
  })

  /**
   * #3015 (recette du 25/09/2026) — ↑/↓ déplace `activeId` DANS
   * `GlobalSearchDialog` (qui raisonne sur les sept groupes aplatis) ; ce
   * composant se contente de poser `id`/`aria-selected` sur la ligne dont
   * l'id aplati correspond — c'est cette moitié-là que ce test garde.
   */
  it("#3015 — pose `aria-selected` et l'`id` DOM sur la ligne active, jamais sur les autres", () => {
    const activeId = globalSearchOptionId('accounts', 'a2')
    render(
      <GlobalSearchResultGroup
        groupKey="accounts"
        label="Comptes"
        items={[
          { id: 'a1', primary: 'Groupe TF1' },
          { id: 'a2', primary: 'Renault' },
        ]}
        activeId={activeId}
        onSelect={() => {}}
      />,
    )
    const renault = screen.getByRole('option', { name: /Renault/ })
    const tf1 = screen.getByRole('option', { name: /Groupe TF1/ })
    expect(renault.id).toBe(activeId)
    expect(renault).toHaveAttribute('aria-selected', 'true')
    expect(tf1).toHaveAttribute('aria-selected', 'false')
  })
})
