import { useQuery } from '@tanstack/react-query'
import type { AccountListItem, AccountListQuery, CompanySuggestion } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useDebounce } from '@/hooks/useDebounce'
import { useSession } from '@/lib/hooks/use-session'
import { MIN_QUERY_LENGTH } from './useCompanySearch'

const DEBOUNCE_MS = 300
const LIMIT = 3

/** Une lecture de la liste des comptes, désarmée tant que l'écran n'a rien à demander. */
function useWorkspaceAccountList(filters: AccountListQuery, enabled: boolean): AccountListItem[] {
  const { user } = useSession()
  const query = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'search-match', filters],
    queryFn: () => accountsApi.list(filters),
    enabled: enabled && Boolean(user),
    staleTime: 30_000,
  })
  return enabled ? (query.data?.data ?? []) : []
}

/**
 * « Dans ton portefeuille » (refonte Théo R1) — les comptes DÉJÀ présents dans l'espace dont le nom
 * contient la saisie. Même lecture que la liste des comptes (`GET /accounts?q=`), aucune route neuve :
 * la recherche d'entreprise du registre reste ailleurs, ce groupe ne dit que ce que l'espace possède.
 */
export function useWorkspaceAccountMatches(query: string): AccountListItem[] {
  const [debounced] = useDebounce(query.trim(), DEBOUNCE_MS)
  const enabled = debounced.length >= MIN_QUERY_LENGTH
  return useWorkspaceAccountList({ q: debounced, limit: LIMIT }, enabled)
}

/** Le compte de l'espace qui porte le SIREN de l'entité choisie, ou `null` (jamais deviné sur le nom seul). */
export function useWorkspaceAccountFor(entity: CompanySuggestion | null): AccountListItem | null {
  const enabled = Boolean(entity?.siren)
  const items = useWorkspaceAccountList({ q: entity?.name, limit: 10 }, enabled)
  return items.find(item => item.siren === entity?.siren) ?? null
}
