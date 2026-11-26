import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { updateChatEvalSamplingSchema, type ChatEvalSamplingSetting } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChatEvalSamplingService } from './chat-eval-sampling.service'

class UpdateChatEvalSamplingDto extends createZodDto(updateChatEvalSamplingSchema) {}

/** #2899 — Réglages › Laura : l'échantillonnage des conversations pour les évals (opt-in par espace). */
@Controller('workspaces/chat-eval-sampling')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ChatEvalSamplingController {
  constructor(
    private readonly sampling: ChatEvalSamplingService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Tout membre LIT le réglage : savoir si son espace verse des tours anonymisés n'est pas privilégié. */
  @Get()
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<ChatEvalSamplingSetting> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // La salle de démonstration se lit éteinte et non modifiable : le PATCH y répondrait 403.
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return {
      enabled: await this.sampling.isEnabled(workspaceId),
      canEdit: !demo && (role === 'owner' || role === 'admin'),
    }
  }

  /** Propriétaire ou administrateur seul (`team:manage` ici, le rôle est re-vérifié ci-dessous). */
  @Patch()
  @RequirePermission('team:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateChatEvalSamplingDto,
  ): Promise<ChatEvalSamplingSetting> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.workspaceContext.assertRole(user.userId, workspaceId, ['owner', 'admin'])
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new ForbiddenException('L’échantillonnage n’existe pas dans l’espace de démonstration.')
    }
    await this.sampling.set(workspaceId, dto.enabled)
    return { enabled: dto.enabled, canEdit: true }
  }
}
