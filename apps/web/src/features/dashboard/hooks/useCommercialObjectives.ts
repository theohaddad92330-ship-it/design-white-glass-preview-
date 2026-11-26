import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { dashboardApi } from '../api'

/**
 * Les sept objectifs commerciaux nommés (lot FA, #2114.16-.27) — cible,
 * réalisé réel, période, couverture des données.
 *
 * `/objectives/*` demande la feature de plan `manager_cockpit` (« les
 * objectifs se posent depuis le Pilotage : même porte », `objectives.controller.ts`) :
 * un espace qui ne la porte pas voit `isError` sans jamais afficher de zéro —
 * `CommercialObjectivesCard` se masque dans ce cas, comme `ObjectivesPanel`
 * côté cockpit manager.
 *
 * La route demande AUSSI `finance:read:own` (GA-05) : elle rend `revenue` et
 * `margin`, des chiffres de paie. Un `viewer` ou un `tech_admin` reçoit donc un
 * 403 — et c'est juste, aucun des deux ne porte d'objectif commercial. Le même
 * repli joue : la carte se masque, elle n'affiche JAMAIS de zéro (GA-18/GA-19).
 */
export function useCommercialObjectives() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['dashboard', 'objectives', 'commercial', user?.id] as const,
    queryFn: () => dashboardApi.myCommercialObjectives(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
