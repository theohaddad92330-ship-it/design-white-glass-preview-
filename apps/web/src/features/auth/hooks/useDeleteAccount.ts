import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/features/auth/api'
import { sessionManager } from '@/features/auth/session-manager'
import { clearAllDiscoverCaches } from '@/features/discover/lib/discover-cache'

/**
 * DELETE /auth/account — removes the auth user server-side, then clears
 * the local session and navigates home. Auth travels via HttpOnly
 * cookies; `onSettled` runs cleanup even when the API call fails so the
 * browser ends in a sane state.
 */
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation<void, Error, void>({
    mutationKey: ['auth', 'deleteAccount'],
    mutationFn: () => authApi.deleteAccount(),
    onSettled: async () => {
      await sessionManager.logout().catch(() => {})
      qc.clear()
      clearAllDiscoverCaches()
      // Chargé ICI, pas en haut du fichier : `@/router` importe `routeTree.gen`,
      // donc TOUTES les routes. Un import statique ferme un cycle dès qu'un
      // composant de l'arbre utilise ce hook (mesuré le 18/09/2026, garde
      // `a-hook-in-the-route-tree-never-imports-the-router`).
      void import('@/router').then(({ router }) => {
        router.navigate({ to: '/', replace: true })
      })
    },
  })
}
