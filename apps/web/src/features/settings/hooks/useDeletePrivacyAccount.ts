import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionManager } from '@/features/auth/session-manager'
import { clearAllDiscoverCaches } from '@/features/discover/lib/discover-cache'
import { privacyApi, type DeletionSummary } from '@/features/settings/lib/privacy-api'

/**
 * RGPD droit à l'effacement (`POST /privacy/delete-account`). Anonymises the
 * account server-side (PII scrubbed, sessions revoked, Stripe subscription
 * cancelled) — the API also clears the session cookies. On success we tear down
 * the local session, flush the query cache and route to /login.
 *
 * Cleanup runs only on SUCCESS: a rejected confirmation (400) leaves the user in
 * place with an error toast rather than logging them out.
 */
export function useDeletePrivacyAccount() {
  const qc = useQueryClient()
  return useMutation<DeletionSummary, Error, string>({
    mutationKey: ['privacy', 'deleteAccount'],
    mutationFn: (confirm: string) => privacyApi.deleteAccount(confirm),
    onSuccess: async () => {
      await sessionManager.logout().catch(() => {})
      qc.clear()
      clearAllDiscoverCaches()
      // Chargé ICI, pas en haut du fichier : `@/router` importe `routeTree.gen`,
      // donc TOUTES les routes. Un import statique ferme un cycle dès qu'un
      // composant de l'arbre utilise ce hook (mesuré le 18/09/2026, garde
      // `a-hook-in-the-route-tree-never-imports-the-router`).
      void import('@/router').then(({ router }) => {
        router.navigate({ to: '/login', replace: true })
      })
    },
  })
}
