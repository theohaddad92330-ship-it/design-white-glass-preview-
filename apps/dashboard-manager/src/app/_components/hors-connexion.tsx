'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * La coque de la console ne s'affiche pas sur l'écran de connexion (#1668).
 *
 * POURQUOI UN ENROBAGE PLUTÔT QU'UN RETOUR DANS CHAQUE COMPOSANT
 * Deux composants sont concernés — le rail et le bouton de signalement — et
 * chacun porte déjà ses propres hooks. Y glisser un retour anticipé, c'est
 * risquer de le poser AVANT un hook : le composant rendrait juste, et seul
 * l'ORDRE des hooks serait fautif (`react-hooks/rules-of-hooks`, le défaut que
 * le lint a attrapé le 02/09 et que ni le typecheck ni les tests ne voyaient).
 * Ici, un seul hook, et il précède le seul retour.
 *
 * Le bouton de signalement en particulier ne DOIT pas être monté : il poste sur
 * `/api/feedback`, une route qui exige d'être authentifié.
 */
export function HorsConnexion({ children }: { children: ReactNode }) {
  return usePathname() === '/login' ? null : <>{children}</>
}
