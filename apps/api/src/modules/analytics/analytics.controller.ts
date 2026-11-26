import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalyticsOverviewService, type AnalyticsOverview } from './analytics-overview.service'
import { ProductAnalyticsService } from './product-analytics.service'

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly overview: AnalyticsOverviewService,
    private readonly productAnalytics: ProductAnalyticsService,
  ) {}

  /**
   * Operator-facing product-analytics overview. Behind {@link InternalSecretGuard}
   * (header secret, no end-user JWT) — it aggregates across ALL tenants, so it
   * must never be exposed without the guard. Mirrors `internal/telemetry`.
   *
   * ⚠️ The guard moved from the CLASS to this single method on 09/09/2026
   * (#1682): a class-level `@UseGuards` would have put the new
   * `POST /analytics/events` behind the same internal secret — a secret that
   * must never reach client code (`JAMAIS de clé API dans du code côté
   * client`). The route the BROWSER calls carries no such header.
   */
  @UseGuards(InternalSecretGuard)
  @Get('overview')
  getOverview(@Query('days') days?: string, @Query('churnDays') churnDays?: string): Promise<AnalyticsOverview> {
    const windowDays = days ? Number.parseInt(days, 10) : undefined
    const churnThreshold = churnDays ? Number.parseInt(churnDays, 10) : undefined
    return this.overview.getOverview(windowDays, churnThreshold)
  }

  /**
   * #1682 — le point d'ingestion du traceur front (`apps/web/src/lib/
   * product-tracker.ts`). PUBLIC, à dessein : appelé depuis le navigateur d'un
   * visiteur, avant tout JWT possible, et `navigator.sendBeacon()` ne pose de
   * toute façon aucun en-tête. Sa seule protection est le
   * `UserThrottlerGuard` déjà posé GLOBALEMENT (`app.module.ts`) sur toutes
   * les routes de l'API.
   *
   * La charge n'est jamais fiable (elle vient du navigateur) : toute
   * validation vit dans {@link ProductAnalyticsService.ingestBehavioralBatch},
   * qui ne lève jamais et rend `{ accepted: 0 }` sur la moindre forme
   * inattendue — `200` dans tous les cas, un traceur `sendBeacon` best-effort
   * ne lit de toute façon jamais la réponse.
   */
  @HttpCode(200)
  @Post('events')
  ingestEvents(@Body() body: unknown): Promise<{ accepted: number }> {
    return this.productAnalytics.ingestBehavioralBatch(body)
  }
}
