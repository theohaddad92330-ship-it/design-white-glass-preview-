import { useQuery } from '@tanstack/react-query'
import { stageSlaApi, type StageSlaRow } from '@/features/settings/lib/stage-sla-api'

/**
 * #2170.43 — LES SEUILS D'ÉTAPE DE L'ESPACE, lus par le pipe.
 *
 * MÊME clé que l'écran de réglage (`PipelineSlaView`, `['pipeline-stage-sla']`) :
 * un seuil enregistré là-bas rafraîchit la carte et le filtre « vieillissantes »
 * sans second appel ni seconde copie (GA-26). `undefined` tant que rien n'est lu
 * — `staleThresholdsFor` retombe alors sur 7/14/30, jamais sur « aucun seuil ».
 */
export function useStageSlaRows(): readonly StageSlaRow[] | undefined {
  const { data } = useQuery({
    queryKey: ['pipeline-stage-sla'],
    queryFn: () => stageSlaApi.list(),
    staleTime: 60_000,
  })
  return data?.items
}
