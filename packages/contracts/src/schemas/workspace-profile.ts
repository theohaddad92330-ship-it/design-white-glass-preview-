import { z } from 'zod'
import { CONSULTING_DOMAIN_BY_CODE } from './consulting-domains.js'

/**
 * #4270 (18/10) — LE PROFIL D'ESPACE « FORFAIT / CONSEIL ».
 *
 * Le besoin (Julien Seigneur 01/10, précisé par Louis 18/10) : il trouve des
 * besoins, les cadre et suit le projet ; il est payé au FORFAIT et fait
 * travailler les salariés de son client — il ne cherche pas de consultants.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN RÉGLAGE, UN ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * #4270.1 — une réponse du profil d'espace (`esn_profiles.workspace_profile`),
 * posée à l'onboarding et modifiée là où se modifient toutes les autres
 * réponses de l'entreprise (Réglages › profil). Jamais une seconde case
 * ailleurs. Clé ENTREPRISE (hors `ESN_PERSONAL_ANSWER_KEYS`) : un membre ne
 * change pas le profil de l'espace pour lui seul.
 *
 * `null` (aucun choix) = le comportement d'avant, à l'octet près : chaque
 * fonction ci-dessous rend son entrée INCHANGÉE (même référence) sans profil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE CHANGE, JAMAIS LE CONTENU (c76)
 * ─────────────────────────────────────────────────────────────────────────────
 * #4270.2 — Staffing, vivier, positionnements passent au SECOND PLAN : ils
 * descendent, rien n'est masqué ni supprimé.
 */

/** `staffing` = le profil historique, choisi explicitement ; il se comporte
 *  exactement comme l'absence de choix. Seul `forfait_conseil` réordonne. */
export const WORKSPACE_PROFILES = ['staffing', 'forfait_conseil'] as const
export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number]

export const workspaceProfileSchema = z.enum(WORKSPACE_PROFILES)

/** Le profil lu d'un jeu de réponses — `null` quand rien n'est choisi. */
export function workspaceProfileOf(
  answers: { workspace_profile?: unknown } | null | undefined,
): WorkspaceProfile | null {
  const parsed = workspaceProfileSchema.safeParse(answers?.workspace_profile)
  return parsed.success ? parsed.data : null
}

/**
 * #4422.3 — une SPÉCIALISATION FONCTIONNELLE : un espace au forfait/conseil dont
 * le portefeuille d'offre (`offer_domains`) tient dans UN seul groupe de métiers
 * (ex. supply chain : logistique, achats, S&OP). Pour lui, servir plusieurs
 * secteurs n'est pas se disperser : c'est le même métier vendu à plusieurs
 * marchés — l'audit juge alors la dispersion sur les métiers, pas sur les
 * secteurs. Régie, profil absent, ou métiers sur plusieurs groupes : `false`,
 * la règle de dispersion sectorielle reste celle d'avant. Un code inconnu de ce
 * build est écarté, jamais deviné. UN seul endroit (GA-26).
 */
export function hasFunctionalSpecialization(
  answers: { workspace_profile?: unknown; offer_domains?: readonly string[] | null } | null | undefined,
): boolean {
  if (workspaceProfileOf(answers) !== 'forfait_conseil') return false
  const groups = new Set<string>()
  for (const code of answers?.offer_domains ?? []) {
    const domain = CONSULTING_DOMAIN_BY_CODE.get(code)
    if (domain) groups.add(domain.group)
  }
  return groups.size === 1
}

/** #4270.2 — les surfaces de staffing, mises au second plan en forfait. */
export const FORFAIT_SECOND_PLAN_ROUTES: readonly string[] = [
  '/projects/needs',
  '/consultants',
  '/consultants/submissions',
  '/pilotage/staffing',
]

/** Les entrées qui restent EN QUEUE quoi qu'il arrive : l'équipe, le pilotage
 *  et les réglages ne passent jamais derrière le staffing. */
const TRAILING_ROUTES: readonly string[] = ['/team', '/pilotage', '/settings']

/**
 * #4270.2 — réordonne une liste d'entrées de navigation (barre, onglets) selon
 * le profil d'espace. Sans profil : l'entrée elle-même, inchangée. En forfait :
 * les entrées de staffing descendent juste avant la queue (équipe, pilotage,
 * réglages) qui les suit, sinon en fin, dans leur ordre relatif d'origine. Le résultat contient EXACTEMENT
 * les mêmes entrées, chacune une fois (c76).
 */
export function orderNavForWorkspaceProfile<T>(
  items: readonly T[],
  profile: WorkspaceProfile | null,
  routeOf: (item: T) => string,
): readonly T[] {
  if (profile !== 'forfait_conseil') return items
  const secondPlan = items.filter(item => FORFAIT_SECOND_PLAN_ROUTES.includes(routeOf(item)))
  if (secondPlan.length === 0) return items
  // La queue se cherche APRÈS la première entrée de staffing : l'onglet racine
  // `/pilotage`, en tête de ses propres onglets, n'est pas une queue.
  const firstAt = items.findIndex(item => FORFAIT_SECOND_PLAN_ROUTES.includes(routeOf(item)))
  const before = items.slice(0, firstAt)
  const after = items.slice(firstAt).filter(item => !FORFAIT_SECOND_PLAN_ROUTES.includes(routeOf(item)))
  const tailAt = after.findIndex(item => TRAILING_ROUTES.includes(routeOf(item)))
  const cut = tailAt === -1 ? after.length : tailAt
  return [...before, ...after.slice(0, cut), ...secondPlan, ...after.slice(cut)]
}

/**
 * #4270.3 — un besoin lu comme un PROJET À CADRER : périmètre, sponsor, budget.
 *
 * Aucune colonne neuve : chacun relit un champ qui existe déjà sur
 * `project_needs` — le périmètre est le contexte du besoin, le sponsor est le
 * décideur déclaré (une PERSONNE du compte), le budget est le budget en
 * centimes. Tous facultatifs : `null` = non renseigné, jamais « 0 » ni un
 * défaut deviné.
 */
export type NeedFraming = {
  scope: string | null
  sponsorContactId: string | null
  budgetCents: string | null
}

export function needFramingOf(need: {
  context?: string | null
  decision_maker_contact_id?: string | null
  budget_cents?: string | number | null
}): NeedFraming {
  const scope = need.context?.trim()
  return {
    scope: scope ? scope : null,
    sponsorContactId: need.decision_maker_contact_id ?? null,
    budgetCents: need.budget_cents == null ? null : String(need.budget_cents),
  }
}

/**
 * #4270.4 — un besoin en FORFAIT ENCADRÉ (#3547, `delivery_mode = supervised`)
 * se réalise avec les salariés du client : il ne demande aucun consultant.
 * Les portes « présenter » et « gagné » ne peuvent donc pas exiger un
 * positionnement engagé — gagné, il devient une mission encadrée suivie, sans
 * staffing. Un besoin staffé (ou au mode inconnu) garde ses portes.
 */
export function needRequiresStaffing(need: { delivery_mode?: string | null }): boolean {
  return need.delivery_mode !== 'supervised'
}
