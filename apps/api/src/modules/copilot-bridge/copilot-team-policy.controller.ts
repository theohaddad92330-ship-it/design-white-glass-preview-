import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceTeamPolicySettingsService } from '../workspace/workspace-team-policy-settings.service'
import { CopilotTeamPolicyDto } from './dto/copilot-bridge.dto'

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE, lue par Laura quand elle organise une
 * journée ou une semaine (`propose_focus_plan` / `propose_weekly_plan`,
 * `chat_tools.py`). LE MÊME service que l'écran Réglages › Équipe (GA-26),
 * borné à l'espace actif du demandeur.
 *
 * Contrôleur À PART, comme `CopilotReverseMarketController` :
 * `CopilotBridgeController` est construit positionnellement par plusieurs specs.
 *
 * LECTURE SEULE. `policy: null` = rien saisi (Laura le dit) ; un non-2xx = pont
 * en panne (Laura nomme la source comme non lue) — jamais confondus.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotTeamPolicyController {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly teamPolicy$: WorkspaceTeamPolicySettingsService,
  ) {}

  @Post('workspace/team-policy')
  async teamPolicy(@Body() dto: CopilotTeamPolicyDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.teamPolicy$.forLaura(workspaceId)
  }
}
