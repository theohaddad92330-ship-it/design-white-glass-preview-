import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisFoundBackfillDto } from './dto/analysis-found-backfill.dto'
import { AnalysisFoundBackfillService, type AnalysisFoundBackfillOutcome } from './analysis-found-backfill.service'

/**
 * #3416.x2 — LA SEULE PORTE du rattrapage de `CardResult.analysisFound` sur les
 * analyses déjà réglées. Même famille que `RefreshRefundController` : préfixe
 * `internal/admin`, {@link InternalSecretGuard} — sans le secret interne, même
 * connecté, c'est un 403. Rien d'autre n'appelle `AnalysisFoundBackfillService.run` :
 * ni démarrage, ni cron, ni déploiement. `dryRun` d'abord (défaut), puis `dryRun: false`.
 */
@Controller('internal/admin/action-os/analysis-found-backfill')
@UseGuards(InternalSecretGuard)
export class AnalysisFoundBackfillController {
  constructor(private readonly backfill: AnalysisFoundBackfillService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: AnalysisFoundBackfillDto): Promise<AnalysisFoundBackfillOutcome> {
    return this.backfill.run(dto.workspaceId, { dryRun: dto.dryRun })
  }
}
