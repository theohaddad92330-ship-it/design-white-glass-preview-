import {
  businessUnitListSchema,
  type BusinessUnitList,
  type BusinessUnitView,
  type CreateBusinessUnit,
  type UpdateBusinessUnit,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2118.9 — le client des périmètres de l'espace (`/business-units`).
 *
 * Aucune route ne reçoit l'identité de la personne : le serveur la lit dans le
 * jeton. « Rejoindre » et « Demander l'accès » valent donc toujours POUR SOI —
 * l'écran ne peut inscrire personne d'autre, par construction.
 */
export const businessUnitsApi = {
  /** Les périmètres de l'espace ACTIF, et le niveau d'accès de l'appelant. */
  async list(): Promise<BusinessUnitList> {
    const raw = await apiFetch<unknown>({ path: '/business-units' })
    // Une réponse illisible est une erreur, pas une liste vide : « aucun
    // périmètre » serait une affirmation fausse sur l'espace.
    return businessUnitListSchema.parse(raw)
  },
  join(id: string): Promise<{ joined: boolean }> {
    return apiFetch<{ joined: boolean }>({ path: `/business-units/${encodeURIComponent(id)}/join`, method: 'POST' })
  },
  requestAccess(id: string): Promise<{ requested: boolean }> {
    return apiFetch<{ requested: boolean }, Record<string, never>>({
      path: `/business-units/${encodeURIComponent(id)}/access-request`,
      method: 'POST',
      body: {},
    })
  },
  /** #2017.7 / #2087.17 — « en créer une », gagé côté serveur sur `team:manage`
   *  (`@RequirePermission`) : un appel sans le rôle reçoit un 403, jamais une
   *  BU fantôme. */
  create(input: CreateBusinessUnit): Promise<BusinessUnitView> {
    return apiFetch<BusinessUnitView, CreateBusinessUnit>({
      path: '/business-units',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2005.5 — la fiche d'un périmètre (capacité, objectif du trimestre, et les
   * champs préexistants effectif / taille d'équipe / note de portefeuille).
   * Gagé côté serveur sur `team:manage` (`@RequirePermission`), exactement
   * comme `create` : un appel sans le rôle reçoit un 403, jamais une fiche
   * silencieusement ignorée.
   */
  update(id: string, patch: UpdateBusinessUnit): Promise<BusinessUnitView> {
    return apiFetch<BusinessUnitView, UpdateBusinessUnit>({
      path: `/business-units/${encodeURIComponent(id)}`,
      method: 'PATCH',
      body: patch,
    })
  },
}
