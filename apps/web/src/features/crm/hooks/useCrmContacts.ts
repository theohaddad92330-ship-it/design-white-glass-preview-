import { useInfiniteQuery } from '@tanstack/react-query'
import { crmApi, type CrmContactPage } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

const CRM_CONTACTS_KEY = ['crm-contacts'] as const

const PAGE_SIZE = 20

/**
 * Imports the rep's existing CRM contacts from `GET /crm/contacts`, cursor-
 * paginated via HubSpot's opaque `after` token. Only runs when a CRM is
 * connected (`enabled`) so it never fires on the disconnected screen.
 */
export function useCrmContacts(enabled: boolean) {
  const { user } = useSession()
  return useInfiniteQuery<CrmContactPage>({
    queryKey: [...CRM_CONTACTS_KEY, user?.id],
    queryFn: ({ pageParam }) => crmApi.listContacts({ limit: PAGE_SIZE, after: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextAfter ?? undefined,
    enabled: enabled && !!user,
    staleTime: 30_000,
  })
}
