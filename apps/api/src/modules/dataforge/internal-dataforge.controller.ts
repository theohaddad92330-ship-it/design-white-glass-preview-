import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DataforgeService } from './dataforge.service'
import { OrionAccountsService, type OrionAccountStatusView } from './orion-accounts.service'
import { OrionAnomaliesService, type OrionAnomalyView } from './orion-anomalies.service'
import { OrionRagChunksService } from './orion-rag-chunks.service'

/**
 * Couverture des référentiels DATAFORGE V10 et ORION V12 — back-office
 * UNIQUEMENT (GA-37, étendue aux trois nouveaux services ORION par le même
 * principe : un statut ou une pénétrabilité lus ici ne sont jamais un fait
 * pour un commercial, ce sont des chiffres d'ingestion pour l'opérateur).
 *
 * Rien d'utilisateur ne passe par ici — un compte cible atteint le produit
 * (quand ce sera branché) par un service dédié, jamais par ce contrôleur.
 */
@Controller('internal/dataforge')
@UseGuards(InternalSecretGuard)
export class InternalDataforgeController {
  constructor(
    private readonly dataforge: DataforgeService,
    private readonly orionAccountsService: OrionAccountsService,
    private readonly orionAnomaliesService: OrionAnomaliesService,
    private readonly orionRagChunksService: OrionRagChunksService,
  ) {}

  @Get('coverage')
  coverage() {
    return this.dataforge.coverage()
  }

  @Get('orion/accounts/coverage')
  orionAccountsCoverage() {
    return this.orionAccountsService.coverage()
  }

  @Get('orion/accounts/:sourceId')
  async orionAccountStatus(@Param('sourceId') sourceId: string): Promise<OrionAccountStatusView> {
    const status = await this.orionAccountsService.statusFor(sourceId)
    if (!status) throw new NotFoundException(`compte ORION inconnu : ${sourceId}`)
    return status
  }

  @Get('orion/anomalies')
  orionAnomalies(): Promise<OrionAnomalyView[]> {
    return this.orionAnomaliesService.list()
  }

  @Get('orion/anomalies/coverage')
  orionAnomaliesCoverage() {
    return this.orionAnomaliesService.coverage()
  }

  @Get('orion/rag-chunks/coverage')
  orionRagChunksCoverage() {
    return this.orionRagChunksService.coverage()
  }
}
