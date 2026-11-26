import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { accountsApi } from '@/features/accounts/api'

type AddAccountToPortfolioInput = { company_name: string; siren?: string; sector?: string }
type AddAccountToPortfolioResult = { id: string; company_name: string; siren: string | null; created: boolean }

/**
 * #2150.42 (épopée #2781) — « Ajouter au portefeuille » depuis un résultat de
 * recherche d'entreprise (`/search`, seule porte de recherche globale du
 * produit — voir doctrine c84 sur ce qui traverse le chat sans carte).
 *
 * Même porte que #2150.32 (CRM) : `POST /accounts/portfolio`
 * (`accountsApi.addToPortfolio`), idempotente par SIREN/nom, aucun crédit
 * débité (seule l'analyse en consomme). Généralisée hors de `features/crm`
 * pour être rejouée par n'importe quel appelant portant un nom + SIREN
 * connus (ici `CompanySuggestion`).
 */
export function useAddAccountToPortfolio() {
  const queryClient = useQueryClient()
  const { t } = useTranslation('search')

  return useMutation<AddAccountToPortfolioResult, Error, AddAccountToPortfolioInput>({
    mutationKey: ['accounts', 'add-to-portfolio'],
    mutationFn: input => accountsApi.addToPortfolio(input),
    onSuccess: account => {
      // Même clé que Découvrir et le CRM : le portefeuille a changé côté
      // serveur, la liste des comptes doit le refléter sans rechargement.
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('autocomplete.addedToPortfolio', { company: account.company_name }))
    },
    onError: () => {
      toast.error(t('autocomplete.addToPortfolioError'))
    },
  })
}
