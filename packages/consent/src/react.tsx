'use client'

import { type ReactNode, useSyncExternalStore } from 'react'
import { isAnalyticsAllowed, subscribeCookieConsent } from './consent'

/**
 * L'état courant du consentement à la mesure d'audience, réactif.
 *
 * ⚠️ L'instantané SERVEUR est `false`, et ce n'est pas de la prudence
 * décorative : le serveur ne voit pas le cookie du visiteur au moment du rendu
 * statique. Répondre autre chose ferait partir le traceur dans le HTML, avant
 * même que la question soit posée.
 */
function useAnalyticsConsent(): boolean {
  return useSyncExternalStore(subscribeCookieConsent, isAnalyticsAllowed, serverSnapshot)
}

function serverSnapshot(): boolean {
  return false
}

/**
 * LA PORTE. Aucun traceur d'audience ne se monte ailleurs qu'à l'intérieur.
 *
 * Ce qu'elle donne, et qu'un `if` recopié dans chaque app ne donnerait pas :
 *
 * 1. **Un seul endroit** où la question se pose (GA-26). Trois copies
 *    divergeraient — la première fois qu'un traceur s'ajoute, l'une des trois
 *    serait oubliée.
 * 2. **Un retrait qui débranche.** Elle est abonnée : décocher « Mesure
 *    d'audience » démonte l'enfant dans la seconde, sans rechargement.
 *    ⚠️ Un script DÉJÀ exécuté ne se dé-exécute pas — démonter le composant
 *    retire ce qu'il avait injecté, mais ce que le navigateur a chargé avant le
 *    retrait ne disparaît qu'au prochain chargement de page. C'est une limite du
 *    navigateur, pas un raccourci : elle est écrite ici pour qu'on ne la
 *    redécouvre pas.
 * 3. **Un nom que la garde d'architecture sait chercher.**
 *    `apps/web/src/architecture/analytics-behind-consent.test.ts` exige que
 *    chaque montage de traceur des trois apps soit encadré par cette balise.
 */
export function AnalyticsConsentGate({ children }: { children: ReactNode }) {
  return useAnalyticsConsent() ? <>{children}</> : null
}
