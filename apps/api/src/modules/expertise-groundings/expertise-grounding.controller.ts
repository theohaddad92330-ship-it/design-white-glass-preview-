import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import type { ExpertiseGroundingsResponse } from '@bellum/contracts'
import { createExpertiseGroundingSchema, updateExpertiseGroundingSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { ExpertiseGroundingService, type GroundingAnswers } from './expertise-grounding.service'

class CreateExpertiseGroundingDto extends createZodDto(createExpertiseGroundingSchema) {}
class UpdateExpertiseGroundingDto extends createZodDto(updateExpertiseGroundingSchema) {}

/**
 * Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve d'un
 * espace. Lecture ouverte aux membres ; écriture sous `records:write`, la
 * même permission que les autres faits déclarés de l'espace. Le clic EST la
 * décision (geste utilisateur = auto-approuvé), comme `profile-context`.
 *
 * APPELANT : `expertiseGroundingsApi` (`apps/web/src/features/commercial-audit/api.ts`),
 * monté par `AuditExpertiseCredibility.tsx` sur `/settings/profile/audit`.
 */
@Controller('expertise-groundings')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ExpertiseGroundingController {
  constructor(
    private readonly groundings: ExpertiseGroundingService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly profileReader: EsnProfileReader,
  ) {}

  /** La réponse complète, relue après chaque geste : l'écran n'a qu'une source. */
  private async respond(workspaceId: string, userId: string): Promise<ExpertiseGroundingsResponse> {
    const answers = (await this.profileReader.getAnswers(userId)) as unknown as GroundingAnswers
    return this.groundings.list(workspaceId, answers)
  }

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<ExpertiseGroundingsResponse> {
    return this.respond(await this.scope(user.userId), user.userId)
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateExpertiseGroundingDto,
  ): Promise<ExpertiseGroundingsResponse> {
    const workspaceId = await this.scope(user.userId)
    await this.groundings.create(workspaceId, user.userId, body)
    return this.respond(workspaceId, user.userId)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpertiseGroundingDto,
  ): Promise<ExpertiseGroundingsResponse> {
    const workspaceId = await this.scope(user.userId)
    await this.groundings.update(workspaceId, id, body)
    return this.respond(workspaceId, user.userId)
  }

  /** On archive, on ne supprime pas. */
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('records:write')
  async archive(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExpertiseGroundingsResponse> {
    const workspaceId = await this.scope(user.userId)
    await this.groundings.archive(workspaceId, id)
    return this.respond(workspaceId, user.userId)
  }
}
