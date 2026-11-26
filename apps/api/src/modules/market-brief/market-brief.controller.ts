import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { createMarketZoneSchema, type CreateMarketZone } from './market-brief.dto'
import { MarketBriefService, type MarketZoneCtx } from './market-brief.service'

/**
 * Capacité « Marchés locaux » (L1) — la surface HTTP des zones. Espace résolu
 * depuis le TOKEN (GA-07), jamais depuis le corps ni l'URL.
 */
@Controller('market-zones')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MarketBriefController {
  constructor(
    private readonly marketBrief: MarketBriefService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<MarketZoneCtx> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId }
  }

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): ReturnType<MarketBriefService['list']> {
    return this.marketBrief.list(await this.ctx(user))
  }

  @Post()
  @RequirePermission('records:write')
  async create(
    @Body(new ZodValidationPipe(createMarketZoneSchema)) dto: CreateMarketZone,
    @CurrentUser() user: CurrentUserPayload,
  ): ReturnType<MarketBriefService['create']> {
    return this.marketBrief.create(await this.ctx(user), dto)
  }

  @Get(':id')
  @WorkspaceRead()
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): ReturnType<MarketBriefService['get']> {
    return this.marketBrief.get(await this.ctx(user), id)
  }

  @Delete(':id')
  @RequirePermission('records:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): ReturnType<MarketBriefService['remove']> {
    return this.marketBrief.remove(await this.ctx(user), id)
  }
}
