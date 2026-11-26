import type { CreateTaskInput, Task, TaskScope, UpdateTaskInput } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export const taskKeys = {
  list: (scope: TaskScope, id?: string, includeDone = false) => ['tasks', scope, id ?? 'none', includeDone] as const,
}

export const tasksApi = {
  // #2105.20 — l'historique se demande explicitement : par défaut, une liste
  // de tâches est une liste de choses À FAIRE (même raison que le serveur,
  // voir `listTasksQuerySchema`).
  list(scope: TaskScope, id?: string, includeDone = false): Promise<{ items: Task[] }> {
    const params = new URLSearchParams({ scope })
    if (id) params.set('id', id)
    if (includeDone) params.set('includeDone', 'true')
    return apiFetch<{ items: Task[] }>({ path: `/tasks?${params.toString()}` })
  },
  create(input: CreateTaskInput): Promise<Task> {
    return apiFetch<Task, CreateTaskInput>({ path: '/tasks', method: 'POST', body: input })
  },
  update(id: string, input: UpdateTaskInput): Promise<Task> {
    return apiFetch<Task, UpdateTaskInput>({ path: `/tasks/${id}`, method: 'PATCH', body: input })
  },
  remove(id: string): Promise<void> {
    return apiFetch<void>({ path: `/tasks/${id}`, method: 'DELETE' })
  },
}
