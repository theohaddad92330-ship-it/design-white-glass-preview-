import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Monte un calque plein écran dans `document.body`.
 *
 * Sans lui, un modal en `position: fixed` s'ancre sur le premier ancêtre porteur
 * d'un `transform` — et nos écrans animés en portent un en permanence (transition
 * d'onglet, apparition des cartes). Le calque se cale alors sur CE bloc : sur une
 * page plus haute que la fenêtre, la boîte centrée tombe hors champ et il ne reste
 * que le fond assombri, qui se lit comme une panne plutôt que comme une attente.
 *
 * Le portail rend l'ancrage indépendant de l'écran appelant : un modal ne doit pas
 * dépendre de l'animation de la page qui l'ouvre.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
