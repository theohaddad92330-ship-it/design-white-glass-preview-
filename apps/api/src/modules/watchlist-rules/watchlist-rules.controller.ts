import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { WatchlistRule } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { CreateWatchlistRuleDto } from './dto/watchlist-rules.dto'
import { WatchlistRulesService } from './watchlist-rules.service'

/**
 * Règles personnelles de veille (§11). JWT-guardé ; l'utilisateur vient du token
 * et le service scope tout au workspace actif — jamais d'accès par id seul.
 */
@Controller('watchlist')
// La Veille est une surface de palier (elle consomme des rafraîchissements).
@RequireFeature('watchlist')
@UseGuards(JwtGuard, PlanFeatureGuard)
export class WatchlistRulesController {
  constructor(private readonly rules: WatchlistRulesService) {}

  @Get('rules')
  list(@CurrentUser() user: CurrentUserPayload): Promise<WatchlistRule[]> {
    return this.rules.list(user.userId)
  }

  @Post('rules')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWatchlistRuleDto): Promise<WatchlistRule> {
    return this.rules.create(user.userId, dto)
  }

  @Delete('rules/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.rules.remove(user.userId, id)
  }
}
