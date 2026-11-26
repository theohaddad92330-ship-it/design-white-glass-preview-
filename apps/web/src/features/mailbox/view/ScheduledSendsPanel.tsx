import {
  SCHEDULABLE_DRAFT_CHANNELS,
  scheduledSendDisplayState,
  scheduledSendIsChangeable,
  type MyMessageDraftItem,
  type ScheduledMessageSendItem,
} from '@bellum/contracts'
import { Box, Button, Input, Text, TYPE_SCALE } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMyMessageDrafts, useScheduleSendActions, useScheduledSends } from '../api'
import { isoToZonedLocal, zonedLocalToIso } from '../lib/scheduled-send-time'

const KNOWN_FAILURES = new Set([
  'mailbox_unavailable',
  'suppressed',
  'already_sent',
  'validation_mismatch',
  'validation_missing',
  'workspace_changed',
  'demo_send_blocked',
  'no_email',
])

/**
 * Théo M2 — envoi programmé — « À venir » dans la Messagerie existante, version MINIMALE (le redessin Théo viendra
 * après le lot design system). Un brouillon VALIDÉ par le commercial se programme à une date et une heure lues dans
 * SON fuseau ; il part seul, par sa boîte. Annuler ou changer l'heure tant que rien n'est parti. « Envoyé le … »
 * n'apparaît qu'avec la preuve (le message retrouvé dans les éléments envoyés) — sinon l'état le dit.
 */
export function ScheduledSendsPanel({ timeZone, showEmpty = false }: { timeZone: string; showEmpty?: boolean }) {
  const { t } = useTranslation('mailbox')
  const sends = useScheduledSends().data?.items ?? []
  const drafts = useMyMessageDrafts().data?.items ?? []
  const live = new Set(sends.filter(item => item.status === 'scheduled').map(item => item.versionId))
  const toSchedule = drafts.filter(
    draft =>
      draft.validatedAt !== null &&
      (SCHEDULABLE_DRAFT_CHANNELS as readonly string[]).includes(draft.channel) &&
      !live.has(draft.id),
  )
  if (sends.length === 0 && toSchedule.length === 0) {
    // Théo B m1.R2 — l'onglet « À venir » ouvert sur rien le DIT ; hors onglet, le panneau se tait.
    if (!showEmpty) return null
    return (
      <Box className="flex flex-col gap-1 rounded-lg border border-dashed border-[var(--bellum-border)] p-6">
        <Text size="sm" weight="medium">
          {t('scheduled.empty.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('scheduled.empty.subtitle')}
        </Text>
      </Box>
    )
  }

  return (
    <section aria-labelledby="mailbox-scheduled-title" className="flex flex-col gap-3">
      <Box className="flex flex-col gap-1">
        <Text element="h2" id="mailbox-scheduled-title" className={TYPE_SCALE.sectionTitle}>
          {t('scheduled.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('scheduled.subtitle')}
        </Text>
      </Box>
      {sends.length > 0 ? (
        <ul aria-label={t('scheduled.listAria')} className="flex flex-col gap-2">
          {sends.map(item => (
            <ScheduledSendRow key={item.id} item={item} timeZone={timeZone} />
          ))}
        </ul>
      ) : null}
      {toSchedule.length > 0 ? (
        <Box className="flex flex-col gap-2">
          <Text element="h3" size="sm" weight="medium">
            {t('scheduled.toScheduleTitle')}
          </Text>
          <ul className="flex flex-col gap-2">
            {toSchedule.map(draft => (
              <DraftToScheduleRow key={draft.id} draft={draft} timeZone={timeZone} />
            ))}
          </ul>
        </Box>
      ) : null}
    </section>
  )
}

export function ScheduledSendRow({ item, timeZone }: { item: ScheduledMessageSendItem; timeZone: string }) {
  const { t, i18n } = useTranslation('mailbox')
  const { cancel, reschedule } = useScheduleSendActions()
  const [moving, setMoving] = useState(false)
  const display = scheduledSendDisplayState(item)
  const date = display.at
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
        new Date(display.at),
      )
    : ''
  const reason =
    display.kind === 'failed'
      ? t(
          `scheduled.failure.${display.failureCode && KNOWN_FAILURES.has(display.failureCode) ? display.failureCode : 'other'}`,
        )
      : ''

  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex min-w-0 flex-col gap-0.5">
          <Text size="sm" weight="medium" className="truncate">
            {item.subject ?? t('scheduled.noSubject')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(`scheduled.state.${display.kind}`, { date, reason })}
          </Text>
        </Box>
        {scheduledSendIsChangeable(item) ? (
          <Box className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => setMoving(open => !open)}>
              {t('scheduled.actions.reschedule')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(item.id)}
            >
              {t('scheduled.actions.cancel')}
            </Button>
          </Box>
        ) : null}
      </Box>
      {moving ? (
        <SchedulePicker
          idPrefix={`reschedule-${item.id}`}
          timeZone={timeZone}
          initial={isoToZonedLocal(item.scheduledAt, timeZone)}
          confirmLabel={t('scheduled.actions.confirmReschedule')}
          pending={reschedule.isPending}
          error={reschedule.error}
          onClose={() => setMoving(false)}
          onConfirm={scheduledAt =>
            reschedule.mutate({ id: item.id, body: { scheduledAt, timeZone } }, { onSuccess: () => setMoving(false) })
          }
        />
      ) : null}
    </li>
  )
}

function DraftToScheduleRow({ draft, timeZone }: { draft: MyMessageDraftItem; timeZone: string }) {
  const { t } = useTranslation('mailbox')
  const { schedule } = useScheduleSendActions()
  const [open, setOpen] = useState(false)
  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" weight="medium" className="min-w-0 truncate">
          {draft.editedSubject ?? draft.subject ?? t('scheduled.noSubject')}
        </Text>
        {open ? null : (
          <Button size="sm" className="min-h-11" onClick={() => setOpen(true)}>
            {t('scheduled.actions.schedule')}
          </Button>
        )}
      </Box>
      {open ? (
        <SchedulePicker
          idPrefix={`schedule-${draft.id}`}
          timeZone={timeZone}
          initial=""
          confirmLabel={t('scheduled.actions.confirm')}
          pending={schedule.isPending}
          error={schedule.error}
          onClose={() => setOpen(false)}
          onConfirm={scheduledAt =>
            schedule.mutate({ versionId: draft.id, scheduledAt, timeZone }, { onSuccess: () => setOpen(false) })
          }
        />
      ) : null}
    </li>
  )
}

export function SchedulePicker({
  idPrefix,
  timeZone,
  initial,
  confirmLabel,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  idPrefix: string
  timeZone: string
  initial: string
  confirmLabel: string
  pending: boolean
  error: Error | null
  onClose: () => void
  onConfirm: (scheduledAtIso: string) => void
}) {
  const { t } = useTranslation('mailbox')
  const [local, setLocal] = useState(initial)
  const iso = zonedLocalToIso(local, timeZone)
  const inputId = `${idPrefix}-at`
  return (
    <Box className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t('scheduled.picker.label')}
      </label>
      <Input
        id={inputId}
        type="datetime-local"
        value={local}
        aria-describedby={`${inputId}-hint`}
        onChange={event => setLocal(event.target.value)}
      />
      <Text id={`${inputId}-hint`} size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('scheduled.picker.hint', { timeZone })}
      </Text>
      {error ? (
        <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
          {t('scheduled.error', { message: error.message })}
        </Text>
      ) : null}
      <Box className="flex items-center gap-2">
        <Button size="sm" className="min-h-11" disabled={!iso || pending} onClick={() => iso && onConfirm(iso)}>
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11" onClick={onClose}>
          {t('scheduled.actions.close')}
        </Button>
      </Box>
    </Box>
  )
}
