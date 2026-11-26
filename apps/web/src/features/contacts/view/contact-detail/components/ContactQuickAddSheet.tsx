import { Box, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea } from '@bellum/ui'
import { PlusCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateNote } from '@/features/crm-core/hooks/useNotes'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { TaskComposerForm } from '@/features/tasks/view/TaskComposer'

type Kind = 'note' | 'task'

/**
 * #4135 — ajouter une note OU une tâche liée au contact SANS quitter la fiche.
 *
 * Aucun formulaire nouveau : la note passe par `useCreateNote` (même endpoint
 * que `NotesPanel`) et la tâche par `TaskComposerForm` + `useCreateTask` (les
 * champs requis — objectif, résultat attendu — sont ceux du créateur de tâches,
 * pas une version allégée). Le contenu ne se monte qu'ouvert : une fiche
 * fermée ne paie aucun hook.
 */
export function ContactQuickAddSheet({ contactId, accountId }: { contactId: string; accountId: string | null }) {
  const { t } = useTranslation('contacts')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" icon={PlusCircle} onClick={() => setOpen(true)}>
        {t('quickAdd.open')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent closeLabel={t('common:actions.close')} className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('quickAdd.title')}</SheetTitle>
            <SheetDescription>{t('quickAdd.description')}</SheetDescription>
          </SheetHeader>
          {open ? <QuickAddBody contactId={contactId} accountId={accountId} onDone={() => setOpen(false)} /> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function QuickAddBody({
  contactId,
  accountId,
  onDone,
}: {
  contactId: string
  accountId: string | null
  onDone: () => void
}) {
  const { t } = useTranslation('contacts')
  const [kind, setKind] = useState<Kind>('note')
  const [body, setBody] = useState('')
  const createNote = useCreateNote('contact', contactId)
  const createTask = useCreateTask()

  return (
    <Box className="space-y-4 px-4 pb-4">
      <Box display="flex" className="gap-1" role="group" aria-label={t('quickAdd.kindLabel')}>
        {(['note', 'task'] as const).map(value => (
          <Button
            key={value}
            variant={kind === value ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {t(`quickAdd.kind.${value}`)}
          </Button>
        ))}
      </Box>

      {kind === 'note' ? (
        <Box className="space-y-2">
          <Textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder={t('quickAdd.notePlaceholder')}
            aria-label={t('quickAdd.noteLabel')}
            className="min-h-[96px]"
            autoFocus
          />
          <Button
            variant="black"
            size="sm"
            disabled={body.trim().length === 0}
            isLoading={createNote.isPending}
            onClick={() => createNote.mutate({ body: body.trim() }, { onSuccess: onDone })}
          >
            {t('quickAdd.noteSubmit')}
          </Button>
        </Box>
      ) : (
        <TaskComposerForm
          onCancel={onDone}
          isPending={createTask.isPending}
          // Le compte n'est jamais deviné : un contact sans compte crée une
          // tâche rattachée au seul contact.
          onSubmit={draft =>
            createTask.mutate({ ...draft, contactId, accountId: accountId ?? undefined }, { onSuccess: onDone })
          }
        />
      )}
    </Box>
  )
}
