import { useQuery } from '@tanstack/react-query'
import { notionApi, type NotionStatus } from '@/features/notion/api'
import { useSession } from '@/lib/hooks/use-session'

export const NOTION_STATUS_KEY = ['notion-status'] as const

export function useNotionStatus() {
  const { user } = useSession()
  return useQuery<NotionStatus>({
    queryKey: [...NOTION_STATUS_KEY, user?.id],
    queryFn: () => notionApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
