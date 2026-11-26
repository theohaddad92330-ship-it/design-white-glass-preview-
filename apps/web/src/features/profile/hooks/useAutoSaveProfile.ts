import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AutoSaveStatus, EsnAnswers } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { profileContextKeys } from '@/features/profile-context/api'
import { useSaveEsnProfile } from '@/features/profile/hooks/useSaveEsnProfile'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import type { ProfileValues } from './useProfileAnswers'

const DEBOUNCE_MS = 800
const TASK_ID = 'profile:save'
const SAVED_HIDE_MS = 1500

/**
 * Auto-saves the ESN answers whenever `values` becomes dirty. Debounces typing
 * so a single save fires per pause. Uses a mutation ref to keep the effect deps
 * minimal — re-running on every `mutate` identity change would reset the
 * debounce timer on every render.
 *
 * Also pushes the save into the global background-tasks store so the sidebar
 * indicator surfaces it alongside running analyses.
 */
export function useAutoSaveProfile(values: ProfileValues, dirty: boolean) {
  const save = useSaveEsnProfile()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const mutateRef = useRef(save.mutate)
  mutateRef.current = save.mutate
  const register = useBackgroundTasksStore(s => s.register)
  const fail = useBackgroundTasksStore(s => s.fail)
  const clear = useBackgroundTasksStore(s => s.clear)

  useEffect(() => {
    if (!dirty) return
    setStatus('saving')
    const timer = setTimeout(() => {
      register({
        id: TASK_ID,
        title: i18n.t('profile:autoSave.taskTitle'),
        label: i18n.t('profile:autoSave.taskLabel'),
        loaderVariant: 'grid-syncing',
        subtitle: i18n.t('common:states.saving'),
      })
      mutateRef.current(values as Partial<EsnAnswers>, {
        onSuccess: () => {
          setStatus('saved')
          toast.success(i18n.t('profile:autoSave.toast.saved'))
          setTimeout(() => clear(TASK_ID), SAVED_HIDE_MS)
          void queryClient.invalidateQueries({ queryKey: profileContextKeys.me })
        },
        onError: err => {
          console.error('[Profile]', err)
          setStatus('error')
          fail(TASK_ID, err instanceof Error ? err.message : i18n.t('profile:errors.saveFailed'))
        },
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [values, dirty, register, fail, clear, queryClient])

  return status
}
