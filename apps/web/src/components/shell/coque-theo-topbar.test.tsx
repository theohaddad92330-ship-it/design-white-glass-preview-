/**
 * Coque Théo (23/10/2026) — la barre du haut des maquettes appliquées (`.topbar`) :
 * le fil d'Ariane à gauche, la recherche ⌘K et l'avatar à droite.
 *
 * La recherche est CELLE qui existe (`useGlobalSearchStore`, raccourci `global-search` du
 * registre) — la coque n'en crée pas une seconde. Le fil se dérive du modèle de navigation
 * (`sectionForPath`) et un écran peut le déclarer lui-même (`breadcrumbs`, `pageTitle`).
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useGlobalSearchStore } from '@/features/global-search/globalSearchStore'
import { ShellTopbar } from './ShellTopbar'

vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Ada', last_name: 'Lovelace', avatar_url: null } }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'admin', name: 'Atelier Nord', memberCount: 1 } } }),
}))

beforeEach(() => useGlobalSearchStore.setState({ isOpen: false }))
afterEach(() => vi.unstubAllGlobals())

async function trail(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Fil d’Ariane' })
  return within(nav)
    .getAllByRole('listitem')
    .map(item => item.textContent?.trim() ?? '')
}

describe('Coque Théo — barre du haut', () => {
  it('sur la racine d’une section, le fil tient en un mot : la section', async () => {
    renderWithRouter(<ShellTopbar />, '/accounts')
    expect(await trail()).toEqual(['Comptes'])
  })

  it('sur un onglet d’une section, le fil nomme la section (lien) puis l’onglet', async () => {
    // #4491.1 (PR 12C) — la Messagerie est redevenue une entrée de premier niveau : l'exemple d'onglet est
    // désormais Actions › Séquences.
    renderWithRouter(<ShellTopbar />, '/actions/sequences')
    expect(await trail()).toEqual(['Actions', 'Séquences'])
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' })
    expect(within(nav).getByRole('link', { name: 'Actions' })).toHaveAttribute('href', '/actions')
    // Le dernier maillon est l'endroit où l'on est : annoncé, pas cliquable.
    expect(within(nav).getByText('Séquences').closest('[aria-current="page"]')).not.toBeNull()
  })

  it('un écran déclare son fil lui-même, et la coque le suit tel quel', async () => {
    renderWithRouter(
      <ShellTopbar breadcrumbs={[{ label: 'Comptes', to: '/accounts' }, { label: 'Airbus' }]} />,
      '/accounts/a1',
    )
    expect(await trail()).toEqual(['Comptes', 'Airbus'])
  })

  it('la recherche ⌘K ouvre la recherche globale EXISTANTE et affiche son raccourci', async () => {
    renderWithRouter(<ShellTopbar />, '/accounts')
    const search = await screen.findByRole('button', { name: 'Recherche globale' })
    expect(search).toHaveAttribute('aria-keyshortcuts')
    expect(search.querySelectorAll('kbd').length).toBeGreaterThan(0)
    await userEvent.click(search)
    await waitFor(() => expect(useGlobalSearchStore.getState().isOpen).toBe(true))
  })

  it('l’avatar porte les initiales de la personne connectée et ouvre le menu du compte', async () => {
    renderWithRouter(<ShellTopbar />, '/accounts')
    const account = await screen.findByRole('button', { name: 'Mon compte' })
    expect(within(account).getByText('AL')).toBeTruthy()
  })
})
