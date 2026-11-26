import type { MyCommercialObjectivesResponse, PersonalCockpitResponse } from '@bellum/contracts'
import { myCommercialObjectivesResponseSchema } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Le tableau de bord n'a plus qu'une porte, et elle est PERSONNELLE.
 *
 * #1457 — `kpis()` et `roi()` appelaient `GET /dashboard/kpis` et
 * `GET /dashboard/roi`, qui servaient des agrégats d'ESPACE en ne portant que
 * `JwtGuard`. Leur seul lecteur était l'onglet « Équipe » de cet écran, qui
 * doublait le cockpit d'équipe de `/team` — celui-là gardé par `team:manage`.
 * Les deux méthodes, leurs hooks et les deux routes de l'API sont retirés :
 * on retire le MOYEN, pas seulement la permission. Garde GA-254.
 */
export const dashboardApi = {
  /** Personal cockpit (roadmap §5) — my accounts / relances / priorities / messages. */
  me(): Promise<PersonalCockpitResponse> {
    return apiFetch<PersonalCockpitResponse>({ path: '/dashboard/me' })
  },
  /**
   * Les sept objectifs commerciaux nommés (lot FA, #2114.16-.27) : cible +
   * réalisé réel + période + couverture. Vit dans `modules/objectives` côté
   * API (le même moteur que le cockpit manager) — parsé ici pour dégrader
   * proprement si l'API est plus ancienne que le web (déploiement en cours).
   */
  async myCommercialObjectives(): Promise<MyCommercialObjectivesResponse> {
    return myCommercialObjectivesResponseSchema.parse(await apiFetch<unknown>({ path: '/objectives/me/commercial' }))
  },
}
