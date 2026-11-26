import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import type { ApprovedTemplateCandidatesResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ApprovedMessageTemplateService } from './approved-message-template.service'
import { ListApprovedTemplateCandidatesDto } from './dto/approved-message-template.dto'

/**
 * #3417 (retour bêta 30/09, fiche contact) — la surface HTTP de lecture de la
 * bibliothèque de modèles approuvés. Lecture seule (Craft rule : aucune
 * écriture applicative dans cette tranche, voir l'entête de
 * `ApprovedMessageTemplateService`).
 */
@Controller('outreach-templates')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ApprovedMessageTemplateController {
  constructor(
    private readonly templates: ApprovedMessageTemplateService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get(':contactId')
  @WorkspaceRead()
  async candidates(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query() query: ListApprovedTemplateCandidatesDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ApprovedTemplateCandidatesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.templates.candidatesForContact(
      { userId: user.userId, workspaceId },
      contactId,
      query.channel,
      query.scenario,
      query.persona ?? null,
    )
  }
}
