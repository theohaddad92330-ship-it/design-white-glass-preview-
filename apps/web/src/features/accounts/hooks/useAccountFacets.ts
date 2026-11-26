import { useQuery } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'
import { saveQuerySnapshot, useHydrateFromSnapshot } from '@/lib/cache/idb/query-snapshots'

/**
 * "Facettes" — listes distinctes (secteurs, entreprises) calculées
 * server-side à partir des comptes du user. Utilisées pour alimenter
 * dynamiquement les options de la `FilterBar`.
 *
 * Cache long (5 min) — la liste change rarement, et un nouveau secteur
 * apparaît seulement à la fin d'une analyse, qui invalide déjà
 * `accounts.list`.
 */
export function useAccountSectors() {
  const { user } = useSession()
  const queryKey = ['accounts', 'sectors', user?.id] as const
  useHydrateFromSnapshot<string[]>(queryKey)
  return useQuery<string[]>({
    queryKey,
    queryFn: async () => {
      const data = await accountsApi.listSectors()
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}

/** #2159.26 — les étiquettes en usage sur les comptes, options du filtre. */
export function useAccountTags() {
  const { user } = useSession()
  const queryKey = ['accounts', 'tags', user?.id] as const
  useHydrateFromSnapshot<string[]>(queryKey)
  return useQuery<string[]>({
    queryKey,
    queryFn: async () => {
      const data = await accountsApi.listTags()
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}

export function useAccountCompanies() {
  const { user } = useSession()
  const queryKey = ['accounts', 'companies', user?.id] as const
  useHydrateFromSnapshot<string[]>(queryKey)
  return useQuery<string[]>({
    queryKey,
    queryFn: async () => {
      const data = await accountsApi.listCompanies()
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
