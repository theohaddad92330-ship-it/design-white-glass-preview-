import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Relit les droits au moment où un verrou s'apprête à s'afficher.
 *
 * La charge crédits — qui porte l'offre ET les fonctions ouvertes — est
 * considérée fraîche pendant une minute, et une copie survit au rechargement
 * dans le cache local. Un changement de palier (paiement revenu de Stripe,
 * attribution depuis le back-office) laissait donc un cadenas à l'écran alors
 * que le droit était déjà accordé côté serveur : l'utilisateur voyait « passez à
 * Growth » sur un espace Growth, et la seule manœuvre connue était de se
 * déconnecter (PLAN-01, audit terrain du 17/08).
 *
 * Le rafraîchissement est déclenché par le VERROU, pas par un intervalle : il ne
 * coûte une requête que sur la page où se pose vraiment la question, et jamais
 * sur les écrans que l'offre ouvre déjà.
 */
export function useRefreshEntitlementsOnLock(locked: boolean): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!locked) return
    void queryClient.invalidateQueries({ queryKey: ['credits'] })
    // La dépendance s'arrête à `locked` : ce qu'on veut, c'est UNE relecture au
    // moment où le verrou apparaît. Réagir à chaque rendu ferait tourner en
    // boucle la requête que cette relecture invalide.
  }, [locked, queryClient])
}
