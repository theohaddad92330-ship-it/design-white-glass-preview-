import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateTaskInput, Task, TaskScope, UpdateTaskInput } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { taskKeys, tasksApi } from '../api'

/**
 * #2105.20 — `includeDone` demande l'HISTORIQUE, replié par défaut : même
 * raison que le serveur (`listTasksQuerySchema`), une liste de tâches est une
 * liste de choses à faire tant qu'on ne demande pas explicitement le reste.
 */
export function useTasks(scope: TaskScope, id?: string, options: { enabled?: boolean; includeDone?: boolean } = {}) {
  const { enabled = true, includeDone = false } = options
  return useQuery({
    queryKey: taskKeys.list(scope, id, includeDone),
    queryFn: () => tasksApi.list(scope, id, includeDone),
    enabled,
    select: response => response.items,
    // Même raison que la timeline : le cache persisté est frais 5 min par
    // défaut, et une tâche cochée par un collègue resterait à faire pendant
    // cinq minutes. Sur une liste de tâches, la fraîcheur vaut la requête.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Toute écriture invalide `['tasks']` en entier, et pas seulement la clé
 * courante : une tâche créée depuis une fiche compte doit apparaître dans
 * « Aujourd'hui », et le brief la lit sous une autre clé. Rafraîchir large ici
 * coûte une requête ; ne pas le faire fait douter de l'enregistrement.
 */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tasks'] })
  qc.invalidateQueries({ queryKey: ['briefing'] })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation<Task, Error, CreateTaskInput>({
    mutationFn: input => tasksApi.create(input),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success(i18n.t('tasks:toast.created'))
    },
    onError: () => toast.error(i18n.t('tasks:toast.createError')),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation<Task, Error, { id: string } & UpdateTaskInput>({
    mutationFn: ({ id, ...input }) => tasksApi.update(id, input),
    onSuccess: (_task, variables) => {
      invalidateAll(qc)
      // Cocher est le geste le plus fréquent : lui donner sa propre confirmation
      // évite de faire lire « Tâche modifiée » à quelqu'un qui vient de terminer
      // quelque chose.
      if (variables.status === 'done') toast.success(i18n.t('tasks:toast.done'))
    },
    onError: () => toast.error(i18n.t('tasks:toast.saveError')),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => tasksApi.remove(id),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success(i18n.t('tasks:toast.deleted'))
    },
    onError: () => toast.error(i18n.t('tasks:toast.deleteError')),
  })
}
