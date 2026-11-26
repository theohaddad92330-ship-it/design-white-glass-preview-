import type {
  AssignInterventionInput,
  DecideInterventionInput,
  DecidePlaybookSendInput,
  Intervention,
  PlaybookApproval,
  PlaybookDryRun,
  PlaybookKey,
  PlaybookSubscription,
  UpdatePlaybookInput,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { humanizeBlockerCodes } from './humanizeBlockerCodes'

export const playbookKeys = {
  list: () => ['playbooks'] as const,
  interventions: () => ['playbooks', 'interventions'] as const,
  dryRun: (playbook: PlaybookKey) => ['playbooks', playbook, 'dry-run'] as const,
  approvals: () => ['playbooks', 'approvals'] as const,
}

export const playbooksApi = {
  list(): Promise<{ items: PlaybookSubscription[] }> {
    return apiFetch<{ items: PlaybookSubscription[] }>({ path: '/playbooks' })
  },
  update(playbook: PlaybookKey, input: UpdatePlaybookInput): Promise<PlaybookSubscription> {
    return apiFetch<PlaybookSubscription, UpdatePlaybookInput>({
      path: `/playbooks/${playbook}`,
      method: 'PUT',
      body: input,
    })
  },
  async interventions(): Promise<{ items: Intervention[] }> {
    const response = await apiFetch<{ items: Intervention[] }>({ path: '/playbooks/interventions' })
    // R24-FIX-B — le détail cite des codes de bloqueurs : jamais bruts à l'écran (FR/EN, `missions:readiness.blockers`).
    const label = (code: string): string | null => {
      const key = `readiness.blockers.${code}`
      return i18n.exists(key, { ns: 'missions' }) ? i18n.t(key, { ns: 'missions' }) : null
    }
    return {
      ...response,
      items: response.items.map(item => ({ ...item, detail: humanizeBlockerCodes(item.detail, label) })),
    }
  },
  decide(id: string, input: DecideInterventionInput): Promise<void> {
    return apiFetch<void, DecideInterventionInput>({
      path: `/playbooks/interventions/${id}/decide`,
      method: 'POST',
      body: input,
    })
  },
  assign(id: string, input: AssignInterventionInput): Promise<void> {
    return apiFetch<void, AssignInterventionInput>({
      path: `/playbooks/interventions/${id}/assign`,
      method: 'POST',
      body: input,
    })
  },
  dryRun(playbook: PlaybookKey): Promise<PlaybookDryRun> {
    return apiFetch<PlaybookDryRun>({ path: `/playbooks/${playbook}/dry-run` })
  },
  approvals(): Promise<{ items: PlaybookApproval[] }> {
    return apiFetch<{ items: PlaybookApproval[] }>({ path: '/playbooks/approvals' })
  },
  decideSend(
    id: string,
    input: DecidePlaybookSendInput,
  ): Promise<{ state: 'sent' | 'rejected' | 'failed'; reason?: string }> {
    return apiFetch<{ state: 'sent' | 'rejected' | 'failed'; reason?: string }, DecidePlaybookSendInput>({
      path: `/playbooks/approvals/${id}`,
      method: 'POST',
      body: input,
    })
  },
  /** #2856 — reste : reporter une relance en attente (`null` la réveille). */
  snooze(id: string, until: string | null): Promise<{ id: string; snoozedUntil: string | null }> {
    return apiFetch<{ id: string; snoozedUntil: string | null }, { until: string | null }>({
      path: `/playbooks/approvals/${id}/snooze`,
      method: 'POST',
      body: { until },
    })
  },
}

export function usePlaybooks() {
  return useQuery({
    queryKey: playbookKeys.list(),
    queryFn: playbooksApi.list,
    select: response => response.items,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useUpdatePlaybook() {
  const qc = useQueryClient()
  return useMutation<PlaybookSubscription, Error, { playbook: PlaybookKey } & UpdatePlaybookInput>({
    mutationFn: ({ playbook, ...input }) => playbooksApi.update(playbook, input),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: playbookKeys.list() })
      // Le message DIT ce qui vient de changer : armer un envoi automatique vers
      // des clients ne doit pas se confirmer par un « Enregistré » anonyme.
      toast.success(result.enabled ? i18n.t('playbooks:toast.armed') : i18n.t('playbooks:toast.stopped'))
    },
    onError: error => toast.error(error.message || i18n.t('playbooks:toast.error')),
  })
}

export function useInterventions() {
  return useQuery({
    queryKey: playbookKeys.interventions(),
    queryFn: playbooksApi.interventions,
    select: response => response.items,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useDecideIntervention() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string } & DecideInterventionInput>({
    mutationFn: ({ id, ...input }) => playbooksApi.decide(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: playbookKeys.interventions() })
    },
    onError: () => toast.error(i18n.t('playbooks:toast.error')),
  })
}

/** #2206.53 — le manager attribue (ou libère) une intervention. */
export function useAssignIntervention() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string } & AssignInterventionInput>({
    mutationFn: ({ id, ...input }) => playbooksApi.assign(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: playbookKeys.interventions() })
    },
    onError: () => toast.error(i18n.t('playbooks:toast.error')),
  })
}

/**
 * La SIMULATION d'un playbook — ce qu'il ferait s'il était armé.
 *
 * `enabled` pilote la requête : on ne simule qu'à la demande, parce que la
 * simulation parcourt les positionnements, missions ou projets de l'espace et
 * évalue l'opt-out de chaque destinataire. La lancer au montage de l'écran ferait
 * payer ce parcours à qui vient seulement lire le dictionnaire.
 *
 * `staleTime: 0` : le résultat dépend de l'heure (les heures calmes) et de ce
 * qui a été envoyé aujourd'hui. Une simulation en cache dirait « 4 partiraient »
 * à 21 h, ce qui est faux.
 */
export function usePlaybookDryRun(playbook: PlaybookKey, enabled: boolean) {
  return useQuery({
    queryKey: playbookKeys.dryRun(playbook),
    queryFn: () => playbooksApi.dryRun(playbook),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Les relances automatiques qui attendent MA validation.
 *
 * Scopée à l'utilisateur côté serveur : la messagerie d'où partirait le message
 * est personnelle. `staleTime: 0` parce qu'une demande périme au bout de trois
 * jours et qu'un cache montrerait un bouton qui ne fera rien.
 */
export function usePlaybookApprovals(enabled = true) {
  return useQuery({
    queryKey: playbookKeys.approvals(),
    queryFn: playbooksApi.approvals,
    select: response => response.items,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Valider — ou refuser — une relance automatique.
 *
 * Le message de succès DIT ce qui s'est passé, et il distingue les trois issues.
 * « Enregistré » sur un envoi client serait la pire confirmation possible : elle
 * ne dit pas si le message est parti.
 */
export function useDecidePlaybookSend() {
  const qc = useQueryClient()
  return useMutation<
    { state: 'sent' | 'rejected' | 'failed'; reason?: string },
    Error,
    { id: string } & DecidePlaybookSendInput
  >({
    mutationFn: ({ id, ...input }) => playbooksApi.decideSend(id, input),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: playbookKeys.approvals() })
      if (result.state === 'sent') toast.success(i18n.t('playbooks:approvals.sent'))
      else if (result.state === 'rejected') toast.success(i18n.t('playbooks:approvals.rejected'))
      // Un échec d'envoi n'est PAS un succès silencieux : la décision est prise,
      // le message n'est pas parti, et l'écran le dit avec la raison du serveur.
      else toast.error(i18n.t('playbooks:approvals.failed'), { description: result.reason })
    },
    onError: error => toast.error(error.message || i18n.t('playbooks:toast.error')),
  })
}

/** #2856 — reste : reporter une relance en attente de validation. */
export function useSnoozePlaybookSend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) => playbooksApi.snooze(id, until),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: playbookKeys.approvals() })
    },
  })
}
