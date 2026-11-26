import { useEffect, useState } from 'react'

/**
 * Le seuil au-delà duquel on considère qu'on est sur un écran de bureau.
 *
 * 768 px, la borne `md` de Tailwind : elle est déjà celle de tous les
 * `md:` du dépôt, et en inventer une seconde ferait exister des tailles où le
 * CSS dit « mobile » et le JavaScript dit « bureau ».
 */
export const MOBILE_BREAKPOINT = 768

/**
 * Sommes-nous sur un écran étroit ?
 *
 * Sur la LARGEUR et non sur l'agent utilisateur : une fenêtre de navigateur
 * réduite sur un portable mérite la même mise en page qu'un téléphone, et un
 * agent utilisateur se déguise. C'est aussi ce qui rend la coque testable
 * sans simuler un appareil.
 *
 * La valeur initiale est lue SYNCHRONEMENT : la calculer dans un effet ferait
 * rendre la coque bureau une fraction de seconde sur un téléphone, et cette
 * bascule se voit.
 */
/**
 * `matchMedia`, ou `null` là où il n'existe pas.
 *
 * jsdom ne l'implémente pas : sans ce garde, TOUT composant montant un hook de
 * détection d'écran fait tomber ses tests avec « window.matchMedia is not a
 * function » — six tests du signalement de bug, qui n'ont rien à voir avec le
 * mobile. Le repli est « bureau » : c'est le rendu historique, celui que ces
 * tests décrivent.
 */
function mediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

/**
 * La MÊME lecture, hors de React.
 *
 * Un chargeur de route (`beforeLoad`) s'exécute avant tout rendu : il ne peut
 * appeler aucun hook, et c'est exactement pour ça que trois redirections
 * d'onboarding renvoyaient `/dashboard` en dur alors que la règle mobile dit
 * Laura (#1786). Exportée plutôt que recopiée : deux lectures de la même borne
 * divergent, et celle-ci est déjà tenue à un seul endroit (`MOBILE_BREAKPOINT`).
 */
export function isMobileNow(): boolean {
  return mediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)?.matches ?? false
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(isMobileNow)

  useEffect(() => {
    const query = mediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    query.addEventListener('change', onChange)
    // Une rotation d'écran ou un redimensionnement entre le premier rendu et
    // l'abonnement passerait sinon inaperçue.
    setIsMobile(query.matches)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

/**
 * L'application tourne-t-elle en mode installé (écran d'accueil) ?
 *
 * Sert à deux choses et pas davantage : ne pas proposer l'installation à
 * quelqu'un qui l'a déjà faite, et réserver la barre de sécurité du bas
 * (`env(safe-area-inset-bottom)`) au cas installé, où il n'y a plus la barre
 * d'adresse du navigateur pour l'occuper.
 */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(() => mediaQuery('(display-mode: standalone)')?.matches ?? false)

  useEffect(() => {
    const query = mediaQuery('(display-mode: standalone)')
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setInstalled(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return installed
}
