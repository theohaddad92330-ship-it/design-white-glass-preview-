import { useEffect, useSyncExternalStore } from 'react'

/**
 * Combien de DIALOGUES modaux (`Dialog`, `AlertDialog`) sont ouverts EN CE MOMENT, n'importe où dans l'app.
 *
 * Défaut MESURÉ en production (#4623, 3e surface de la famille #3480) : sur `/discover`, le dock flottant de Laura
 * (`z-widget`, 80) passait AU-DESSUS de « Appliquer et explorer », dans « Cadrer la recherche » (`z-overlay`, 60) —
 * le clic réel n'atteignait pas le bouton. Monter la modale au-dessus du dock casserait la raison d'être de
 * `z-widget` ; corriger écran par écran s'oublie à la prochaine modale. Les primitives partagées déclarent donc leur
 * ouverture ICI (`useRegisterModalOpen`), et le dock s'efface pendant ce temps (`useAnyModalOpen`).
 *
 * Distinct de `useAnySheetOpen` (GA-205) à dessein : le widget de signalement s'efface devant un tiroir mais RESTE
 * utilisable sur une modale (#2487). Fusionner les deux compteurs le ferait disparaître des modales qu'on recette.
 */
let openModalCount = 0
const openModalListeners = new Set<() => void>()

function notifyOpenModalListeners(): void {
  for (const listener of openModalListeners) listener()
}

function subscribeToOpenModals(listener: () => void): () => void {
  openModalListeners.add(listener)
  return () => {
    openModalListeners.delete(listener)
  }
}

function getOpenModalSnapshot(): boolean {
  return openModalCount > 0
}

function getOpenModalServerSnapshot(): boolean {
  return false
}

/**
 * À appeler SANS CONDITION depuis un composant rendu COMME ENFANT de `Content` (voir `ModalOpenRegistrar`) : Radix
 * ne monte `Content` que tant que la modale est ouverte (animation de sortie comprise), donc « monté » ⇔ « ouverte ».
 * Le wrapper `DialogContent`, lui, est rendu même fermé : l'appeler là compterait des dialogues fermés.
 */
function useRegisterModalOpen(): void {
  useEffect(() => {
    openModalCount += 1
    notifyOpenModalListeners()
    return () => {
      openModalCount -= 1
      notifyOpenModalListeners()
    }
  }, [])
}

/** True tant qu'au moins un dialogue modal est ouvert. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(subscribeToOpenModals, getOpenModalSnapshot, getOpenModalServerSnapshot)
}

/** Enfant invisible du contenu d'une modale : déclare l'ouverture le temps que le contenu est monté. */
export function ModalOpenRegistrar(): null {
  useRegisterModalOpen()
  return null
}
