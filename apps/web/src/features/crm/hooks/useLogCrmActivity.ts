import { useMutation } from '@tanstack/react-query'
import { crmApi } from '@/features/crm/api'

type LogCrmActivityInput = { crmId: string; note: string }

/**
 * Logs an activity note onto a CRM contact's timeline
 * (`POST /crm/contacts/:crmId/activity`) — the write-back half of the 2-way CRM
 * sync ("email envoyé depuis Bellum", "contact qualifié", …). Toasting is left
 * to the caller so it can summarise a batch (N contacts logged) in one message.
 */
export function useLogCrmActivity() {
  return useMutation<{ id: string }, Error, LogCrmActivityInput>({
    mutationKey: ['crm', 'log-activity'],
    mutationFn: ({ crmId, note }) => crmApi.logActivity(crmId, note),
  })
}
