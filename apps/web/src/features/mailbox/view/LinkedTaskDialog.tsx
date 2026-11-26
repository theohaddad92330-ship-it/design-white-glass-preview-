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
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { decodeHtmlEntities } from '@/lib/decode-html-entities'

/**
 * Théo B m1 — « Créer une tâche liée ». La tâche s'attache au contact et au compte du fil quand on les connaît ; elle
 * ne reprend jamais un mot du corps du message (le corps ne sort pas du fil ouvert) : l'objectif cite l'OBJET.
 */
export function LinkedTaskDialog({
  thread,
  open,
  onOpenChange,
}: {
  thread: MailThread | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('mailbox')
  const create = useCreateTask()
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [details, setDetails] = useState('')

  if (!thread) return null
  const subject = decodeHtmlEntities(thread.subject) ?? t('thread.noSubject')
  const ready = title.trim().length > 0 && dueOn.length > 0

  const submit = () => {
    if (!ready) return
    create.mutate(
      {
        title: title.trim(),
        dueOn,
        priority: 'normal',
        objective: t('task.objective', { subject }),
        expectedResult: t('task.expectedResult'),
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(thread.contactId ? { contactId: thread.contactId } : {}),
        ...(thread.account ? { accountId: thread.account.id } : {}),
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('task.title')}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('task.action')}
          <Input value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('task.dueOn')}
          <Input type="date" value={dueOn} onChange={event => setDueOn(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('task.context')}
          <Textarea rows={3} value={details} onChange={event => setDetails(event.target.value)} />
        </label>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('draft.cancel')}
          </Button>
          <Button className="min-h-11" disabled={!ready || create.isPending} onClick={submit}>
            {t('task.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
