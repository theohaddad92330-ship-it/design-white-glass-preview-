import { useInfiniteScrollSentinel } from '@/lib/hooks/use-infinite-scroll-sentinel'

type LoadMoreParams = {
  hasNextPage: boolean | undefined
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
}

export function useContactsLoadMoreRef(params: LoadMoreParams) {
  return useInfiniteScrollSentinel(params)
}
