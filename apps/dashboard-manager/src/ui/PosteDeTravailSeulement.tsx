'use client'

import { useEffect, useState } from 'react'
import { SEUIL_POSTE_DE_TRAVAIL_PX } from './poste-de-travail.logic'

/**
 * #1674.9 — ce qui ne se déclenche PAS depuis un téléphone.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS DU CSS
 * ─────────────────────────────────────────────────────────────────────────
 * L'issue le demande mot pour mot : « tous les boutons d'action ABSENTS du
 * DOM, pas juste masqués en CSS », et elle donne la raison — « une suppression
 * d'utilisateur déclenchée par un pouce dans un métro est un incident ».
 *
 * Un `display: none` ne protège de rien : la tabulation atteint toujours le
 * bouton, `document.querySelector(...).click()` marche toujours, et un lecteur
 * d'écran peut encore l'annoncer selon la façon dont il est masqué. La seule
 * protection réelle est de NE PAS LE RENDRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE REND RIEN AVANT D'ÊTRE MONTÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le serveur ne connaît pas la largeur de l'écran. Rendre les enfants côté
 * serveur puis les retirer à l'hydratation ferait exactement ce qu'on veut
 * éviter : le bouton EXISTE dans le HTML envoyé, donc il est cliquable pendant
 * la fraction de seconde qui précède l'hydratation — et il reste dans le DOM
 * pour de bon si le JavaScript ne charge jamais.
 *
 * Le défaut est donc « absent », et l'action APPARAÎT sur un poste de travail
 * une fois la largeur connue. C'est le sens de la règle : sur un écran étroit,
 * on lit ; sur un poste de travail, on agit.
 */
export function PosteDeTravailSeulement({ children }: { children: React.ReactNode }) {
  const [assezLarge, setAssezLarge] = useState(false)

  useEffect(() => {
    const requete = window.matchMedia(`(min-width: ${SEUIL_POSTE_DE_TRAVAIL_PX}px)`)
    const lire = () => setAssezLarge(requete.matches)
    lire()
    requete.addEventListener('change', lire)
    return () => requete.removeEventListener('change', lire)
  }, [])

  if (!assezLarge) return null
  return <>{children}</>
}
