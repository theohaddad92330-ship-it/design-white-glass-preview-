/**
 * Théo B c5-fiche-contact.N4 (décision Louis 22/10/2026) — le TYPE d'interlocuteur à deux valeurs de la fiche,
 * obtenu en REGROUPANT les rôles décisionnels existants : aucune donnée nouvelle, aucune propriété stockée.
 * Le rôle détaillé (Sponsor, Décideur économique, Champion…) reste lisible dans « Rôle & périmètre ».
 *
 * Un rôle inconnu ou absent ne fait AUCUN type : on n'affiche pas ce qu'on n'a pas.
 */
export type ContactInterlocutorKind = 'business' | 'access'

const BUSINESS_ROLES: ReadonlySet<string> = new Set(['economic', 'technical', 'user', 'sponsor', 'operational'])
const ACCESS_ROLES: ReadonlySet<string> = new Set(['champion', 'influencer', 'procurement', 'purchasing', 'blocker'])

export function contactInterlocutorKind(role: string | null | undefined): ContactInterlocutorKind | null {
  if (!role) return null
  if (BUSINESS_ROLES.has(role)) return 'business'
  if (ACCESS_ROLES.has(role)) return 'access'
  return null
}
