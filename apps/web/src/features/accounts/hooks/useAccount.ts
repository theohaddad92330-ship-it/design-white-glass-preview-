import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Account, Contact } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { ApiError } from '@/lib/api-error'
import { useSession } from '@/lib/hooks/use-session'
import { saveQuerySnapshot, useHydrateFromSnapshot } from '@/lib/cache/idb/query-snapshots'

/**
 * Account detail + its contacts. Two queries by design — they hit two
 * different REST resources (`GET /accounts/:id` and `GET /contacts/account/:id`)
 * and we want them cached independently so a contact update doesn't
 * invalidate the account row.
 *
 * No polling: `useAnalysisProgress` invalidates these query keys when the
 * worker emits `analysis:done`, which triggers an automatic refetch.
 */
export function useAccount(id: string) {
  const { user } = useSession()
  const enabled = !!user && id.length > 0
  const accountKey = accountKeys.detail(id)
  const contactsKey = contactKeys.byAccount(id)

  useHydrateFromSnapshot<Account>(accountKey)
  useHydrateFromSnapshot<Contact[]>(contactsKey)

  const accountQuery = useQuery<Account>({
    queryKey: accountKey,
    queryFn: async () => {
      const data = await accountsApi.getOne(id)
      void saveQuerySnapshot(accountKey, data)
      return data
    },
    enabled,
  })

  const contactsQuery = useQuery<Contact[]>({
    queryKey: contactsKey,
    queryFn: async () => {
      const data = await contactsApi.listByAccount(id)
      void saveQuerySnapshot(contactsKey, data)
      return data
    },
    enabled,
  })

  // #3550 / #3532 — la fiche démo « introuvable » depuis la liste : une salle
  // de démonstration re-semée (empreinte périmée, déploiement) recrée ses
  // comptes sous de NOUVEAUX identifiants, alors que la liste persistée
  // (IndexedDB, fraîche 30 s) montre encore les anciens. Un 404 sur un id que
  // la liste vient de proposer est ce signal : on ne fait plus confiance à la
  // liste, on la relit. L'écran « introuvable » reste, mais le retour tombe
  // sur une liste juste. Une autre panne (réseau, 500) ne touche à rien.
  const qc = useQueryClient()
  const detailNotFound = accountQuery.error instanceof ApiError && accountQuery.error.status === 404
  useEffect(() => {
    if (detailNotFound) void qc.invalidateQueries({ queryKey: ['accounts', 'list'] })
  }, [detailNotFound, qc])

  return {
    account: accountQuery.data ?? null,
    contacts: contactsQuery.data ?? [],
    loading: accountQuery.isLoading || contactsQuery.isLoading,
    error: accountQuery.error?.message ?? contactsQuery.error?.message ?? null,
  }
}
