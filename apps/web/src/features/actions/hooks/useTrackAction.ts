import type { TrackActionInput } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actionsApi } from '@/features/actions/api'
import { contactKeys } from '@/features/contacts/api'

/**
 * Fire-and-forget style: callers just `mutate(input)` and don't await.
 * Invalidates `weekly-stats` so the KPI refreshes after a successful track.
 */
export function useTrackAction() {
  const qc = useQueryClient()
  return useMutation<{ id: string }, Error, TrackActionInput>({
    mutationKey: ['actions', 'track'],
    mutationFn: input => actionsApi.track(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['actions', 'weekly-stats'] })
      qc.invalidateQueries({ queryKey: ['actions', 'history'] })
      if (input.contact_id) {
        qc.invalidateQueries({ queryKey: contactKeys.detail(input.contact_id) })
      }
    },
  })
}
