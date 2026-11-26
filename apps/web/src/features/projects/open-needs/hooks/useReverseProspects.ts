import { useQuery } from '@tanstack/react-query'
import { reverseProspectsApi } from '../api'

/**
 * « Un besoin sans candidat ouvre une piste » — voir le docblock de
 * `reverse-need-prospects.ts` côté serveur.
 *
 * `enabled` porte le geste qui déclenche la lecture : la section ne s'affiche
 * — donc n'interroge le serveur — que quand le besoin n'a personne sur la
 * table (`shortlist_count === 0`, {@link NeedReverseProspects}).
 */
export function useReverseProspects(needId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['open-needs', 'reverse-prospects', needId],
    queryFn: () => reverseProspectsApi.get(needId),
    enabled: enabled && needId.length > 0,
  })
}
