import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ContactCrmExports, RecordContactCrmExport } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #3719.4 — où et quand la personne a été exportée vers un CRM, relu après rechargement. */
export function useContactCrmExports(id: string) {
  const { user } = useSession()
  return useQuery<ContactCrmExports>({
    queryKey: contactKeys.crmExports(id),
    queryFn: () => contactsApi.getCrmExports(id),
    enabled: !!user && id.length > 0,
  })
}

/** #3719.4 — consigne un export RÉUSSI (appelé après la réponse du CRM, jamais avant). */
export function useRecordContactCrmExport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, ...body }: { provider: string } & RecordContactCrmExport) =>
      contactsApi.recordCrmExport(id, provider, body),
    onSuccess: data => queryClient.setQueryData(contactKeys.crmExports(id), data),
  })
}
