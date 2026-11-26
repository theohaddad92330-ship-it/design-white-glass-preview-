import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ReverseMarketService } from '../consultants/matching/reverse-market.service'
import { CopilotReverseMarketDto } from './dto/copilot-bridge.dto'

/**
 * #3816.1 — « Trouve-moi des missions pour ce profil » : le maillon profil → comptes de Laura.
 *
 * Avant ce pont, Laura ne savait qu'OUVRIR l'écran du marché inversé
 * (`propose_guided_action`) ; le calcul existait (`GET consultants/:id/reverse-market`,
 * `matching.controller.ts`) mais n'avait aucun appelant côté conversation. Ce pont
 * relaie LE MÊME service (`ReverseMarketService.forTalent`, GA-26) — jamais un
 * second calcul — borné à l'espace actif du demandeur.
 *
 * Contrôleur À PART, comme `CopilotTerritoryPlanController` : `CopilotBridgeController`
 * est construit positionnellement par plusieurs specs.
 *
 * LECTURE SEULE : aucun crédit, aucun appel sortant, aucune écriture. Un talent
 * absent de l'espace rend `found: false` — distinct d'un pont en panne (non-2xx),
 * et jamais confondu avec un marché vide.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotReverseMarketController {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly reverseMarket$: ReverseMarketService,
  ) {}

  @Post('talents/reverse-market')
  async reverseMarket(@Body() dto: CopilotReverseMarketDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // KEVIN-FIX K.6 — un profil décrit en texte libre (sans fiche) lit le même calcul avec SA zone et SES compétences.
    const request = dto.skills || dto.zones ? { skills: dto.skills, zones: dto.zones } : undefined
    if (!dto.consultantId) {
      return { found: true, market: await this.reverseMarket$.forProfile(request ?? {}, workspaceId, dto.userId) }
    }
    const market = request
      ? await this.reverseMarket$.forTalent(dto.consultantId, workspaceId, dto.userId, request)
      : await this.reverseMarket$.forTalent(dto.consultantId, workspaceId, dto.userId)
    return market ? { found: true, market } : { found: false }
  }
}
