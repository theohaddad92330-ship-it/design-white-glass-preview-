import type { Submission } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Box,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectOwners } from '@/features/projects/hooks/useProjectOwners'
import { useRecordSubmissionNextAction } from '../api'

const LABEL_MAX = 300

/**
 * #2189.39 (épopée #2940) — la prochaine action de CE positionnement,
 * TOUJOURS datée et attribuée : le contrat (`recordSubmissionNextActionSchema`)
 * refuse déjà un champ posé sans les deux autres, ce formulaire ne fait que
 * les poser ensemble — ou les trois à vide pour effacer.
 */
export function NextActionDialog({
  submission,
  open,
  onClose,
}: {
  submission: Submission
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')
  const record = useRecordSubmissionNextAction()
  const { members } = useProjectOwners()

  const [label, setLabel] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [ownerId, setOwnerId] = useState('')

  useEffect(() => {
    if (!open) return
    setLabel(submission.nextActionLabel ?? '')
    setDueAt(submission.nextActionDueAt ?? '')
    setOwnerId(submission.nextActionOwnerId ?? '')
  }, [open, submission])

  const canSave = label.trim().length > 0 && dueAt.length > 0 && ownerId.length > 0

  const submit = () => {
    if (record.isPending || !canSave) return
    record.mutate({ id: submission.id, label: label.trim(), dueAt, ownerId }, { onSuccess: () => onClose() })
  }

  const clear = () => {
    if (record.isPending) return
    record.mutate({ id: submission.id, label: null, dueAt: null, ownerId: null }, { onSuccess: () => onClose() })
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('nextAction.title', { name: submission.consultantName ?? t('unknownTalent') })}</DialogTitle>
          <DialogDescription>{t('nextAction.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-3">
          <Box className="space-y-1.5">
            <Label htmlFor="next-action-label">{t('nextAction.label')}</Label>
            <Input
              id="next-action-label"
              value={label}
              maxLength={LABEL_MAX}
              placeholder={t('nextAction.labelPlaceholder')}
              onChange={event => setLabel(event.target.value)}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="next-action-due">{t('nextAction.dueAt')}</Label>
            <Input id="next-action-due" type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} />
          </Box>

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('nextAction.owner')}
            </Text>
            <SelectField
              size="sm"
              ariaLabel={t('nextAction.owner')}
              value={ownerId}
              emptyOption={{ label: t('nextAction.owner') }}
              options={members.map(member => ({ value: member.id, label: member.name }))}
              onChange={setOwnerId}
            />
          </Box>
        </Box>

        <DialogFooter>
          {submission.nextActionLabel ? (
            <Button type="button" variant="ghost" disabled={record.isPending} onClick={clear}>
              {t('nextAction.clear')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={record.isPending || !canSave} isLoading={record.isPending}>
            {t('nextAction.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
