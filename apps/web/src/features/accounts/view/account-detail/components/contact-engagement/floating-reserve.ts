/**
 * Réserve d'espace sous TOUS les composeurs flottants (#3487.3, #3418).
 *
 * Les boutons flottants de Laura et « Signaler un problème » occupent le bas
 * droit de l'écran (1rem → 4rem, z-widget). Recette prod 01/10 : le chip du
 * composeur réduit (onglet 165×28 px, collé à `bottom-2`) en était masqué sur
 * 22 px, et le bouton d'envoi du composeur ouvert aussi. Une seule valeur ici,
 * lue par l'onglet réduit ET par le placement du panneau ouvert : un nouveau
 * composeur flottant n'a rien à redécouvrir.
 */
export const FLOATING_BUTTONS_RESERVE_REM = 4.5
const REM_PX = 16
export const FLOATING_BUTTONS_RESERVE_PX = FLOATING_BUTTONS_RESERVE_REM * REM_PX

/** Classe Tailwind du bas d'un conteneur fixe : au-dessus des boutons flottants (et de la nav mobile). */
// Littéral : Tailwind ne génère pas une classe assemblée à l'exécution (le test la recoupe avec la constante).
export const ABOVE_FLOATING_BUTTONS_BOTTOM = 'bottom-[calc(4.5rem+var(--bellum-mobile-nav-height,0px))]'

/**
 * #3487.3 — recette prod 02/10 (Y3) : les onglets rendus EN LIGNE dans le pied
 * de page (`ContactEngagementTabs`, alignés à droite) restaient sous Laura et
 * « Signaler » (chevauchement 20 px sur 24) : le correctif précédent ne
 * touchait que les variantes `fixed`. Les deux boutons occupent 1rem → 7,5rem
 * depuis le bord droit ; la bande en ligne réserve donc 8rem à droite (`pr-32`).
 */
// Littéral : Tailwind ne génère pas une classe assemblée à l'exécution.
export const BESIDE_FLOATING_BUTTONS_PADDING = 'pr-32'

const MOBILE_BOUND_PX = 768

export type PanelPlacement = {
  height: number
  left: number
  top: number
  width: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function panelPlacement({
  anchorRect,
  maximized,
}: {
  anchorRect?: DOMRect | null
  maximized: boolean
}): PanelPlacement | undefined {
  if (typeof window === 'undefined') return undefined

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  // Le bord bas du panneau (et donc son bouton d'envoi) reste au-dessus des flottants.
  const usableBottom = viewportHeight - FLOATING_BUTTONS_RESERVE_PX

  if (maximized) {
    const contentFrame = document.querySelector<HTMLElement>('[data-slot="menu-page-content-frame"]')
    const frameRect = contentFrame?.getBoundingClientRect()
    const left = frameRect ? frameRect.left : 16
    const top = Math.max(frameRect ? frameRect.top : 16, 8)
    const width = frameRect ? frameRect.width : viewportWidth - 32
    const frameHeight = frameRect ? frameRect.height : viewportHeight - 88

    return {
      width: Math.max(width, 320),
      height: Math.max(Math.min(frameHeight, usableBottom - top), 420),
      left: Math.max(left, 8),
      top,
    }
  }

  // #3696.7 — « un espace assez large » : le message est la zone principale. Sous la borne mobile
  // (768 px, GA-28) le panneau prend la place utile — pas de fenêtre étroite posée sur la fiche.
  const panelWidth = viewportWidth < MOBILE_BOUND_PX ? viewportWidth - 16 : Math.min(560, viewportWidth - 32)
  const panelHeight = Math.min(640, usableBottom - 16)
  const anchorCenter = anchorRect ? anchorRect.left + anchorRect.width / 2 : viewportWidth - panelWidth / 2 - 20
  const sideGap = viewportWidth < MOBILE_BOUND_PX ? 8 : 16
  const left = clamp(anchorCenter - panelWidth / 2, sideGap, viewportWidth - panelWidth - sideGap)
  const bottom = anchorRect ? viewportHeight - anchorRect.top + 6 : FLOATING_BUTTONS_RESERVE_PX
  const top = clamp(viewportHeight - bottom - panelHeight, 16, usableBottom - panelHeight)

  return { width: panelWidth, height: panelHeight, left, top }
}
