import { useQuery } from '@tanstack/react-query'
import type { ConsultantSectorKnowledgeList } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #5017.2 — les consultants de l'espace qui connaissent le secteur du compte (lecture seule, secteurs SOURCÉS). */
export function useConsultantsKnowingSector(sector: string | null | undefined) {
  const { user } = useSession()
  const wanted = (sector ?? '').trim()
  return useQuery<ConsultantSectorKnowledgeList>({
    queryKey: ['accounts', 'consultants-knowing-sector', wanted],
    queryFn: () => accountsApi.getConsultantsKnowingSector(wanted),
    enabled: wanted.length > 0 && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
