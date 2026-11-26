import { useQuery } from '@tanstack/react-query'
import { analysisStatusKey, fetchAnalysisStatus } from '@/hooks/useAnalysisStatusSync'

/**
 * #2478 — « les analyses échouent presque à chaque fois et en plus c'est
 * faux, une grande partie a fonctionné ».
 *
 * `AccountDetailStatusBanners` rendait un « Analyse échouée » nu sur un
 * compte `status='error'`, sans jamais dire ce qui avait réellement abouti
 * avant l'échec terminal — alors que `GET /analysis/status/:accountId` le
 * SAIT depuis la correction API du même point (l'outbox garde une trace
 * `analysis.phase_completed` par phase committée). Ce hook porte cette seule
 * lecture, pour que la bannière n'ait qu'à l'afficher.
 *
 * `null` — jamais `[]` par défaut — tant que la réponse n'est pas arrivée
 * (chargement, `enabled=false`, ou une API plus ancienne qui n'a pas encore
 * le champ) : une absence d'information n'est pas une mesure de zéro.
 */
export function useFailedAnalysisPhases(accountId: string, enabled: boolean): string[] | null {
  const query = useQuery({
    queryKey: analysisStatusKey(accountId),
    queryFn: () => fetchAnalysisStatus(accountId),
    enabled,
    staleTime: 30_000,
  })
  return query.data?.completedPhases ?? null
}
