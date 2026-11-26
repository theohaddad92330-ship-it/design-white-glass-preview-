import type { ActionPlanItem, ActionPlanOutcome } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { actionOsKeys } from '@/features/action-os/api'
import { i18n } from '@/i18n'
import { planItemsApi } from '../planItems.api'

/**
 * #1409 (rouvert), #2114.46/.57 — MARQUER UNE RELANCE FAITE, DEPUIS ACTIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE HOOK A DÉMÉNAGÉ, ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * Il vivait dans `features/dashboard/hooks/`, monté par la seule
 * `MyRelancesCard` du cockpit personnel. Le refus de #1409 disait, à raison,
 * que retirer la carte aurait retiré la CAPACITÉ et pas seulement l'affichage :
 * c'était le SEUL endroit du produit où une relance se marquait faite.
 *
 * La décision du 16/09/2026 lève ce refus en changeant ce qu'il protégeait :
 * **migrer d'abord, retirer ensuite, dans le MÊME lot.** Le geste vit
 * maintenant dans le Centre d'actions — « une seule maison pour toutes les
 * décisions humaines », le patron que #1508 a déjà écrit pour les écritures
 * CRM — et la carte part avec le même commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLUS D'ÉCRITURE OPTIMISTE, ET CE N'EST PAS UNE PERTE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ancienne version retirait la ligne à la main du cache `['dashboard','me']`
 * et décrémentait deux compteurs, ce qui l'obligeait à recevoir un drapeau
 * `overdue` que l'appelant devait porter. Cette dérivation vivait alors à DEUX
 * endroits — le serveur la calculait déjà. Ici, l'invalidation suffit : la
 * liste des actions est courte, la mutation est rare, et le compteur du cockpit
 * redevient ce que le serveur dit plutôt que ce que l'écran a soustrait.
 *
 * ⚠️ Les DEUX familles de requêtes sont invalidées. `['plan-items']` pour la
 * liste d'où part le geste ; `['dashboard']` parce que les compteurs
 * « relances ouvertes / en retard » du cockpit personnel LISENT la même table —
 * ne rafraîchir que l'une laisserait deux écrans se contredire.
 */
export function useCompleteRelance() {
  const queryClient = useQueryClient()

  return useMutation<ActionPlanItem, Error, { id: string; outcome: ActionPlanOutcome; callbackDate?: string }>({
    mutationKey: ['plan-items', 'complete'],
    // `execution_status: 'done'` — le statut EXÉCUTABLE, pas le drapeau
    // historique `done`. C'est ce que lit la liste des actions ouvertes.
    // #2396.2 — `outcome` est OBLIGATOIRE ici : le serveur refuse une
    // transition vers `done` qui n'en porte pas.
    mutationFn: input =>
      planItemsApi.update(input.id, {
        execution_status: 'done',
        outcome: input.outcome,
        // #3416.2b — la date du rappel, seulement si elle a été choisie.
        ...(input.callbackDate ? { callback_date: input.callbackDate } : {}),
      }),
    onSuccess: () => {
      toast.success(i18n.t('actions:center.relances.doneToast'))
    },
    onError: (error: Error) => {
      toast.error(i18n.t('actions:center.relances.doneError'), { description: error.message })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plan-items'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      // #5023.1 — la fiche compte lit ['action-os','actions','account',id] : sans cette
      // invalidation, « fait » sur /actions la laissait montrer l'action ouverte.
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.actions })
    },
  })
}
