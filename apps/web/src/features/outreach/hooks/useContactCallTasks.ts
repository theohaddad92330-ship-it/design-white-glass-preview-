import type { OutreachCallTask, OutreachCallTaskStatus } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { outreachMessagesApi } from '../api'

/**
 * #3697.7 — les statuts d'une tâche d'appel qui n'est PAS terminée : un appel à venir ou en cours.
 * Les issues (`completed`, `no_answer`, `wrong_person`, `qualified`, `refused`, `cancelled`) sont
 * du passé : elles se lisent dans l'historique, jamais parmi les appels « à passer ».
 */
const UPCOMING_CALL_STATUSES: readonly OutreachCallTaskStatus[] = [
  'proposed',
  'ready',
  'scheduled',
  'due',
  'started',
  'callback',
]

/** Les appels À PASSER d'un contact — même requête (même clé) que le centre d'approbation. */
export function upcomingCallsOf(tasks: readonly OutreachCallTask[], contactId: string): OutreachCallTask[] {
  return tasks.filter(task => task.contact_id === contactId && UPCOMING_CALL_STATUSES.includes(task.status))
}

export function useContactCallTasks(contactId: string) {
  return useQuery<OutreachCallTask[], Error, OutreachCallTask[]>({
    queryKey: ['outreach', 'call-tasks'],
    queryFn: () => outreachMessagesApi.listCalls(),
    select: tasks => upcomingCallsOf(tasks, contactId),
  })
}
