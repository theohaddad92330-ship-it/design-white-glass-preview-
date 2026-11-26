import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  workspaceJoinTargetSchema,
  type MyWorkspaceJoinRequest,
  type PendingWorkspaceJoinRequest,
  type WorkspaceJoinOverview,
  type WorkspaceJoinRequestStatus,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'
import { WorkspaceJoinService, type JoinDecision } from './workspace-join.service'

/** Corps de `POST /workspace-join-requests` et `…/dismiss` — l'espace détecté. */
class WorkspaceJoinTargetDto extends createZodDto(workspaceJoinTargetSchema) {}

/**
 * #2016 — rejoindre un espace existant. Toutes les routes sont authentifiées ;
 * l'identité (et donc le domaine) vient du JWT, jamais du corps.
 *
 * Deux familles de routes, deux déclarations (GA-05) :
 *  · `@PersonalScope` — l'appelant n'est PAS membre de l'espace regardé ; il ne
 *    lit et n'écrit que SES demandes, bornées à son identité ;
 *  · `@RequirePermission('team:manage')` — l'administrateur de l'espace ACTIF,
 *    la même permission que l'invitation (le service la revérifie).
 */
@Controller('workspace-join-requests')
@UseGuards(JwtGuard)
export class WorkspaceJoinController {
  constructor(
    private readonly join: WorkspaceJoinService,
    private readonly workspaceContext: WorkspaceContextService,
    // L'entrée dans l'équipe (sièges, bascule d'espace) : orchestrée ICI, là
    // où vit le geste d'utilisateur (GA-07).
    private readonly team: WorkspaceTeamService,
  ) {}

  @Get('overview')
  @PersonalScope()
  overview(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceJoinOverview> {
    return this.join.overview(user.userId, user.email)
  }

  @Post()
  @PersonalScope()
  requestAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: WorkspaceJoinTargetDto,
  ): Promise<MyWorkspaceJoinRequest> {
    return this.join.requestAccess(user.userId, user.email, dto.workspaceId)
  }

  @Post('dismiss')
  @HttpCode(200)
  @PersonalScope()
  dismiss(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: WorkspaceJoinTargetDto,
  ): Promise<MyWorkspaceJoinRequest> {
    return this.join.dismiss(user.userId, user.email, dto.workspaceId)
  }

  @Get('pending')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  async listPending(@CurrentUser() user: CurrentUserPayload): Promise<PendingWorkspaceJoinRequest[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.join.listPending(workspaceId)
  }

  @Post(':id/accept')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  @HttpCode(200)
  accept(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string; status: WorkspaceJoinRequestStatus }> {
    return this.decide(user.userId, id, 'accept')
  }

  @Post(':id/refuse')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  @HttpCode(200)
  refuse(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string; status: WorkspaceJoinRequestStatus }> {
    return this.decide(user.userId, id, 'refuse')
  }

  /**
   * L'espace est l'espace ACTIF de l'administrateur — celui que le guard vient
   * de vérifier. `admitJoinRequester` revérifie la permission avant d'écrire.
   */
  private async decide(
    adminUserId: string,
    requestId: string,
    decision: JoinDecision,
  ): Promise<{ id: string; status: WorkspaceJoinRequestStatus }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(adminUserId)
    return this.join.decide(adminUserId, workspaceId, requestId, decision, requester =>
      this.team.admitJoinRequester(adminUserId, workspaceId, requester),
    )
  }
}
