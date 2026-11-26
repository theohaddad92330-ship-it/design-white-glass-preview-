import { Button } from '@bellum/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'

/**
 * Refonte Théo (`.v18-head-actions`) — « Ajouter une tâche », le geste principal de
 * l'en-tête de « Aujourd'hui ». Il ouvre le MÊME composeur que « Transformer en tâche »
 * et que la liste des tâches (`TaskComposer`), jamais un second formulaire.
 */
export function TodayAddTaskButton() {
  const { t } = useTranslation('briefing')
  const [open, setOpen] = useState(false)
  const createTask = useCreateTask()
  return (
    <>
      <Button size="sm" className="min-h-11" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {t('tasks.add')}
      </Button>
      {open ? (
        <TaskComposer
          open
          onOpenChange={next => {
            if (!next) setOpen(false)
          }}
          isPending={createTask.isPending}
          onSubmit={draft => createTask.mutate(draft, { onSuccess: () => setOpen(false) })}
        />
      ) : null}
    </>
  )
}
