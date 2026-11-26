import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ApiKeysService, type ApiKeySummary, type CreatedApiKey } from './api-keys.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

/**
 * MANAGEMENT surface for workspace API keys (Réglages › Intégrations). Browser
 * session only (JwtGuard — an API key can NEVER manage keys) + RBAC
 * `integrations:manage` on every route, same seat as the other integrations.
 *
 * The workspace is always resolved server-side from the caller's JWT — the
 * browser never supplies a workspace id, so keys cannot be created for /
 * listed from / revoked in another team's workspace.
 */
@Controller('api-keys')
// Émettre une clé n'a de sens que si l'API publique est ouverte au palier : on
// ferme la fabrique en même temps que la porte, sinon l'écran délivre des clés
// que `/v1` refusera.
@RequireFeature('public_api')
@UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Mint a key. The response's `key` field is the ONLY time the raw value is shown. */
  @Post()
  @RequirePermission('integrations:manage')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateApiKeyDto): Promise<CreatedApiKey> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.apiKeys.create({
      workspaceId,
      createdBy: user.userId,
      name: dto.name,
      scopes: dto.scopes,
    })
  }

  /** The workspace's keys — prefix + metadata only, never a hash or raw key. */
  @Get()
  @RequirePermission('integrations:manage')
  async list(@CurrentUser() user: CurrentUserPayload): Promise<ApiKeySummary[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.apiKeys.list(workspaceId)
  }

  /** Soft-revoke — effective on the key's very next request. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('integrations:manage')
  async revoke(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.apiKeys.revoke(workspaceId, id)
  }
}
