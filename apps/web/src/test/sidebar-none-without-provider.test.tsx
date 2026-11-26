import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Sidebar } from '@bellum/ui'

/**
 * `/settings` sur MOBILE plantait, en production.
 *
 * `SettingsPage` rend sa navigation dans `MobileShell`, hors de `MenuLayout` —
 * donc hors de `SidebarProvider`. `Sidebar` lisait `useSidebar()` AVANT de
 * regarder `collapsible`, et `useSidebar` LÈVE sans fournisseur. La seule
 * navigation des Réglages sur téléphone était donc un écran blanc.
 *
 * Une barre `collapsible="none"` ne se replie pas : elle n'a aucun besoin de
 * l'état de repli. Exiger le fournisseur était une contrainte sans raison.
 */
describe('Sidebar collapsible="none" — sans SidebarProvider', () => {
  it('rend son contenu hors de tout fournisseur, comme le fait /settings sur mobile', () => {
    expect(() =>
      render(
        <Sidebar collapsible="none">
          <a href="/settings/profile">Profil</a>
        </Sidebar>,
      ),
    ).not.toThrow()

    expect(screen.getByRole('link', { name: 'Profil' })).toBeInTheDocument()
  })

  it('une barre REPLIABLE continue d’exiger son fournisseur — on n’a pas éteint la garde', () => {
    expect(() =>
      render(
        <Sidebar collapsible="icon">
          <a href="/accounts">Comptes</a>
        </Sidebar>,
      ),
    ).toThrow(/SidebarProvider/)
  })
})
