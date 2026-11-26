import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { demoMissionExtraction } from '../demo/demo-scripts'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MissionExtractionService, type MissionExtraction } from './mission-extraction.service'

/**
 * `text` OU `file_base64` — même geste que `CreateRfpRequest`
 * (`packages/contracts/src/schemas/rfp.ts`) : le commercial colle parfois un
 * e-mail, et dépose parfois un contrat en `.pdf`. Refusée ni ici ni côté IA :
 * les deux vides ensemble rendent 422 côté service IA, comme `/rfp/analyse`.
 */
const missionExtractRequestSchema = z.object({
  text: z.string().trim().min(1).optional(),
  fileBase64: z.string().min(1).optional(),
  fileName: z.string().trim().min(1).max(200).optional(),
})

class ExtractMissionDto extends createZodDto(missionExtractRequestSchema) {}

/**
 * LA LECTURE AUTOMATIQUE D'UN DOCUMENT DE MISSION (#2560).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DROIT : LE MÊME QUE CRÉER
 * ─────────────────────────────────────────────────────────────────────────────
 * `records:write` — exactement la porte que `DeliveryController.create` ouvre
 * pour `POST /delivery/missions`. Proposer des champs depuis un document
 * n'engage rien de plus que de les taper à la main : rien n'est écrit ici, ni
 * en base ni ailleurs — c'est le clic sur « Créer » qui écrit, une route plus
 * loin.
 */
@Controller('delivery/missions')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionExtractionController {
  constructor(
    private readonly extraction: MissionExtractionService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * En démonstration, la réponse est SCRIPTÉE (`demoMissionExtraction`) :
   * aucun appel modèle, aucun crédit, aucune donnée réelle — le visiteur fait
   * le geste, l'écran se remplit. Voir `demo-scripts.ts` pour la règle
   * complète (`demoRfpAnalysis` applique déjà la même garde).
   */
  @Post('extract')
  @RequirePermission('records:write')
  async extract(@Body() body: ExtractMissionDto, @CurrentUser() user: CurrentUserPayload): Promise<MissionExtraction> {
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      return demoMissionExtraction()
    }
    return this.extraction.extract(body)
  }
}
