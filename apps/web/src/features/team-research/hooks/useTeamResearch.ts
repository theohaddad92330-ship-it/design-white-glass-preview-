import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecordTeamResearch } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { teamResearchApi } from '../api'

const KEY = ['team-research'] as const

/** Les recherches conservées de toute l'équipe — lecture ouverte à tout membre (Q3). */
export function useTeamResearch() {
  const { user } = useSession()
  return useQuery({
    queryKey: [...KEY, user?.id] as const,
    queryFn: () => teamResearchApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Découvrir garde chaque recherche lancée pour l'équipe. Un échec ne gêne jamais la recherche. */
export function useRecordTeamResearch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RecordTeamResearch) => teamResearchApi.record(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })
}
