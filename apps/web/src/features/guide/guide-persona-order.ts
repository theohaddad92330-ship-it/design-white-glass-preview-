import { GUIDE_PERSONAS, workspaceRoleValues, type GuidePersona, type WorkspaceRole } from '@bellum/contracts'

/**
 * #2214.17-.22 (épopée #2788) — LE RÔLE CHANGE L'ORDRE DU CATALOGUE DE GUIDES,
 * JAMAIS SON CONTENU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ORDRE, ET PAS UN FILTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2214.22 demande « l'utilisateur ne voit que les guides de son rôle ». Un
 * FILTRE qui retire les guides des autres personas romprait `c76_role_reordonne
 * _jamais_ne_filtre` (décision Louis 21/09/2026, `apps/api/src/modules/briefing
 * /briefing-role-order.ts` et `laura-home-role-order.ts`, ce dépôt) : le rôle
 * choisit par quoi l'écran s'ouvre, il n'en retire et n'en renomme aucune —
 * précisément pour qu'une personne ne perde jamais un guide parce qu'un rôle
 * est mal renseigné (un admin qui a aussi besoin, un jour, du guide
 * « Contacts »). Ce fichier applique donc EXACTEMENT le même principe que
 * {@link import('../chat/view/laura-home-role-order').orderByRole} au
 * catalogue de guides — une table à part (même raison que la sienne : classer
 * des GUIDES est une question différente de classer des CARTES d'accueil), le
 * même verbe : réordonner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DE TRI
 * ─────────────────────────────────────────────────────────────────────────────
 * Un guide dont `audience` est VIDE (= tout le monde) ou contient le persona
 * de l'appelant passe en TÊTE, dans l'ordre du registre ; les autres suivent,
 * dans le même ordre relatif — jamais retirés, seulement moins prioritaires.
 * Le tri est STABLE (même discipline que `orderByRole`).
 */
const PERSONA_OF_ROLE: Record<WorkspaceRole, GuidePersona> = {
  owner: 'administrateur',
  admin: 'administrateur',
  tech_admin: 'administrateur',
  sales_ops: 'manager',
  recruiter: 'recruteur',
  finance: 'adv_finance',
  sales: 'commercial',
  member: 'commercial',
  viewer: 'commercial',
}

/** Le persona d'un rôle. `null`, absent ou inconnu = commercial (défaut du
 *  registre actuel, entièrement commercial — voir `screenWalkthrough`). */
export function guidePersonaOf(role: WorkspaceRole | null | undefined): GuidePersona {
  if (!role) return 'commercial'
  return PERSONA_OF_ROLE[role] ?? 'commercial'
}

/** Tous les rôles connus — le corpus que la garde éventuelle relit. */
export const KNOWN_WORKSPACE_ROLES_FOR_GUIDES: readonly WorkspaceRole[] = workspaceRoleValues
export const KNOWN_GUIDE_PERSONAS: readonly GuidePersona[] = GUIDE_PERSONAS

/**
 * Réordonne des guides pour ce rôle — même ensemble, même nombre, jamais un
 * filtre. Un guide d'audience vide ou qui cite le persona de l'appelant passe
 * en tête ; les autres suivent, ordre d'origine conservé (tri stable).
 */
export function orderGuidesByPersona<T>(
  items: readonly T[],
  role: WorkspaceRole | null | undefined,
  audienceOf: (item: T) => readonly GuidePersona[],
): T[] {
  const persona = guidePersonaOf(role)
  const rankOf = (item: T): number => {
    const audience = audienceOf(item)
    return audience.length === 0 || audience.includes(persona) ? 0 : 1
  }
  return items
    .map((item, index) => ({ item, index, rank: rankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.item)
}
