import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { createMcpAccessIntentSchema, decideMcpAccessIntentSchema, type McpAccessIntent } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { McpAccessIntentsService } from './mcp-access-intents.service'

class CreateMcpAccessIntentDto extends createZodDto(createMcpAccessIntentSchema) {}
class DecideMcpAccessIntentDto extends createZodDto(decideMcpAccessIntentSchema) {}

/**
 * Théo D settings-outils.N1 — le cadre d'un nouvel accès (Réglages › Outils › Accès assistants / MCP).
 *
 * Écrire une demande demande `records:write` (tout commercial) ; la TRANCHER, et lire celles de l'espace, demande
 * `integrations:manage` — la même porte que les autres accès techniques. L'espace est toujours résolu côté serveur.
 */
@Controller('mcp-access-intents')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class McpAccessIntentsController {
  constructor(
    private readonly intents: McpAccessIntentsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateMcpAccessIntentDto,
  ): Promise<McpAccessIntent> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.intents.create(workspaceId, user.userId, body)
  }

  @Get()
  @RequirePermission('records:write')
  async mine(@CurrentUser() user: CurrentUserPayload): Promise<McpAccessIntent[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.intents.listMine(workspaceId, user.userId)
  }

  @Get('pending')
  @RequirePermission('integrations:manage')
  async pending(@CurrentUser() user: CurrentUserPayload): Promise<McpAccessIntent[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.intents.listPending(workspaceId)
  }

  @Patch(':id')
  @RequirePermission('integrations:manage')
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecideMcpAccessIntentDto,
  ): Promise<McpAccessIntent> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.intents.decide(workspaceId, user.userId, id, body)
  }
}
