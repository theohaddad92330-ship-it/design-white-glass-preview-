import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi, type AccountHygieneByAccount } from '@/features/accounts/api'

/**
 * Les contrôles de qualité qui concernent un compte, LUS UNE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SEULE CLÉ, UN SEUL APPEL
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinquante lignes de portefeuille appellent ce hook ; react-query les sert
 * toutes depuis la même entrée de cache. Deux clés donneraient deux lectures de
 * la même question, donc deux réponses possibles pour la même ligne.
 *
 * `retry: false` : un refus d'offre ou un espace sans droits ne devient pas vrai
 * en réessayant, et trois tentatives par écran de travail est un coût qu'on ne
 * paie pas.
 */
export function useAccountsHygiene(): { data: AccountHygieneByAccount | undefined; isPending: boolean } {
  const { data, isPending } = useQuery<AccountHygieneByAccount>({
    queryKey: accountKeys.hygiene(),
    queryFn: accountsApi.hygiene,
    staleTime: 60_000,
    retry: false,
  })
  return { data, isPending }
}
