import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ActionPlanOutcome, OutreachCallTaskStatus } from '@bellum/contracts'
import { useAssignAtsWrite, useDecideAtsWrite, useSnoozeAtsWrite } from '@/features/ats/api'
import {
  useAssignCrmWrite,
  useBulkRejectCrmWrite,
  useDecideCrmWrite,
  useReviseCrmWrite,
  useSnoozeCrmWrite,
} from '@/features/crm/api'
import { useDecidePlaybookSend, useSnoozePlaybookSend } from '@/features/playbooks/api'
import { useCompleteRelance } from '@/features/actions/hooks/useCompleteRelance'
import { planItemsApi } from '@/features/actions/planItems.api'
import { contactsApi } from '@/features/contacts/api'
import { outreachApi, outreachMessagesApi } from '@/features/outreach/api'
import { tasksApi } from '@/features/tasks/api'
import { trackCrmWritebackConfirmed } from '@/lib/product-tracker'
import { actionOsApi } from '../action-os/api'
import { formatDate } from '@/lib/locale'
import { announceFollowUps, followUpChannelOnDone } from './faitFollowUps'
import { dueDate, withDayKeepingTime } from './todayDates'
import type { TodayItem } from './todayQueue'

/**
 * Lot L-A (#4164) — LES GESTES de la file « Aujourd'hui ».
 *
 * Ce hook n'écrit RIEN lui-même : chaque geste est celui de la maison native de
 * l'item (les mêmes mutations que les écrans d'origine), donc les mêmes gardes
 * serveur — un refus (409 « déjà traité », droit retiré, expiré) s'affiche avec
 * SA raison. Chaque geste rend `true` s'il a abouti : la rafale n'avance que sur
 * un succès, jamais sur une carte qui a échoué.
 *
 * ⚠️ « Fait » reste DÉCLARATIF (c73) — il n'est jamais une preuve d'envoi.
 * ⚠️ Rien ici n'envoie un message : « valider » un message le met en état
 * `approved` (c'est le dispatcher, sous mandat, qui envoie — c82).
 */

/** Les issues d'un appel atteignables depuis « en cours » — la même table que le serveur. */
export const CALL_OUTCOMES = ['completed', 'no_answer', 'callback', 'qualified', 'refused', 'wrong_person'] as const
export type CallOutcome = (typeof CALL_OUTCOMES)[number]

const BEFORE_STARTED: readonly string[] = ['ready', 'scheduled', 'due', 'callback', 'no_answer']

/** L'écran du traceur produit : la file « Aujourd'hui » est la route `/actions/`. */
const TODAY_SCREEN = '/actions/'

/**
 * Le canal d'un envoi qu'on peut DÉCLARER : une relance ou une étape e-mail / LinkedIn visant un contact résolu.
 * Un appel, une tâche ou une écriture CRM n'ont rien à « marquer envoyé » ; sans contact, rien n'est inventé.
 */
export function declarableChannel(item: TodayItem): 'email' | 'linkedin' | null {
  if (!item.contactId) return null
  if (item.kind !== 'plan_item' && item.kind !== 'sequence_step') return null
  return item.channel === 'email' || item.channel === 'linkedin' ? item.channel : null
}

export function useTodayGestures(now: Date) {
  const { t } = useTranslation('actions')
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())

  const decideCrm = useDecideCrmWrite()
  const snoozeCrm = useSnoozeCrmWrite()
  const assignCrm = useAssignCrmWrite()
  const reviseCrmWrite = useReviseCrmWrite()
  const bulkRejectCrm = useBulkRejectCrmWrite()
  const decideErp = useDecideAtsWrite()
  const snoozeErp = useSnoozeAtsWrite()
  const assignErp = useAssignAtsWrite()
  const decideSend = useDecidePlaybookSend()
  const snoozeSend = useSnoozePlaybookSend()
  const completeRelance = useCompleteRelance()

  const refresh = useCallback(() => {
    for (const key of [['outreach'], ['action-os'], ['plan-items'], ['tasks'], ['dashboard']] as const) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient])

  /** Exécute `work` pour un item : marque « en cours », rend `true` si abouti, dit la raison sinon. */
  const run = useCallback(
    async (
      item: TodayItem,
      work: () => Promise<unknown>,
      success?: string | ((result: unknown) => string),
    ): Promise<boolean> => {
      setPending(previous => new Set(previous).add(item.id))
      try {
        const result = await work()
        const message = typeof success === 'function' ? success(result) : success
        if (message) toast.success(message)
        refresh()
        return true
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : t('today.toast.failed'))
        return false
      } finally {
        setPending(previous => {
          const next = new Set(previous)
          next.delete(item.id)
          return next
        })
      }
    },
    [refresh, t],
  )

  const decide = useCallback(
    (item: TodayItem, decision: 'approve' | 'reject'): Promise<boolean> => {
      const success = t(decision === 'approve' ? 'center.approved' : 'center.rejected')
      switch (item.kind) {
        case 'approval':
          return run(item, () => actionOsApi.decide(item.nativeId, decision), success)
        case 'crm_write':
          return run(
            item,
            async () => {
              await decideCrm.mutateAsync({ id: item.nativeId, approve: decision === 'approve' })
              // #2319.129/.130 — confirmé = approuvé ET réussi, et seulement pour une écriture composée
              // par un compte rendu (provenance déjà portée par `sourceKey`). Écran seul.
              if (decision === 'approve' && item.sourceKey === 'meeting_note') trackCrmWritebackConfirmed(TODAY_SCREEN)
            },
            t(decision === 'approve' ? 'writeRequests.approved' : 'writeRequests.rejected', { ns: 'crm' }),
          )
        case 'erp_write':
          return run(item, () => decideErp.mutateAsync({ id: item.nativeId, decision }), success)
        case 'playbook_send':
          return run(item, () => decideSend.mutateAsync({ id: item.nativeId, decision }))
        case 'message':
          if (decision === 'reject') return Promise.resolve(false)
          return run(
            item,
            () => outreachMessagesApi.approve({ items: [{ id: item.nativeId, version: item.version ?? 1 }] }),
            t('today.toast.validated'),
          )
        default:
          return Promise.resolve(false)
      }
    },
    [run, t, decideCrm, decideErp, decideSend],
  )

  const validate = useCallback((item: TodayItem) => decide(item, 'approve'), [decide])
  const reject = useCallback((item: TodayItem) => decide(item, 'reject'), [decide])

  /**
   * #4167 (L-D2) — « Rejeter le lot » : refuse toutes les écritures CRM d'un lot par l'endpoint de refus
   * en masse existant (même porte `data:export`). Un refus n'écrit rien. Chaque issue est rendue
   * séparément : un échec partiel se dit, il n'est jamais couvert par un succès global.
   */
  const rejectBatch = useCallback(
    async (batch: readonly TodayItem[]): Promise<boolean> => {
      const crm = batch.filter(item => item.kind === 'crm_write')
      if (crm.length === 0) return false
      setPending(previous => new Set([...previous, ...crm.map(item => item.id)]))
      try {
        const result = await bulkRejectCrm.mutateAsync(crm.map(item => item.nativeId))
        const failed = result.failed.length
        if (failed === 0) toast.success(t('today.batch.rejected', { count: result.succeeded.length }))
        else toast.error(t('today.batch.partial', { failed, total: crm.length }))
        refresh()
        return failed === 0
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : t('today.toast.failed'))
        return false
      } finally {
        setPending(previous => {
          const next = new Set(previous)
          for (const item of crm) next.delete(item.id)
          return next
        })
      }
    },
    [bulkRejectCrm, refresh, t],
  )

  const postpone = useCallback(
    (item: TodayItem, day: string): Promise<boolean> => {
      const until = withDayKeepingTime(null, day, now)
      const success = t('today.toast.postponed')
      switch (item.kind) {
        case 'approval':
          return run(item, () => actionOsApi.snooze(item.nativeId, until), success)
        case 'crm_write':
          return run(item, () => snoozeCrm.mutateAsync({ id: item.nativeId, until }), success)
        case 'erp_write':
          return run(item, () => snoozeErp.mutateAsync({ id: item.nativeId, until }), success)
        case 'playbook_send':
          return run(item, () => snoozeSend.mutateAsync({ id: item.nativeId, until }), success)
        case 'message':
        case 'sequence_step':
          if (!item.parentId || !item.stepId) return Promise.resolve(false)
          return run(
            item,
            () =>
              outreachApi.updateStep(item.parentId as string, item.stepId as string, {
                due_at: withDayKeepingTime(item.dueAt, day, now),
              }),
            success,
          )
        case 'plan_item':
          return run(item, () => planItemsApi.update(item.nativeId, { due_date: day }), success)
        case 'call_task':
          return run(
            item,
            () => outreachMessagesApi.postponeCall(item.nativeId, withDayKeepingTime(item.dueAt, day, now)),
            success,
          )
        case 'task':
          return run(item, () => tasksApi.update(item.nativeId, { dueOn: day }), success)
      }
    },
    [now, run, t, snoozeCrm, snoozeErp, snoozeSend],
  )

  /** « Fait » — déclaratif. L'issue est celle que l'humain choisit : jamais devinée. */
  const complete = useCallback(
    (
      item: TodayItem,
      choice?: { outcome?: ActionPlanOutcome; callOutcome?: CallOutcome; callbackDate?: string },
    ): Promise<boolean> => {
      const success = t('today.toast.done')
      switch (item.kind) {
        case 'plan_item':
          if (!choice?.outcome) return Promise.resolve(false)
          return run(
            item,
            async () => {
              const outcome = choice.outcome as ActionPlanOutcome
              await completeRelance.mutateAsync({ id: item.nativeId, outcome, callbackDate: choice.callbackDate })
              // #4418.1 — « Fait » reste déclaratif, mais planifie la même cadence J+3/J+6/J+9 et l'annonce.
              const channel = followUpChannelOnDone(declarableChannel(item), outcome)
              return channel && item.contactId
                ? announceFollowUps(item.contactId, channel, {
                    declareSent: contactsApi.declareSent,
                    cadence: contactsApi.getCadence,
                  })
                : null
            },
            result => {
              const planned = result as { nextOn: string } | null
              const nextOn = planned ? dueDate(planned.nextOn) : null
              return nextOn
                ? t('today.toast.doneFollowUps', { date: formatDate(nextOn, { day: '2-digit', month: 'short' }) })
                : success
            },
          )
        case 'sequence_step':
          if (!item.parentId) return Promise.resolve(false)
          return run(item, () => outreachApi.stepDone(item.parentId as string, item.nativeId), success)
        case 'call_task': {
          const target: OutreachCallTaskStatus = choice?.callOutcome ?? 'completed'
          return run(
            item,
            async () => {
              if (item.status && BEFORE_STARTED.includes(item.status)) {
                await outreachMessagesApi.transitionCall(item.nativeId, {
                  to: 'started',
                  cause: t('today.toast.callCause'),
                  proof: null,
                })
              }
              await outreachMessagesApi.transitionCall(item.nativeId, {
                to: target,
                cause: t('today.toast.callCause'),
                proof: null,
              })
            },
            success,
          )
        }
        case 'task':
          return run(item, () => tasksApi.update(item.nativeId, { status: 'done' }), success)
        default:
          return Promise.resolve(false)
      }
    },
    [run, t, completeRelance],
  )

  /**
   * #4418.1 — « Marquer envoyé » : le commercial a envoyé LUI-MÊME, hors Bellum. Déclaratif (c73, c81) : le serveur
   * journalise le geste et planifie la MÊME cadence qu'un envoi Bellum (J+3/J+6/J+9, jour déclaré = aujourd'hui) ;
   * aucune preuve d'envoi n'est posée. N'écrit pas « fait » sur l'item : l'issue reste le choix de l'humain.
   */
  const markSent = useCallback(
    (item: TodayItem): Promise<boolean> => {
      const channel = declarableChannel(item)
      if (!item.contactId || !channel) return Promise.resolve(false)
      const contactId = item.contactId
      return run(item, () => contactsApi.declareSent(contactId, channel), t('today.toast.sentDeclared'))
    },
    [run, t],
  )

  const saveDraft = useCallback(
    (item: TodayItem, draft: { subject: string | null; body: string }): Promise<boolean> => {
      if (item.kind !== 'message') return Promise.resolve(false)
      return run(
        item,
        () =>
          outreachMessagesApi.revise(item.nativeId, {
            subject: draft.subject,
            body: draft.body,
            base_version: item.version ?? 1,
          }),
        t('today.toast.saved'),
      )
    },
    [run, t],
  )

  /** Corriger une écriture CRM avant de l'autoriser : une demande NEUVE, figée à son tour. */
  const reviseCrm = useCallback(
    (item: TodayItem, changes: Record<string, string>): Promise<boolean> => {
      if (item.kind !== 'crm_write') return Promise.resolve(false)
      return run(item, () => reviseCrmWrite.mutateAsync({ id: item.nativeId, changes }))
    },
    [run, reviseCrmWrite],
  )

  const assign = useCallback(
    (item: TodayItem, assigneeId: string | null): Promise<boolean> => {
      const success = t(assigneeId ? 'center.routing.assigned' : 'center.routing.unassigned')
      switch (item.kind) {
        case 'approval':
          return run(item, () => actionOsApi.assign(item.nativeId, assigneeId), success)
        case 'crm_write':
          return run(item, () => assignCrm.mutateAsync({ id: item.nativeId, assigneeId }), success)
        case 'erp_write':
          return run(item, () => assignErp.mutateAsync({ id: item.nativeId, assigneeId }), success)
        default:
          return Promise.resolve(false)
      }
    },
    [run, t, assignCrm, assignErp],
  )

  return {
    validate,
    reject,
    rejectBatch,
    postpone,
    complete,
    markSent,
    saveDraft,
    reviseCrm,
    assign,
    isPending: (item: TodayItem) => pending.has(item.id),
  }
}
