import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { ReplyContestationReport } from './reply-contestations'
import { ReplyContestationsService } from './reply-contestations.service'

/**
 * #2442.10 (épopée #2879, lot W9) — les contestations/corrections des réponses
 * de Laura, PAR FONCTION, pour le back-office `dashboard-manager`. Même porte
 * que les autres KPI internes ({@link InternalSecretGuard}). Troisième
 * exception nommée à c64 : AUCUNE réponse ne porte une personne, un espace ou
 * un contenu (GA-412).
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalReplyContestationsController {
  constructor(private readonly contestations: ReplyContestationsService) {}

  @Get('reply-contestations')
  get(@Query('days') days?: string): Promise<ReplyContestationReport & { windowDays: number }> {
    return this.contestations.report(days === undefined ? undefined : Number.parseInt(days, 10))
  }
}
