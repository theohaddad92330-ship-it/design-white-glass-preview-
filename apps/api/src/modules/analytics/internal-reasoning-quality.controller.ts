import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { ReasoningQualityReport } from './reasoning-quality'
import { ReasoningQualityService } from './reasoning-quality.service'

/**
 * #3223.3 (#3198) — le tableau de pilotage du raisonnement commercial de Laura,
 * pour le back-office `dashboard-manager`. Même porte que les autres KPI
 * internes ({@link InternalSecretGuard}) : cross-tenant par nature, et AUCUNE
 * réponse ne porte un nom d'espace ni de personne (c64).
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalReasoningQualityController {
  constructor(private readonly reasoning: ReasoningQualityService) {}

  @Get('reasoning-quality')
  get(@Query('days') days?: string): Promise<ReasoningQualityReport> {
    const parsed = days === undefined ? undefined : Number.parseInt(days, 10)
    return this.reasoning.report(parsed)
  }
}
