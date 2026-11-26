import { Controller, Get, UseGuards } from '@nestjs/common'
import type { WeakestLinkDiagnosis } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WeakestLinkDiagnosisService } from './weakest-link-diagnosis.service'

/**
 * BEL-SC-224 (#3253, P0) — surface « Aujourd'hui » (`/briefing`) et « Pilotage ».
 * Laura lit le MÊME diagnostic via le pont interne
 * (`copilot-bridge.controller.ts`, `laura/weakest-link-diagnosis`) — aucune
 * copie locale.
 *
 * `@WorkspaceRead()` (D39 · 28/08/2026) : visible à TOUT membre — c'est ce que
 * `/briefing` exige (`sales`/`member` n'ont pas `team:manage`) — et la matrice
 * n'a aucune permission de lecture à donner. Le service persiste un historique
 * pour expliquer le changement d'un appel à l'autre (`explainDiagnosisChange`),
 * mais cet historique ne fait que mettre en cache un calcul dérivé de comptes,
 * projets et consultants que l'appelant peut déjà lire — il n'ouvre aucune
 * visibilité nouvelle et ne débite rien.
 */
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@Controller('weakest-link-diagnosis')
export class WeakestLinkDiagnosisController {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly diagnosisService: WeakestLinkDiagnosisService,
  ) {}

  @Get()
  @WorkspaceRead()
  async current(@CurrentUser() user: CurrentUserPayload): Promise<WeakestLinkDiagnosis> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.diagnosisService.diagnoseFor(workspaceId)
  }
}
