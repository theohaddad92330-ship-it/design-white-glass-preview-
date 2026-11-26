import { useAuth } from '@/hooks/useAuth'
import { useProfilerStream } from '@/features/profile-context/hooks/useProfilerStream'

export function useProfileContextBackgroundTask(): void {
  const { user } = useAuth()
  useProfilerStream(user?.id)
}
