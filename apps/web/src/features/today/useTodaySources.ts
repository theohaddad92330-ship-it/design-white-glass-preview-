import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAtsWriteRequests } from '@/features/ats/api'
import { useCrmWriteRequests } from '@/features/crm/api'
import { usePlaybookApprovals } from '@/features/playbooks/api'
import { useMyActions } from '@/features/actions/hooks/useMyActions'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useOutreachDelegations } from '@/features/outreach/hooks/useOutreachDelegations'
import { useOutreachSequences } from '@/features/outreach/hooks/useOutreachSequences'
import { useSession } from '@/lib/hooks/use-session'
import { actionOsApi, actionOsKeys } from '../action-os/api'
import { partitionSnoozed } from '../action-os/approvalRouting'
import { buildTodayItems, type TodayItem } from './todayQueue'

/**
 * Lot L-A (#4164) — LES NEUF LECTURES de la file « Aujourd'hui », en un hook.
 *
 * Rien n'est lu ici qui ne l'était déjà : mêmes clés de requête que les écrans
 * d'origine (`actionOsKeys.approvals`, `['outreach', 'call-tasks']`, …), donc
 * une écriture qui invalide l'ancienne liste rafraîchit aussi celle-ci, et deux
 * écrans ouverts ne se contredisent pas. Une demande REPORTÉE (`snoozed_until`)
 * sort de la file jusqu'à sa date, comme avant.
 *
 * Une maison illisible est NOMMÉE (`unavailable`), jamais rendue comme « rien à
 * faire » : une file amputée ne se présente pas comme complète.
 */
export type TodaySourceName =
  | 'approvals'
  | 'crm'
  | 'erp'
  | 'sends'
  | 'messages'
  | 'plan'
  | 'sequences'
  | 'calls'
  | 'tasks'

export function useTodaySources(now: Date) {
  const { user } = useSession()
  const enabled = Boolean(user)

  const approvals = useQuery({
    queryKey: actionOsKeys.approvals,
    queryFn: () => actionOsApi.approvals(),
    enabled,
    staleTime: 30_000,
  })
  const erp = useAtsWriteRequests(enabled)
  const crm = useCrmWriteRequests()
  const sends = usePlaybookApprovals(enabled)
  const messages = useQuery({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    enabled,
  })
  const plan = useMyActions()
  const sequences = useOutreachSequences()
  const calls = useQuery({
    queryKey: ['outreach', 'call-tasks'],
    queryFn: () => outreachMessagesApi.listCalls(),
    enabled,
  })
  const tasks = useQuery({
    queryKey: actionOsKeys.actions,
    queryFn: () => actionOsApi.actions(),
    enabled,
    staleTime: 30_000,
  })
  const delegations = useOutreachDelegations()

  const items = useMemo<TodayItem[]>(() => {
    const active = <T extends { snoozed_until?: string | null }>(rows: readonly T[]) =>
      partitionSnoozed(rows, now).active
    return buildTodayItems(
      {
        approvals: active(approvals.data?.approvals ?? []),
        erp: active((erp.data ?? []).map(request => ({ ...request, snoozed_until: request.snoozedUntil ?? null }))),
        crm: active(
          (crm.data?.status === 'ready' ? crm.data.requests : []).map(request => ({
            ...request,
            snoozed_until: request.snoozedUntil ?? null,
          })),
        ),
        sends: active((sends.data ?? []).map(send => ({ ...send, snoozed_until: send.snoozedUntil ?? null }))),
        messages: Array.isArray(messages.data) ? messages.data : [],
        plan: plan.data ?? [],
        sequences: sequences.data ?? [],
        calls: calls.data ?? [],
        tasks: tasks.data?.actions ?? [],
      },
      now,
    )
  }, [
    approvals.data,
    erp.data,
    crm.data,
    sends.data,
    messages.data,
    plan.data,
    sequences.data,
    calls.data,
    tasks.data,
    now,
  ])

  const failed: [TodaySourceName, boolean][] = [
    ['approvals', approvals.isError],
    ['erp', erp.isError],
    ['crm', crm.isError],
    ['sends', sends.isError],
    ['messages', messages.isError],
    ['plan', plan.isError],
    ['sequences', sequences.isError],
    ['calls', calls.isError],
    ['tasks', tasks.isError],
  ]

  // Un mandat d'envoi VIVANT couvre l'envoi des étapes / des messages préparés :
  // sans lui, la rafale ne valide jamais un message (c82).
  const hasMandate = (delegations.data ?? []).some(
    delegation =>
      delegation.lifecycle === 'active' &&
      (delegation.scope === 'workspace_sequences' ||
        delegation.scope === 'laura_send' ||
        delegation.scope === 'campaign'),
  )

  return {
    items,
    loading: [approvals, erp, crm, sends, messages, plan, sequences, calls, tasks].some(query => query.isLoading),
    unavailable: failed.filter(([, isError]) => isError).map(([name]) => name),
    hasMandate,
    crmStatus: crm.data?.status,
    crmUnread: crm.isLoading || crm.isError,
  }
}
