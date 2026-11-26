import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { accountKeys } from '@/features/accounts/api'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

type VerifySignalInput = { accountId: string; label: string }
type VerifySignalResult = { verified: boolean }

/**
 * « Marquer ce signal comme vérifié » (#3206.2 partiel, épopée #3240) — la
 * plus petite tranche prouvable d'un événement de vérification, qui
 * n'existait nulle part dans le pipeline. Une observation n'est pas une
 * vérification : ce geste ne s'exécute QUE sur un clic explicite, jamais
 * déduit d'une re-détection.
 *
 * Même discipline que `useCreateSignalAction` : le serveur pose
 * `last_verified_at`, le client n'envoie que l'identité du signal. Au succès,
 * on ré-invalide le flux de veille pour que le panneau affiche « Vérifié par
 * toi le … » sans recharger la page.
 */
export function useVerifySignal() {
  const queryClient = useQueryClient()
  const { user } = useSession()

  return useMutation<VerifySignalResult, Error, VerifySignalInput>({
    mutationKey: ['signal-history', 'verify'],
    mutationFn: input =>
      apiFetch<VerifySignalResult>({
        path: '/signal-history/verify',
        method: 'POST',
        body: { accountId: input.accountId, label: input.label },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.signals(user?.id) })
      toast.success(i18n.t('watchlist:history.verifyToastSuccess'))
    },
    onError: err => toast.error(i18n.t('watchlist:history.verifyToastFailed'), { description: err.message }),
  })
}
