import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'

/** Cadence de suivi. La reconstruction dure des dizaines de secondes : interroger
 *  plus souvent ne la rendrait pas plus rapide, seulement plus bruyante. */
const POLL_INTERVAL_MS = 5_000

/**
 * Suit la reconstruction du graphe d'organigramme lancée derrière une recherche
 * ciblée, et recharge le dossier quand elle aboutit.
 *
 * Pourquoi ce suivi existe : la reconstruction ne tient plus dans la requête du
 * bouton (elle y additionnait deux budgets de phase sur un clic). Elle se termine
 * donc APRÈS la réponse — sans ce hook, la carte d'influence resterait à l'écran
 * telle qu'elle était, et le commercial conclurait, une fois de plus, que sa
 * recherche n'a rien changé.
 *
 * Le sondage ne tourne QUE tant qu'un travail est en cours (`queued`/`active`) :
 * un dossier au repos ne coûte qu'une requête à l'ouverture de l'onglet.
 */
export function useOrgRebuild(accountId: string | undefined): { pending: boolean } {
  const qc = useQueryClient()
  const wasRunning = useRef(false)

  const { data } = useQuery({
    queryKey: accountKeys.orgRebuild(accountId ?? ''),
    queryFn: () => accountsApi.orgRebuildState(accountId as string),
    enabled: Boolean(accountId),
    refetchInterval: query => {
      const state = query.state.data?.state
      return state === 'queued' || state === 'active' ? POLL_INTERVAL_MS : false
    },
  })

  const state = data?.state
  const running = state === 'queued' || state === 'active'

  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    // La transition « en cours → terminé » est le seul moment où il y a du neuf à
    // montrer. Sans ce garde, ouvrir l'onglet sur un `completed` vieux d'une heure
    // annoncerait une mise à jour qui a eu lieu hier.
    if (!wasRunning.current) return
    wasRunning.current = false
    if (state === 'completed') {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId as string) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId as string) })
      toast.success(i18n.t('accounts:toast.orgMapRebuilt'))
      return
    }
    if (state === 'failed') toast.error(i18n.t('accounts:toast.orgMapRebuildFailed'))
  }, [running, state, accountId, qc])

  return { pending: running }
}
