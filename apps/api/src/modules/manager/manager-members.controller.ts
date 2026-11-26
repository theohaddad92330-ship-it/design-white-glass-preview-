import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ManagerMemberService } from './manager-member.service'

/**
 * Théo D team-member.N1 — la fiche d'un membre.
 *
 * Contrôleur À PART de `ManagerController` : celui-ci exige `team:manage` sur
 * toute la classe, alors que Louis (22/10, Q3) a tranché que TOUT membre lit la
 * journée, les recherches et les intégrations d'un collègue — jamais sa
 * messagerie (c96). C'est une LECTURE de l'espace résolu côté serveur
 * (`@WorkspaceRead`, GA-05) : rien n'est écrit, aucun crédit n'est dépensé.
 */
@Controller('manager/members')
@RequireFeature('manager_cockpit')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ManagerMembersController {
  constructor(private readonly members: ManagerMemberService) {}

  @WorkspaceRead()
  @Get(':id')
  getMember(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.getMember(user.userId, id)
  }
}
