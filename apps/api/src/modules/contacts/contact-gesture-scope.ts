import { In, IsNull, type FindOptionsWhere } from 'typeorm'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

/**
 * #4731 / #4803 — LA CLÉ D'UN GESTE SUR UN CONTACT : l'ESPACE de l'appelant, jamais son
 * rôle de propriétaire. `user_id` désigne qui a LANCÉ l'analyse ; un filtre dessus
 * rendait au coéquipier un geste à zéro ligne (doctrine c76 : le rôle change
 * l'ordre, jamais le contenu). Le `where` est un OU : une ligne ANCIENNE
 * (`workspace_id` NULL) garde son geste pour son propriétaire — ce que personne ne
 * porte ne disparaît pour personne. Un autre espace reste refusé. UN SEUL endroit
 * (GA-26) ; `user_id` reste écrit sur les lignes neuves, c'est « créé par ».
 *
 * Fonction pure : l'appelant a déjà résolu `workspaceId` par le service de contexte d'espace.
 */
export function contactGestureWhere(
  workspaceId: string,
  userId: string,
  id: string | readonly string[],
): FindOptionsWhere<ContactEntity>[] {
  const target = typeof id === 'string' ? id : In([...id])
  return [
    { id: target, ...workspaceScopeWhere(workspaceId), deleted_at: IsNull() },
    { id: target, workspace_id: IsNull(), user_id: userId, deleted_at: IsNull() },
  ]
}
