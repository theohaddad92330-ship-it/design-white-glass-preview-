import { IsNull, type EntityManager } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { ContactEntity } from '../../database/entities/contact.entity'

/**
 * #4158.4 — ce qu'un membre qui quitte un espace laisse derrière lui : son
 * portefeuille (comptes, contacts) ET ses actions déléguées retournent à « sans
 * porteur » / à leur créateur. UNE seule fonction pour les deux sorties du
 * produit — le retrait par un responsable (`WorkspaceTeamService.removeMember`)
 * et le retrait par le back-office (`AdminService.removeMember`) : un jumeau qui
 * n'en libérerait qu'une moitié laisserait des comptes chez un non-membre.
 *
 * Aucun successeur n'est désigné (un compte chez la mauvaise personne est pire
 * que sans porteur). `action_plan_items` ne porte pas `workspace_id` : borné aux
 * comptes de CET espace, le partant garde ses délégations ailleurs.
 *
 * #4996 — il sort aussi des ÉQUIPES de compte et de leurs périmètres, dans CET espace : on archive
 * (`removed_at`/`removed_by`), on ne supprime pas. `removedBy` = l'auteur du retrait ; le back-office,
 * qui n'a pas d'auteur humain, laisse le défaut (le partant signe lui-même l'archivage).
 */
export async function releaseMemberWork(
  manager: EntityManager,
  workspaceId: string,
  userId: string,
  removedBy: string = userId,
): Promise<void> {
  await manager.update(AccountEntity, { workspace_id: workspaceId, assigned_to: userId }, { assigned_to: null })
  await manager.update(ContactEntity, { workspace_id: workspaceId, assigned_to: userId }, { assigned_to: null })
  await manager.query(
    `UPDATE action_plan_items SET assigned_to = NULL
      WHERE assigned_to = $1
        AND account_id IN (SELECT id FROM accounts WHERE workspace_id = $2)`,
    [userId, workspaceId],
  )
  for (const entity of [AccountTeamMemberEntity, AccountTeamScopeEntity]) {
    await manager.update(
      entity,
      { workspace_id: workspaceId, user_id: userId, removed_at: IsNull() },
      { removed_at: new Date(), removed_by: removedBy },
    )
  }
}
