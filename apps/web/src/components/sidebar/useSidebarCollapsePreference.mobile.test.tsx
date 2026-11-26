import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSidebarCollapsePreference } from './useSidebarCollapsePreference'

/**
 * RÉGRESSION MESURÉE EN PRODUCTION le 16/09/2026, prod `d0cd477e3`, à 599 px :
 * `/settings/profile` rendait « Oups. Une erreur inattendue est survenue. »
 * Console : `useSidebar must be used within a SidebarProvider.` →
 * `useSidebarCollapsePreference` → `SettingsNavbarBody`.
 *
 * ⚠️ CE DÉFAUT AVAIT DÉJÀ ÉTÉ CORRIGÉ UNE FOIS. `useSidebarOptional`
 * (`packages/ui/src/components/sidebar.tsx`) existe précisément parce que
 * « `/settings` sur MOBILE rend sa navigation dans `MobileShell`, hors de
 * `MenuLayout` — donc sans fournisseur. La page rendait un écran blanc, en
 * production. » Il est revenu par une AUTRE PORTE : un hook neuf, ajouté pour
 * le repli de la barre, qui redemande le contexte de façon DURE.
 *
 * C'est pourquoi la garde porte sur le hook et non sur l'écran : le prochain
 * appelant hors fournisseur la rencontrera aussi.
 *
 * Sur téléphone, les Réglages sont la SEULE navigation de la section — leur
 * écran d'erreur n'est pas une page dégradée, c'est une impasse.
 */
function Sonde() {
  useSidebarCollapsePreference()
  return <p>navigation des réglages</p>
}

describe('useSidebarCollapsePreference — hors de tout SidebarProvider', () => {
  it('ne lève pas, et laisse son appelant se rendre', () => {
    // Aucun `SidebarProvider` : exactement ce que `MobileShell` monte.
    expect(() => render(<Sonde />)).not.toThrow()
    expect(screen.getByText('navigation des réglages')).toBeInTheDocument()
  })
})
