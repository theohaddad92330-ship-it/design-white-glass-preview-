import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkProgressService } from '../work-progress/work-progress.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CopilotWorkProgressDto } from './dto/copilot-work-progress.dto'

/**
 * #4611 — l'ÉTAT du travail lancé (analyses, imports, enrichissements, synchros CRM, rattrapages), pour que
 * Laura le LISE au lieu de le raconter.
 *
 * Une lecture : aucun verbe d'écriture, aucun rejeu, aucune relance. L'espace et le périmètre de portefeuille
 * sont RÉSOLUS ici depuis le `userId` (jamais fournis par l'appelant) ; un lot demandé par son identifiant
 * est refusé par le service s'il n'est pas dans ce périmètre (#4611.8).
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotWorkProgressController {
  constructor(
    private readonly progress: WorkProgressService,
    private readonly workspaceContext: WorkspaceContextService,
    /** Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent, on LÈVE (fail-closed). */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Post('work-progress')
  async read(@Body() dto: CopilotWorkProgressDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    return this.progress.read({
      workspaceId,
      userId: dto.userId,
      businessUnitScope,
      ...(dto.lotId ? { lotId: dto.lotId } : {}),
    })
  }
}
