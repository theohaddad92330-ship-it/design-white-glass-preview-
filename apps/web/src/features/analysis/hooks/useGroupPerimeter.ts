import { useQuery } from '@tanstack/react-query'
import { groupPerimeterSchema, type GroupPerimeter } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

const SIREN = /^\d{9}$/

/**
 * Lot 757 — le groupe et ses filiales d'une entité (`GET /group-perimeter/:siren`), pour le sélecteur de
 * périmètre de l'analyse. Lecture du registre : une heure de fraîcheur suffit, un groupe ne change pas
 * d'organigramme entre deux frappes. Sans SIREN à neuf chiffres : aucune requête.
 */
export function useGroupPerimeter(siren: string | undefined) {
  const valid = Boolean(siren && SIREN.test(siren))
  return useQuery({
    queryKey: ['group-perimeter', siren ?? null],
    // Une réponse hors contrat (moteur d'une autre version, double de test) vaut « pas de groupe connu » :
    // jamais un écran cassé, jamais une entité devinée.
    queryFn: async (): Promise<GroupPerimeter | null> => {
      const parsed = groupPerimeterSchema.safeParse(await apiFetch<unknown>({ path: `/group-perimeter/${siren}` }))
      return parsed.success ? parsed.data : null
    },
    enabled: valid,
    staleTime: 60 * 60 * 1000,
  })
}
