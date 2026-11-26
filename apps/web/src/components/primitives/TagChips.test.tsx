import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TagChips } from './TagChips'

/**
 * #2159.26 — les étiquettes d'une fiche : chacune MÈNE à la liste filtrée sur
 * elle, et une fiche sans étiquette ne rend rien (ni « 0 », ni liste vide).
 */
describe('TagChips (#2159.26)', () => {
  it('rend chaque étiquette comme un lien vers la liste filtrée', async () => {
    renderWithRouter(<TagChips tags={['sap', 'grand compte']} list="accounts" label="Étiquettes du compte" />)

    const list = await screen.findByRole('list', { name: 'Étiquettes du compte' })
    const links = list.querySelectorAll('a')
    expect([...links].map(link => link.textContent)).toEqual(['sap', 'grand compte'])
    const href = new URL(links[1]?.getAttribute('href') ?? '', 'http://x')
    expect(href.pathname).toBe('/accounts')
    expect(href.searchParams.get('tag')).toBe('grand compte')
  })

  it('mène à la liste des CONTACTS pour une fiche contact', async () => {
    renderWithRouter(<TagChips tags={['décideur']} list="contacts" label="Étiquettes du contact" />)

    const link = await screen.findByRole('link', { name: 'décideur' })
    expect(link.getAttribute('href')).toContain('/contacts?tag=')
  })

  it('ne rend RIEN sans étiquette — une absence ne s’affiche pas en liste vide', () => {
    const { container } = renderWithRouter(<TagChips tags={[]} list="accounts" label="Étiquettes" />)
    expect(container.querySelector('ul')).toBeNull()
  })
})
