import { useQuery } from '@tanstack/react-query'
import type { ProfileContextResponse } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'
import { useSession } from '@/lib/hooks/use-session'

export function useProfileContext() {
  const { user } = useSession()
  return useQuery<ProfileContextResponse>({
    queryKey: profileContextKeys.me,
    queryFn: () => profileContextApi.getMe(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
