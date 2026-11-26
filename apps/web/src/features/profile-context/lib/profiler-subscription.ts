import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { profileContextKeys } from '@/features/profile-context/api'
import { subscribeToProfiler } from '@/lib/socket'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import { useProfilerProgressStore } from '@/stores/profilerProgressStore'

const TASK_ID = 'profile-context:regenerate'
const TASK_CLEAR_DELAY_MS = 2000

function stepLabel(phase: string): string {
  const step = useProfilerProgressStore.getState().steps.find(s => s.key === phase)
  return step?.label ?? i18n.t('profile:context.task.inProgress')
}

function registerOrUpdateTask(phase: string): void {
  const tasks = useBackgroundTasksStore.getState()
  const subtitle = i18n.t('profile:context.task.subtitle', { step: stepLabel(phase) })
  if (tasks.tasks[TASK_ID]) {
    tasks.update(TASK_ID, { subtitle })
    return
  }
  tasks.register({
    id: TASK_ID,
    title: i18n.t('profile:context.task.title'),
    label: i18n.t('profile:context.task.label'),
    loaderVariant: 'grid-syncing',
    subtitle,
  })
}

export function subscribeToProfilerProgress(userId: string, queryClient: QueryClient): () => void {
  const { start, complete, pushDecision, finishAll, fail, reset } = useProfilerProgressStore.getState()
  reset()
  // #3386 — le toast ne confirme qu'une mise à jour dont CET onglet a vu le début :
  // un `done` rejoué par la socket ne doit pas surgir sur un écran sans rapport.
  let startedHere = false
  const invalidate = () => queryClient.invalidateQueries({ queryKey: profileContextKeys.me })

  return subscribeToProfiler(userId, {
    onPhaseStarted: ({ phase, message }) => {
      startedHere = true
      start(phase, message)
      registerOrUpdateTask(phase)
    },
    onPhaseComplete: ({ phase, message }) => {
      complete(phase, message)
      if (phase === 'done') {
        setTimeout(() => void invalidate(), 1500)
      }
    },
    onField: ({ field, label, preview }) => pushDecision({ field, label, preview }),
    onDone: () => {
      finishAll()
      const tasks = useBackgroundTasksStore.getState()
      tasks.complete(TASK_ID, i18n.t('profile:context.task.done'))
      if (startedHere) toast.success(i18n.t('profile:context.toast.updated'))
      startedHere = false
      setTimeout(() => useBackgroundTasksStore.getState().clear(TASK_ID), TASK_CLEAR_DELAY_MS)
      void invalidate()
    },
    onError: ({ message }) => {
      fail(message)
      useBackgroundTasksStore.getState().fail(TASK_ID, message)
      toast.error(message)
    },
  })
}
