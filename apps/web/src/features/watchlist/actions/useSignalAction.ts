import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { accountKeys } from '@/features/accounts/api'
import { dossierItemRef } from '@/features/accounts/view/account-detail/search/dossierSearch'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

type CreateSignalActionInput = { accountId: string; label: string }
type CreateSignalActionResult = { actionId: string; actionLabel: string }

/**
 * « Ce signal m'a fait faire quelque chose » (restitution V2 §20 — l'objet
 * `Signal` exige *… importance, ACTION*).
 *
 * Crée une action sur la checklist EXISTANTE du compte et estampille le lien sur
 * la ligne d'historique du signal. Le libellé de l'action est composé côté
 * serveur à partir du signal : le client n'invente aucun texte. Au succès, on
 * ré-invalide le flux de veille pour que le détail affiche « a déclenché : … ».
 *
 * #2695.2 — un clic sur « En faire une action » répondait un texte générique
 * (« Action ajoutée au plan du compte ») et ne menait nulle part : la ligne
 * créée (`action_plan_items`) rejoint une checklist de vingt lignes
 * indiscernables, et rien ne dit LAQUELLE vient d'être créée ni où la
 * retrouver. Le toast NOMME désormais l'action (le libellé que le serveur a
 * composé, jamais un texte inventé côté client) et propose un bouton vers
 * l'onglet Plan du compte.
 *
 * #2107.32 — l'onglet ne suffisait pas : `signal_history.action_id` existe
 * depuis #2695.1, mais rien côté web ne portait la ligne créée jusqu'à SA
 * fiche — retrouver « LAQUELLE des vingt lignes » restait un geste manuel.
 * `item=action:<id>` (`dossierItemRef`, même contrat que la recherche
 * transversale du dossier, #2128.50) fait le reste du chemin : l'onglet Plan,
 * arrivé sur cette URL, amène et donne le focus à la ligne (`ActionPlanBoard`).
 */
export function useCreateSignalAction() {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const navigate = useNavigate()

  return useMutation<CreateSignalActionResult, Error, CreateSignalActionInput>({
    mutationKey: ['signal-history', 'action'],
    mutationFn: input =>
      apiFetch<CreateSignalActionResult>({
        path: '/signal-history/actions',
        method: 'POST',
        body: { accountId: input.accountId, label: input.label },
      }),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.signals(user?.id) })
      toast.success(i18n.t('watchlist:action.toastCreated', { label: result.actionLabel }), {
        action: {
          label: i18n.t('watchlist:action.toastViewInPlan'),
          onClick: () =>
            void navigate({
              to: '/accounts/$id',
              params: { id: variables.accountId },
              search: { tab: 'plan', item: dossierItemRef({ kind: 'action', id: result.actionId }) },
            }),
        },
      })
    },
    onError: err => toast.error(i18n.t('watchlist:action.toastFailed'), { description: err.message }),
  })
}
