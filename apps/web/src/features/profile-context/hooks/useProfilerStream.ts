import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeToProfilerProgress } from '@/features/profile-context/lib/profiler-subscription'

export function useProfilerStream(userId: string | null | undefined): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId) return
    return subscribeToProfilerProgress(userId, queryClient)
  }, [userId, queryClient])
}
