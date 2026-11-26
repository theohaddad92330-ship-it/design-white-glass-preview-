import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MessageLibraryEntry } from '@bellum/contracts'
import { messageLibraryApi } from '@/features/message-library/api'
import { useSession } from '@/lib/hooks/use-session'

/** La bibliothèque d'exemples commerciaux de l'espace (#3427). */
export function useMessageLibrary() {
  const { user } = useSession()
  return useQuery<MessageLibraryEntry[]>({
    queryKey: ['message-library', user?.id] as const,
    queryFn: () => messageLibraryApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** #3427 — importe les séquences livrées puis relit la bibliothèque. */
export function useImportMessageLibraryDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => messageLibraryApi.importDefaults(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['message-library'] }),
  })
}
