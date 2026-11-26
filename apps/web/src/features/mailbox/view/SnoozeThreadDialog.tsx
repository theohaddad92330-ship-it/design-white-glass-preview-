import type { MailThread } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { decodeHtmlEntities } from '@/lib/decode-html-entities'
import { useSnoozeThread } from '../api'
import { isoToZonedLocal, zonedLocalToIso } from '../lib/scheduled-send-time'

/** Demain 09:00, dans le fuseau du profil — un point de départ éditable, jamais une date imposée. */
function tomorrowMorning(timeZone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return `${isoToZonedLocal(tomorrow.toISOString(), timeZone).slice(0, 10)}T09:00`
}

/**
 * Théo B m1 — « Reprendre cet échange plus tard ». Le fil sort de « À traiter » et y revient à la date choisie ;
 * il reste retrouvable dans « À venir ». Reporter ne contacte personne : ni e-mail, ni rappel externe.
 */
export function SnoozeThreadDialog({
  thread,
  open,
  onOpenChange,
  timeZone,
}: {
  thread: MailThread | null
  open: boolean
  onOpenChange: (open: boolean) => void
  timeZone: string
}) {
  const { t } = useTranslation('mailbox')
  const snooze = useSnoozeThread()
  const [local, setLocal] = useState(() => tomorrowMorning(timeZone))
  const iso = zonedLocalToIso(local, timeZone)

  if (!thread) return null

  const submit = () => {
    if (!iso) return
    snooze.mutate({ threadId: thread.threadId, until: iso }, { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('snooze.title')}</DialogTitle>
          <DialogDescription>{decodeHtmlEntities(thread.subject) ?? t('thread.noSubject')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('m2.upcoming.fromDate')}
          <Input type="datetime-local" value={local} onChange={event => setLocal(event.target.value)} />
        </label>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('snooze.behavior')} {t('m2.upcoming.noExternal')}
        </Text>
        {snooze.isError ? (
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {t('snooze.failed')}
          </Text>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('draft.cancel')}
          </Button>
          <Button className="min-h-11" disabled={!iso || snooze.isPending} onClick={submit}>
            {t('snooze.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
