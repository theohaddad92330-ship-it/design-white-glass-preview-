import { BadGatewayException, BadRequestException, Body, Controller, Logger, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { createZodDto } from 'nestjs-zod'
import { technologyRadarRequestSchema, technologyRadarSchema, type TechnologyRadar } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { MarketData } from '../../common/decorator/market-data.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { demoTechnologyRadar } from '../demo/demo-technology-radar'
import { IaClient } from '../ia/ia.client'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'

class TechnologyRadarDto extends createZodDto(technologyRadarRequestSchema) {}

/** Même borne que les autres portes de Découvrir (`ia-proxy.controller.ts`). */
const RADAR_RATE_LIMIT = { 'default-1m': { limit: 10, ttl: 60_000 } }
/** Une collecte publique par technologie (mise en cache 30 j côté IA) : un essai, une échéance large. */
const RADAR_CALL_OPTS = { maxAttempts: 1, timeoutMs: 45_000 }

/**
 * #4282.10 — le RADAR PAR TECHNOLOGIE dans Découvrir : la MÊME sortie que
 * Laura (`technology_radar`), relayée sans retri — mêmes comptes, même ordre.
 *
 * La sortie est validée contre `technologyRadarSchema` (`.strict()`) : une
 * probabilité ou une source nommée qui passerait côté IA est REFUSÉE en
 * erreur claire, jamais affichée. Salle de démonstration : le radar préparé
 * (`demoTechnologyRadar`), aucun appel.
 */
@Controller('ia')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class TechnologyRadarController {
  private readonly logger = new Logger(TechnologyRadarController.name)

  constructor(
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @RequireFeature('discover')
  // La donnée de PERSONNE : offres et marchés publics, base commune du marché (décision n°18) —
  // rien de l'espace n'est lu ni écrit.
  @MarketData()
  @Post('discover/technology-radar')
  @Throttle(RADAR_RATE_LIMIT)
  async technologyRadar(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: TechnologyRadarDto,
  ): Promise<TechnologyRadar> {
    const technology = dto.technology.replace(/\s+/g, ' ').trim()
    if (!technology) throw new BadRequestException('Il me faut une technologie pour bâtir le radar.')
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      const demo = demoTechnologyRadar(technology)
      if (!demo) throw new BadRequestException('Il me faut une technologie pour bâtir le radar.')
      return demo
    }
    const raw = await this.ia.technologyRadar(technology, RADAR_CALL_OPTS)
    const parsed = technologyRadarSchema.safeParse(raw)
    if (!parsed.success) {
      this.logger.warn(`Radar techno : sortie IA hors contrat (${parsed.error.issues.length} écart(s))`)
      throw new BadGatewayException('Le radar n’a pas pu être construit. Réessaie dans un instant.')
    }
    return parsed.data
  }
}
