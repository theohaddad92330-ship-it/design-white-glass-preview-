import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { accountsApi } from '@/features/accounts/api'

type AddCrmCompanyToPortfolioInput = { company_name: string }
type AddCrmCompanyToPortfolioResult = { id: string; company_name: string; siren: string | null; created: boolean }

/**
 * #2150.32 (épopée #2781) — « Ajouter au portefeuille » depuis le CRM.
 *
 * Réutilise LA porte déjà là (décision D6, Découvrir) : `POST /accounts/portfolio`
 * (`accountsApi.addToPortfolio`). Un contact CRM porte déjà le nom de son
 * entreprise (`CrmContact.company`, `GET /crm/contacts`) — cette entrée ne
 * refait pas une résolution d'entité, elle rejoue la même. Idempotent par
 * SIREN/nom côté serveur : (ré)attribue, ne duplique jamais ; aucun crédit
 * débité (seule l'analyse en consomme).
 */
export function useAddCrmCompanyToPortfolio() {
  const queryClient = useQueryClient()
  const { t } = useTranslation('integrations')

  return useMutation<AddCrmCompanyToPortfolioResult, Error, AddCrmCompanyToPortfolioInput>({
    mutationKey: ['crm', 'add-to-portfolio'],
    mutationFn: ({ company_name }) => accountsApi.addToPortfolio({ company_name }),
    onSuccess: account => {
      // Le portefeuille a changé côté serveur : la liste des comptes doit le
      // refléter sans rechargement (même clé que Découvrir et le projet
      // implicite, `['accounts']`).
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('crm.addedToPortfolio', { company: account.company_name }))
    },
    onError: () => {
      toast.error(t('crm.addToPortfolioError'))
    },
  })
}
