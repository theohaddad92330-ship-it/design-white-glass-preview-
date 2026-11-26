import { useCallback } from 'react'
import { useLauraIntroScope } from './laura-intro-scope'
import { requestLauraOpen } from './laura-intro-store'

/**
 * F1-FIX #4345 — UNE SEULE RÈGLE POUR « LA BULLE S'OUVRE SUR PLACE ».
 *
 * « Demander à Laura » ne doit jamais faire quitter l'écran de travail. La
 * bulle est atteignable sur bureau ET sur mobile, hors surcouche, hors `/chat` (où
 * Laura EST la page). Ailleurs — surcouche (la bulle y est inerte), `/chat` — le
 * lien vers `/chat` reste le seul accès.
 *
 * Retourne `null` quand la bulle n'est pas atteignable : l'appelant navigue
 * alors comme avant. Sinon, une fonction qui ouvre la bulle, question
 * PRÉ-REMPLIE et jamais envoyée (le copilote prépare, le commercial envoie).
 * `AskLaura`, la barre latérale et l'en-tête de fiche compte passent TOUS par
 * ici — un réglage à un seul endroit (GA-26).
 */
export function useOpenLauraInPlace(releaseOverlay?: () => void): ((question: string) => void) | null {
  const inOverlay = useLauraIntroScope() > 0
  const onChatPage = typeof window !== 'undefined' && /^\/chat(\/|$)/.test(window.location.pathname)
  // #4345.2 — la bulle s'ouvre AUSSI sous 768 px (plein écran) : seul `/chat` (Laura EST la page) et une surcouche l'excluent.
  // #4345.3 — une surcouche qui sait se FERMER (`releaseOverlay`) rend la bulle atteignable : on la ferme, puis on ouvre.
  const releasing = Boolean(releaseOverlay) && inOverlay && !onChatPage
  const reachable = (!inOverlay && !onChatPage) || releasing
  const open = useCallback(
    (question: string) => {
      if (releasing) releaseOverlay?.()
      requestLauraOpen(question)
    },
    [releasing, releaseOverlay],
  )
  return reachable ? open : null
}
