import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { weakestLinkDiagnosisApi, weakestLinkDiagnosisKeys } from './api'

/**
 * BEL-SC-224 (#3253, P0) — même motif que `useAccountStrategy5P` : une
 * requête, une clé, `staleTime` généreux (le diagnostic se réévalue en léger
 * chaque semaine côté API, pas à chaque montage d'écran).
 */
export function useWeakestLinkDiagnosis() {
  const { user } = useSession()

  return useQuery({
    queryKey: weakestLinkDiagnosisKeys.current(),
    queryFn: weakestLinkDiagnosisApi.get,
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
