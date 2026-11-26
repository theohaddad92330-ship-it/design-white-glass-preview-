import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TerritoryPlanFactsService } from '../consultants/territory-plan/territory-plan-facts.service'
import { CopilotTerritoryPlanDto } from './dto/copilot-bridge.dto'

/**
 * #2337 — « J'ai trois consultants disponibles, construis-moi le terrain de jeu. »
 *
 * Contrôleur À PART plutôt qu'une méthode de plus sur `CopilotBridgeController` :
 * celui-là est construit POSITIONNELLEMENT par plusieurs specs, et un paramètre
 * de constructeur de plus les décale toutes.
 *
 * LECTURE SEULE : aucun run de matching journalisé, aucune ligne écrite — la
 * porte `records:write` du classement (`needs/match`) n'a donc pas lieu d'être
 * ici. Le plan (fusion, talent d'entrée, collisions, capacité) est compilé côté
 * service IA ; ce pont ne rend que les FAITS, bornés à l'espace actif et au
 * périmètre de BU du demandeur.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotTerritoryPlanController {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly facts: TerritoryPlanFactsService,
  ) {}

  @Post('talents/territory-plan')
  async territoryPlan(@Body() dto: CopilotTerritoryPlanDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.facts.collect(dto.consultantIds, workspaceId, dto.userId)
  }
}
