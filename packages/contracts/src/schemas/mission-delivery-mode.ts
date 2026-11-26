import { z } from 'zod'

/**
 * #3547 (02/10/2026, décision Louis) — LE « FORFAIT ENCADRÉ ».
 *
 * Un client de l'ESN travaille au FORFAIT avec les salariés de SON client, sans
 * consultants : il trouve la mission, contacte la DSI, puis cadre ou supervise.
 * Le produit ne connaissait que la mission staffée par des consultants — `unstaffed`
 * s'allumait donc sur une mission qui n'a, par construction, personne à staffer.
 *
 * ⚠️ Ce n'est PAS une cinquième nature de contrat : la nature reste `forfait`
 * (`contract_kind`), le MODE de réalisation dit seulement si des consultants
 * portent le travail. Un seul axe de plus, additif (`delivery_mode`, défaut
 * `staffed` = comportement historique à l'octet près).
 */
export const DELIVERY_MODES = ['staffed', 'supervised'] as const
export const deliveryModeSchema = z.enum(DELIVERY_MODES)
export type DeliveryMode = z.infer<typeof deliveryModeSchema>

/** Le rôle TENU par l'ESN dans un forfait encadré : cadrer, superviser, ou les deux. */
export const SUPERVISION_ROLES = ['framing', 'supervision', 'both'] as const
export const supervisionRoleSchema = z.enum(SUPERVISION_ROLES)
export type SupervisionRole = z.infer<typeof supervisionRoleSchema>

/**
 * Les champs du mode, communs au besoin et à la mission (un seul schéma — GA-26).
 * Tous facultatifs : l'équipe côté client se dit par un NOMBRE ou par des NOMS,
 * ou pas du tout. Jamais de 0 posé par défaut (`min(1)`) : une équipe qu'on ne
 * connaît pas n'est pas une équipe de zéro.
 */
export const supervisedForfaitFieldsSchema = z.object({
  delivery_mode: deliveryModeSchema.optional(),
  supervision_role: supervisionRoleSchema.nullish(),
  client_team_size: z.number().int().min(1).max(10_000).nullish(),
  client_team_names: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
})
export type SupervisedForfaitFields = z.infer<typeof supervisedForfaitFieldsSchema>

/** Les consultants sont-ils attendus ? Seul le mode `supervised` les rend facultatifs. */
export function consultantsExpected(mode: DeliveryMode | null | undefined): boolean {
  return mode !== 'supervised'
}

/**
 * La cohérence du mode, rendue en CODES (jamais en phrase : le web et l'API les
 * nomment chacun dans leur langue). Vide = cohérent.
 *  - `supervised_needs_forfait` : le mode encadré n'existe qu'au forfait — la
 *    nature `inconnu`/absente ne le déduit pas, elle se dit ;
 *  - `role_without_supervised` / `team_without_supervised` : un rôle ou une
 *    équipe sans le mode seraient des champs orphelins que rien ne lirait.
 */
export function deliveryModeProblems(input: {
  contract_kind?: string | null
  delivery_mode?: DeliveryMode | null
  supervision_role?: SupervisionRole | null
  client_team_size?: number | null
  client_team_names?: readonly string[] | null
}): ('supervised_needs_forfait' | 'role_without_supervised' | 'team_without_supervised')[] {
  const supervised = input.delivery_mode === 'supervised'
  const problems: ReturnType<typeof deliveryModeProblems> = []
  if (supervised && input.contract_kind !== 'forfait') problems.push('supervised_needs_forfait')
  if (!supervised && input.supervision_role) problems.push('role_without_supervised')
  if (!supervised && (input.client_team_size != null || (input.client_team_names?.length ?? 0) > 0)) {
    problems.push('team_without_supervised')
  }
  return problems
}

/**
 * L'équipe côté client, dite honnêtement : les NOMS d'abord (ils portent leur
 * propre compte), sinon le NOMBRE déclaré, sinon `null` — « non renseignée »,
 * jamais « 0 » (GA-18/19).
 */
export function clientTeamSummary(input: {
  client_team_size?: number | null
  client_team_names?: readonly string[] | null
}): { count: number; names: string[] } | null {
  const names = (input.client_team_names ?? []).map(name => name.trim()).filter(Boolean)
  if (names.length > 0)
    return {
      count: input.client_team_size && input.client_team_size > names.length ? input.client_team_size : names.length,
      names,
    }
  if (input.client_team_size && input.client_team_size > 0) return { count: input.client_team_size, names: [] }
  return null
}
