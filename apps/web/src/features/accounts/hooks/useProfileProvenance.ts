import { useQuery } from '@tanstack/react-query'
import type { AccountProfileProvenance } from '@bellum/contracts'
import { accountsApi, accountKeys } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Avec quel profil ESN ce dossier a été produit (recette finale §6, §13).
 *
 * La provenance ne change JAMAIS pour un run donné — elle est figée au lancement.
 * D'où un `staleTime` très long : la re-demander à chaque visite d'un onglet
 * n'apprendrait rien, et cette ligne apparaît sur un écran qu'on ouvre souvent.
 * Une nouvelle analyse invalide la clé du compte, donc la valeur se renouvelle
 * quand elle a une raison de changer.
 */
export function useProfileProvenance(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountProfileProvenance | null>({
    queryKey: accountKeys.profileProvenance(accountId),
    queryFn: () => accountsApi.profileProvenance(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 10 * 60_000,
  })
}
