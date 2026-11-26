import { useQuery } from '@tanstack/react-query'
import { accountsApi, type AccountTechStructure } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4742 — la structure technique d'UN compte, lue dès que son dossier s'ouvre.
 *
 * Pas de `enabled` différé : la section vit dans le dossier, une page ouverte
 * exprès (arbitrage Louis 28/10/2026 — dans l'analyse, pas derrière un bouton).
 */
export function useAccountTechStructure(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountTechStructure>({
    queryKey: ['accounts', 'tech-structure', accountId],
    queryFn: () => accountsApi.getTechStructure(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    /** Aucune reprise : une erreur est une RÉPONSE, elle s'affiche tout de suite. */
    retry: false,
  })
}
