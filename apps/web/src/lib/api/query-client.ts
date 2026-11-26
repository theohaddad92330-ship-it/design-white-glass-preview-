import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { notifyIfRateLimited, parseApiStatus } from '@/lib/rate-limit-toast'

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: notifyIfRateLimited }),
    mutationCache: new MutationCache({ onError: notifyIfRateLimited }),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60 * 24,
        retry: (failureCount, error) => {
          const status = parseApiStatus(error)
          if (status !== null && status >= 400 && status < 500) return false
          return failureCount < 1
        },
      },
    },
  })
}
