import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IntegrationProvider } from '../../database/entities/integration.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { SetIntegrationDto, SetIntegrationEventsDto } from './dto/integrations.dto'
import { isProvider } from './integration-providers'
import { IntegrationsService, type IntegrationStatus } from './integrations.service'

/**
 * Self-serve integrations the user configures with their own endpoint (Slack /
 * Discord / Microsoft Teams / Google Chat Incoming Webhooks, plus a generic
 * outgoing webhook). Every route is JWT-guarded and derives the user from the
 * token — the secret webhook URLs are stored encrypted (see IntegrationsService).
 * The provider is a route param validated against the provider registry, so a
 * new integration needs no new route. HubSpot is intentionally NOT here: it is a
 * full OAuth flow owned by the CRM module (`/crm/*`).
 */
@Controller('integrations')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload): Promise<IntegrationStatus[]> {
    return this.integrations.list(user.userId)
  }

  @Put(':provider')
  @RequirePermission('integrations:manage')
  set(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
    @Body() dto: SetIntegrationDto,
  ): Promise<IntegrationStatus> {
    return this.integrations.set(user.userId, this.assertProvider(provider), dto.url)
  }

  /** Choose which application events this integration receives (webhooks v2). */
  @Put(':provider/events')
  @RequirePermission('integrations:manage')
  setEvents(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
    @Body() dto: SetIntegrationEventsDto,
  ): Promise<IntegrationStatus> {
    return this.integrations.setEvents(user.userId, this.assertProvider(provider), dto.events)
  }

  @Post(':provider/test')
  @HttpCode(200)
  @RequirePermission('integrations:manage')
  async test(@CurrentUser() user: CurrentUserPayload, @Param('provider') provider: string): Promise<{ ok: true }> {
    await this.integrations.test(user.userId, this.assertProvider(provider))
    return { ok: true }
  }

  @Delete(':provider')
  @HttpCode(204)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: CurrentUserPayload, @Param('provider') provider: string): Promise<void> {
    await this.integrations.disconnect(user.userId, this.assertProvider(provider))
  }

  /** Reject an unknown provider param before it reaches the service. */
  private assertProvider(provider: string): IntegrationProvider {
    if (!isProvider(provider)) throw new BadRequestException(`Unknown integration provider: ${provider}`)
    return provider
  }
}
