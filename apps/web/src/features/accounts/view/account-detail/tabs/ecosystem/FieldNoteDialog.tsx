import type { NoteEntityType } from '@bellum/contracts'
import { ActionDialog, Textarea } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { crmKeys, notesApi } from '@/features/crm-core/api'

/**
 * #3406 — « Ajouter une information terrain » sur une relation de l'écosystème.
 * Le bouton renvoyait vers l'onglet Partenaires, où rien ne s'ouvrait : il
 * ouvre maintenant un dialogue qui écrit une NOTE du compte (route `/notes`
 * existante, datée et signée), préfixée du nom de la relation.
 * référence visuelle : AgendaSlotProposalTrigger.tsx (ActionDialog @bellum/ui).
 */
export function FieldNoteDialog({
  accountId,
  relationName,
  open,
  onOpenChange,
}: {
  accountId: string
  relationName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accounts')
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const entityType: NoteEntityType = 'account'

  const save = useMutation({
    mutationFn: () => notesApi.create({ entityType, entityId: accountId, body: `${relationName} — ${text.trim()}` }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: crmKeys.notes(entityType, accountId) })
      toast.success(t('ecosystemTop.fieldNote.saved'))
      setText('')
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message || t('ecosystemTop.fieldNote.error')),
  })

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={MessageSquarePlus}
      title={t('ecosystemTop.fieldNote.title', { name: relationName })}
      description={t('ecosystemTop.fieldNote.description')}
      content={
        <Textarea
          value={text}
          onChange={event => setText(event.target.value)}
          rows={4}
          aria-label={t('ecosystemTop.fieldNote.label')}
          placeholder={t('ecosystemTop.fieldNote.placeholder')}
        />
      }
      validateButtonLabel={t('ecosystemTop.fieldNote.save')}
      validateButtonDisabled={text.trim() === '' || save.isPending}
      isLoading={save.isPending}
      onConfirm={() => save.mutate()}
      cancelButtonLabel={t('ecosystemTop.fieldNote.cancel')}
      closeLabel={t('ecosystemTop.fieldNote.cancel')}
    />
  )
}
