import { can, type WorkspacePermission, type WorkspaceRole } from './workspace.js'

/**
 * #2297 — L'EFFACEMENT D'UNE PERSONNE PROSPECTÉE (RGPD art. 17), décision Louis
 * du 19/09/2026. Qui a le droit d'effacer : la règle vit ICI, une seule fois
 * (GA-26), lue par la route (`PersonErasureService`) et par l'écran qui
 * propose le geste (`ContactErasureCard`) — deux copies divergeraient au
 * premier rôle ajouté.
 *
 * Fichier de faits PURS — aucune dépendance hors `workspace.ts`, aucun I/O.
 *
 * LE CHOIX (demandé par la décision : « admin ou propriétaire de la fiche ») :
 * les DEUX, et rien d'autre.
 *   - un propriétaire ou un administrateur de l'espace efface n'importe quelle
 *     personne de l'espace — c'est à lui qu'arrive une demande adressée à la
 *     société (le responsable de traitement), et il doit pouvoir y répondre
 *     même quand le commercial qui porte la fiche est absent ou parti ;
 *   - le PORTEUR de la fiche (qui l'a créée, ou à qui elle est attribuée)
 *     efface SA fiche — c'est lui que la personne a en face, souvent lui qui
 *     reçoit la demande ; lui faire attendre un administrateur retarderait un
 *     droit dont le délai légal court déjà. Il doit tenir `records:write` : un
 *     siège en lecture seule n'efface rien, même porteur.
 *
 * `sales_ops` N'EST PAS dans la liste, malgré `team:manage` : gérer l'équipe
 * n'est pas répondre au nom du responsable de traitement, et un geste
 * IRRÉVERSIBLE ne s'accorde pas « en passant » à un rôle qui ne l'a pas demandé.
 */
export const PERSON_ERASURE_ADMIN_ROLES = ['owner', 'admin'] as const satisfies readonly WorkspaceRole[]

/** Le porteur d'une fiche : qui l'a créée (`user_id`) ou à qui elle est
 *  attribuée (`assigned_to`). Un identifiant vide n'est porteur de rien. */
export function isContactOwner(
  contact: { user_id?: string | null; assigned_to?: string | null },
  userId: string,
): boolean {
  if (!userId) return false
  return contact.user_id === userId || contact.assigned_to === userId
}

/** #2297 — cette personne peut-elle effacer cette fiche ? Voir l'en-tête. */
export function canErasePerson(input: {
  role: WorkspaceRole
  extraPermissions: readonly WorkspacePermission[]
  ownsContact: boolean
}): boolean {
  if ((PERSON_ERASURE_ADMIN_ROLES as readonly WorkspaceRole[]).includes(input.role)) return true
  return input.ownsContact && can(input.role, input.extraPermissions, 'records:write')
}

/** Ce que rend `POST /privacy/persons/:contactId/erasure` : QUAND l'effacement
 *  a eu lieu, jamais QUI a été effacé — la réponse elle-même ne porte aucune
 *  donnée de la personne. */
export type PersonErasureResult = {
  erased: true
  erased_at: string
}
