import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { DISCOVER_CALL_LIST_QUERY_KEY } from './useDiscoverCallList'

/** Ce que le geste a besoin de savoir d'une entreprise de la liste d'appels. */
interface CallListCompanyTarget {
  siren: string
  company: string
  accountId: string | null
}

export interface FindPeopleProgress {
  done: number
  total: number
  failed: number
}

/**
 * Lance la recherche de contacts déjà en place pour UNE entreprise : celle
 * du dossier compte (`POST /analysis/:id/enrich-contacts`, gratuite, la même
 * que « Élargir la recherche » de l'onglet Contacts). Un candidat qui n'est
 * pas encore un compte rejoint d'abord le portefeuille (même geste que
 * « Ajouter à mon portefeuille ») : les personnes trouvées ont besoin d'un
 * dossier où vivre. Jamais un contact inventé : ce qui revient est ce que la
 * recherche a trouvé.
 */
async function findPeopleFor(target: CallListCompanyTarget): Promise<void> {
  const accountId =
    target.accountId ?? (await accountsApi.addToPortfolio({ company_name: target.company, siren: target.siren })).id
  await accountsApi.enrichContacts(accountId)
}

/**
 * #2545 / #3819 (démo Ludovic 08/10) — « Trouver 10 personnes à appeler », par
 * entreprise ou pour toute la liste. Au retour, la liste d'appels (source
 * unique `POST /contacts/call-list`) est relue : les personnes trouvées y
 * apparaissent, classées, sans rechargement.
 */
export function useFindCallListPeople() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [progress, setProgress] = useState<FindPeopleProgress | null>(null)

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: DISCOVER_CALL_LIST_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }, [queryClient])

  const findOne = useCallback(async (target: CallListCompanyTarget): Promise<boolean> => {
    setPending(prev => new Set(prev).add(target.siren))
    try {
      await findPeopleFor(target)
      return true
    } catch {
      return false
    } finally {
      setPending(prev => {
        const next = new Set(prev)
        next.delete(target.siren)
        return next
      })
    }
  }, [])

  const findForCompany = useCallback(
    async (target: CallListCompanyTarget): Promise<boolean> => {
      const ok = await findOne(target)
      await refresh()
      return ok
    },
    [findOne, refresh],
  )

  /** Une entreprise après l'autre : la recherche de chaque dossier dure de
   *  quelques secondes à une minute, et dix en parallèle saturent la source. */
  const findForAll = useCallback(
    async (targets: readonly CallListCompanyTarget[]): Promise<FindPeopleProgress> => {
      let done = 0
      let failed = 0
      setProgress({ done, total: targets.length, failed })
      for (const target of targets) {
        const ok = await findOne(target)
        done += 1
        if (!ok) failed += 1
        setProgress({ done, total: targets.length, failed })
        // La liste se remplit AU FIL de l'eau, pas seulement à la fin.
        void refresh()
      }
      const final = { done, total: targets.length, failed }
      setProgress(null)
      return final
    },
    [findOne, refresh],
  )

  return { pending, progress, findForCompany, findForAll }
}
