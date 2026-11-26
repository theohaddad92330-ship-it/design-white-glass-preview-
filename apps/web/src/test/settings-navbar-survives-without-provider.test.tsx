import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Sidebar, SidebarHeader, SidebarProvider } from '@bellum/ui'

import { SidebarCollapseToggle } from '@/components/sidebar/SidebarCollapseToggle'

/**
 * `/settings/*` tombait ENCORE en erreur sur téléphone après le premier correctif.
 *
 * Deux lectures étaient ouvertes : soit le bundle n'était pas servi, soit le
 * correctif était incomplet. C'est la seconde — et elle se prouve au code, sans
 * téléphone. La chaîne mesurée sur `origin/main` :
 *
 *   `SettingsPage.tsx:62`  rend `SettingsNavbarBody` dans `MobileShell`, donc
 *                          HORS de tout `SidebarProvider` ;
 *   `SettingsNavbarBody.tsx:110` rend `<Sidebar collapsible="none">` — corrigé,
 *                          il ne lève plus ;
 *   `SettingsNavbarBody.tsx:123` rend `<SidebarCollapseToggle />` dans son
 *                          en-tête — et CELUI-LÀ appelait `useSidebar()`, la
 *                          version STRICTE, qui lève.
 *
 * Le bouton est masqué en CSS sous 768 px (`md:inline-flex`), pas retiré du
 * rendu : le hook s'exécutait donc bel et bien sur téléphone. Un composant
 * masqué en CSS est un composant RENDU — c'est exactement ce que le premier
 * correctif n'avait pas vu.
 *
 * Sans état de repli, il n'y a rien à replier : le bouton rend `null`. Il ne
 * rend pas un bouton inerte, qui se tabulerait pour ne rien faire.
 */
// jsdom n'implémente pas `matchMedia`, et la barre latérale en dépend des deux
// côtés. Sans ce faux, l'écran tombe sur « window.matchMedia is not a function »
// — une panne d'environnement qu'on prendrait pour la panne qu'on mesure.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
})

describe('SidebarCollapseToggle — hors SidebarProvider', () => {
  it('ne lève pas et ne rend rien, comme le fait la barre des Réglages sur téléphone', () => {
    const { container } = render(
      <Sidebar collapsible="none">
        <SidebarHeader>
          <SidebarCollapseToggle />
        </SidebarHeader>
      </Sidebar>,
    )

    expect(container.querySelector('button')).toBeNull()
  })

  it('AVEC son fournisseur, il rend toujours son bouton nommé — la garde n’est pas éteinte', () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarCollapseToggle />
          </SidebarHeader>
        </Sidebar>
      </SidebarProvider>,
    )

    // GA-32 : un bouton qui ne montre qu'une icône porte un nom, et ce nom
    // annonce l'ACTION, pas l'état.
    expect(
      screen.getByRole('button', { name: /sidebar\.(collapse|expand)|replier|expand|collapse/i }),
    ).toBeInTheDocument()
  })
})
