import { Box } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { MobileTabBar } from './MobileTabBar'
import { activeMobileTab } from './mobile-nav'
import { PullToRefresh } from './PullToRefresh'

/**
 * La coque mobile — le contenu, puis la barre d'onglets, et rien entre les deux.
 *
 * Ce qui DISPARAÎT par rapport au bureau, et pourquoi :
 * - la barre latérale à neuf entrées : elle mangerait la moitié d'un écran de
 *   téléphone, et ses neuf destinations sont couvertes par quatre onglets plus
 *   Laura, qui sait aller partout ;
 * - le pied de page d'engagement contact : il se superposerait à la barre
 *   d'onglets, deux barres pour deux navigations différentes au même endroit.
 *
 * Ce qui RESTE : l'entête de page, ses onglets, et le contenu. On n'ampute pas
 * l'écran — on change sa coque.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname })
  return (
    <Box className="flex h-full min-h-0 flex-col">
      {/* `100dvh` et non `100vh` : sur mobile, `vh` compte la barre d'adresse
          comme si elle n'existait pas, et le bas de l'écran passe sous le pli.
          C'est le défaut le plus courant d'une application web sur téléphone. */}
      {/* `overflow-hidden` et NON `overflow-y-auto` : le contenu de page porte
          déjà son propre défilement. Deux conteneurs défilants imbriqués
          produisent le pire comportement tactile qui soit — on fait défiler
          l'intérieur, on atteint le bout, et le geste part sur l'extérieur. Sur
          un écran conversationnel, la zone de saisie passe alors sous le pli. */}
      {/* #4136 — tirer pour rafraîchir : seulement sur les quatre onglets. */}
      <PullToRefresh enabled={activeMobileTab(pathname) !== null}>{children}</PullToRefresh>
      <MobileTabBar />
    </Box>
  )
}
