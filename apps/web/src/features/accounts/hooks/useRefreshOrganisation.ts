import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { REFRESH_MODE_DIMENSIONS, type RefreshDimension } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'

/**
 * #2125.42 — « ne relire que l'organisation » : l'organigramme et les gens.
 *
 * Le mode le moins cher du mini-plan. Il n'invente aucun chemin serveur : il
 * rejoue les deux axes que le dossier sait déjà rafraîchir séparément
 * (`POST /analysis/:id/refresh`), dans l'ORDRE déclaré au contrat.
 *
 * ⚠️ Séquentiel, et l'ordre compte : l'organigramme d'abord, les contacts
 * ensuite. Enrichir des personnes sur un organigramme périmé rattacherait les
 * bonnes personnes aux mauvaises entités — et c'est précisément l'erreur qu'un
 * rafraîchissement « organisation » est censé corriger.
 *
 * ⚠️ Chaque axe débite SON crédit : le coût annoncé par le mini-plan est la
 * SOMME de la grille de ces deux axes (`refreshModeCost`), pas un forfait
 * inventé ici — le prix affiché reste le prix débité (GA-49 / GA-86).
 */
export function useRefreshOrganisation(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ refreshed: RefreshDimension[] }, Error, void>({
    mutationKey: ['accounts', accountId, 'refreshOrganisation'],
    mutationFn: async () => {
      const refreshed: RefreshDimension[] = []
      for (const dimension of REFRESH_MODE_DIMENSIONS.organisation) {
        await accountsApi.refreshDimension(accountId, dimension)
        refreshed.push(dimension)
      }
      return { refreshed }
    },
    // Dans les DEUX cas : le premier axe a pu aboutir avant que le second
    // échoue, et le dossier affiché doit alors montrer ce qui a réellement
    // changé plutôt que l'état d'avant.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
      qc.invalidateQueries({ queryKey: ['credits'] })
    },
    onSuccess: () => {
      toast.success(i18n.t('accounts:toast.orgAndContactsRefreshed'))
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.refreshError'))
    },
  })
}
