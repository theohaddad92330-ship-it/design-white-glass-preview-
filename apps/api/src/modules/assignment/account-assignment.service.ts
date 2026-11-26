import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { hasPermission } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { TeamNotificationsService } from '../notifications/team/team-notifier.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** What the caller gets back — enough to update a row in place, nothing more. */
export type AccountAssignmentResult = {
  id: string
  assigned_to: string | null
}

/**
 * "Qui porte ce compte" — assigning an account to a workspace member.
 *
 * Two distinct gestures, two distinct rights:
 *  - a **manager** (`team:manage`) allocates the portfolio: any account to any
 *    member, and can release one back to the unassigned queue;
 *  - a **rep** self-serves: they may CLAIM an account nobody holds, and RELEASE
 *    the one they hold — but never take one from, nor hand one to, a colleague.
 *    Allocation stays a management act; picking up unclaimed work does not.
 *
 * Both rights are read off {@link hasPermission}, never off role strings. The
 * existing manager-dashboard gate hardcodes `owner|admin` and therefore refuses
 * `sales_ops` even though the matrix grants it `team:manage`; this module does
 * not reproduce that divergence.
 *
 * `analysis:run` is the proxy for "carries a commercial portfolio at all" — it
 * is held by every operating role and by neither `viewer` (no permission) nor
 * `tech_admin` (integrations only).
 */
@Injectable()
export class AccountAssignmentService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // #4158.15 — EN DERNIER et optionnel : absent, l'assignation est byte-identique.
    @Optional() private readonly teamNotifications?: TeamNotificationsService,
  ) {}

  async assign(userId: string, accountId: string, assignedTo: string | null): Promise<AccountAssignmentResult> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // Workspace scoping IS the security barrier here — the API connects as
    // `postgres` (BYPASSRLS), so the RLS policy is only a backstop. Never look
    // an account up by id alone.
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace de travail')

    if (!hasPermission(role, 'team:manage')) {
      this.assertSelfServeAllowed(role, userId, account.assigned_to, assignedTo)
    }

    // Only when we are actually pointing the account at somebody. Releasing
    // needs no membership check — there is no target to validate.
    if (assignedTo !== null) {
      const membership = await this.workspaceContext.getMembership(assignedTo, workspaceId)
      if (!membership) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
    }

    // #4996 — « responsable ≠ co-équipier » : attribuer le compte à un co-équipier actif archive sa ligne d'équipe
    // DANS LA MÊME transaction. Ses zones (`account_team_scopes`) restent attachées à (compte, membre) : conservées.
    await this.accounts.manager.transaction(async manager => {
      await manager.update(AccountEntity, { id: accountId }, { assigned_to: assignedTo })
      if (assignedTo !== null) {
        await manager.update(
          AccountTeamMemberEntity,
          { workspace_id: workspaceId, account_id: accountId, user_id: assignedTo, removed_at: IsNull() },
          { removed_at: new Date(), removed_by: userId },
        )
      }
    })
    // #4158.15 — un compte m'est ASSIGNÉ par un collègue : une notification. Pas
    // quand je me l'assigne moi-même, ni quand rien ne change, ni à la libération.
    if (assignedTo !== null && assignedTo !== userId && assignedTo !== account.assigned_to) {
      await this.teamNotifications?.notifyAccountAssigned({
        workspaceId,
        actorUserId: userId,
        recipientUserId: assignedTo,
        accountId,
      })
    }
    return { id: accountId, assigned_to: assignedTo }
  }

  /**
   * The rep path: claim what nobody holds, release what you hold. Anything else
   * — assigning to a colleague, or touching a colleague's account — is a
   * management act and is refused here.
   */
  private assertSelfServeAllowed(
    role: Parameters<typeof hasPermission>[0],
    userId: string,
    currentHolder: string | null,
    assignedTo: string | null,
  ): void {
    if (!hasPermission(role, 'analysis:run')) {
      throw new ForbiddenException('Votre rôle ne permet pas de porter un compte')
    }

    if (assignedTo === null) {
      if (currentHolder !== userId) {
        throw new ForbiddenException("Vous ne pouvez libérer qu'un compte que vous portez")
      }
      return
    }

    if (assignedTo !== userId) {
      throw new ForbiddenException("Seul un manager peut attribuer un compte à quelqu'un d'autre")
    }
    if (currentHolder !== null && currentHolder !== userId) {
      throw new ForbiddenException('Ce compte est déjà porté par un membre de votre équipe')
    }
  }
}
