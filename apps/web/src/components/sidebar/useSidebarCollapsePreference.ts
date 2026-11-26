import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSidebarOptional } from '@bellum/ui'
import { useUIStore } from '@/stores'

/**
 * Relie l'état de repli de la barre latérale à la préférence PERSISTÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN EFFET, ET PAS UN `defaultOpen`
 * ─────────────────────────────────────────────────────────────────────────
 * `SidebarProvider` sait recevoir un état initial — mais il est monté par
 * `MenuLayout`, dans le paquet UI, qui ne connaît (et ne doit pas connaître) le
 * store de l'application. La restauration se fait donc depuis l'INTÉRIEUR de la
 * barre, qui est le seul endroit à voir les deux.
 *
 * `useLayoutEffect` et non `useEffect` : la restauration doit avoir lieu AVANT
 * la peinture. Avec un effet ordinaire, quelqu'un qui a replié verrait la barre
 * dépliée une image, puis se refermer — et la transition CSS de 200 ms rendrait
 * ce clignotement parfaitement visible, à chaque chargement de page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS PHASES
 * ─────────────────────────────────────────────────────────────────────────
 * L'effet d'écriture s'exécute dans le MÊME commit que la restauration, où
 * `open` porte encore la valeur d'avant. Écrire là réécrirait aussitôt la
 * préférence qu'on vient de lire — le repli ne survivrait jamais au premier
 * rechargement, et le test « survit à un remontage » est ce qui l'attrape.
 *
 * `restoring` saute donc exactement ce commit-là. Ensuite l'écriture suit
 * n'importe quelle bascule, d'où qu'elle vienne : le bouton, ou le raccourci
 * ⌘/Ctrl+B que `SidebarProvider` porte déjà.
 */
export function useSidebarCollapsePreference(): void {
  /**
   * ⚠️ `useSidebarOptional` et non `useSidebar` — RÉGRESSION MESURÉE EN
   * PRODUCTION le 16/09/2026 (`d0cd477e3`), à 599 px : `/settings/profile`
   * rendait « Oups. Une erreur inattendue est survenue. », et la console
   * disait `useSidebar must be used within a SidebarProvider.`
   *
   * `SettingsNavbarBody` appelle ce hook, et sur téléphone `SettingsPage` rend
   * cette navigation dans `MobileShell` — hors de `MenuLayout`, donc **sans
   * fournisseur**. `useSidebar` LÈVE là ; toute la section Réglages tombait
   * dans la limite d'erreur, et sur téléphone cette barre est la SEULE
   * navigation des Réglages : ce n'était pas une page dégradée, c'était une
   * impasse.
   *
   * Ce défaut avait DÉJÀ été corrigé une fois — `useSidebarOptional` existe
   * pour lui (voir son commentaire dans `packages/ui`). Il est revenu par une
   * autre porte : ce hook-ci, ajouté pour le repli, redemandait le contexte
   * de façon dure. D'où la garde sur le HOOK et pas sur l'écran.
   *
   * Sans fournisseur il n'y a pas de repli à persister : le hook ne fait rien,
   * ce qui est la vérité, et non un repli deviné.
   */
  const sidebar = useSidebarOptional()
  const phase = useRef<'idle' | 'restoring' | 'live'>('idle')

  useLayoutEffect(() => {
    if (!sidebar) return
    if (phase.current !== 'idle') return
    // `getState()` et non un sélecteur : la valeur stockée n'est lue qu'UNE
    // fois, au montage. S'y abonner ferait de la restauration et de l'écriture
    // une boucle.
    const stored = useUIStore.getState().sidebarOpen
    if (stored === sidebar.open) {
      phase.current = 'live'
      return
    }
    phase.current = 'restoring'
    sidebar.setOpen(stored)
  }, [sidebar])

  useEffect(() => {
    if (!sidebar) return
    if (phase.current === 'idle') return
    if (phase.current === 'restoring') {
      phase.current = 'live'
      return
    }
    useUIStore.getState().setSidebarOpen(sidebar.open)
  }, [sidebar])
}
