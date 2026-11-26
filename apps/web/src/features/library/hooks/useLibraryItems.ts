import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateLibraryItem, LibraryItem, LibraryItemKind, UpdateLibraryItem } from '@bellum/contracts'
import { libraryApi } from '@/features/library/api'
import { useSession } from '@/lib/hooks/use-session'

const libraryKey = (kind: LibraryItemKind, userId?: string) => ['library-items', kind, userId] as const

/** The workspace's templates or playbooks (`kind`). Seeded server-side on first read. */
export function useLibraryItems(kind: LibraryItemKind) {
  const { user } = useSession()
  return useQuery<LibraryItem[]>({
    queryKey: libraryKey(kind, user?.id),
    queryFn: () => libraryApi.list(kind),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useCreateLibraryItem() {
  const qc = useQueryClient()
  return useMutation<LibraryItem, Error, CreateLibraryItem>({
    mutationFn: input => libraryApi.create(input),
    onSuccess: item => qc.invalidateQueries({ queryKey: ['library-items', item.kind] }),
  })
}

export function useUpdateLibraryItem() {
  const qc = useQueryClient()
  return useMutation<LibraryItem, Error, { id: string; patch: UpdateLibraryItem }>({
    mutationFn: ({ id, patch }) => libraryApi.update(id, patch),
    onSuccess: item => qc.invalidateQueries({ queryKey: ['library-items', item.kind] }),
  })
}

export function useDeleteLibraryItem(kind: LibraryItemKind) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: id => libraryApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-items', kind] }),
  })
}
