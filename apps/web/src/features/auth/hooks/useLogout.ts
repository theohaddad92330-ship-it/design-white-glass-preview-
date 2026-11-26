import { useMutation, useQueryClient } from '@tanstack/react-query'
import { endVoluntaryExit } from '@/features/auth/lib/pre-login-target'
import { sessionManager } from '@/features/auth/session-manager'

/**
 * Calls the API logout endpoint, clears local session state, flushes the
 * react-query cache (so the next login doesn't see stale data from another
 * user), and navigates to /login.
 */
export function useLogout() {
  const qc = useQueryClient()
  return useMutation<void, Error, void>({
    mutationKey: ['auth', 'logout'],
    mutationFn: () => sessionManager.logout(),
    onSettled: () => {
      qc.clear()
      // Le routeur se charge ICI, pas en haut du fichier. `@/router` importe
      // `routeTree.gen`, qui importe TOUTES les routes : un import statique
      // rend donc n'importe quel composant utilisant ce hook dépendant de
      // l'arbre de routes entier — et ferme un cycle dès que ce composant est
      // lui-même dans l'arbre. Mesuré le 18/09/2026 : brancher la sortie de
      // démonstration sur `DemoModeBanner` (rendu par `CustomerPage`, donc
      // sous `/projects/`) a fait boucler
      // `projects/index → … → useLogout → router → routeTree.gen → projects/index`,
      // et `routeTree.gen.ts:186` lisait `.update` sur un import encore
      // indéfini. Trois shards web rouges, pour un bouton.
      void import('@/router').then(({ router }) => {
        router.navigate({ to: '/login', replace: true })
        // La sortie est finie : les liens profonds rouverts SANS session
        // redeviennent retenus (voir `beginVoluntaryExit`).
        endVoluntaryExit()
      })
    },
  })
}
