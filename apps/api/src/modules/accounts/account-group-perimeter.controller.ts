import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common'
import type { GroupPerimeter } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DEMO_GROUP_PERIMETER } from '../demo/demo-dataset'
import { IaClient } from '../ia/ia.client'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'

const SIREN = /^\d{9}$/

/**
 * Lot 757 — CONTACTS 3/6 (arbitrage Louis 31/10/2026) : le SÉLECTEUR groupe + filiales de l'analyse.
 *
 * Taper « Decathlon » ouvre la liste du groupe et de ses filiales (taille, siège, région, lus au registre) ;
 * le commercial coche ; les contacts sont cherchés sur l'entité analysée ET les cochées
 * (`AnalysisScopeSelection.contact_entities`). Cette route ne fait que LIRE le registre public :
 *  - droit : celui de LANCER une analyse (`analysis:run`) — le sélecteur n'existe qu'au lancement ;
 *  - aucune donnée d'espace lue ni écrite, aucune fusion (« on PROPOSE une fusion, on ne fusionne JAMAIS ») ;
 *  - démonstration : le périmètre semé (`DEMO_GROUP_PERIMETER`), AUCUN appel réseau (craft rule n°9).
 *
 * Préfixe propre (`group-perimeter`, pas `accounts/…`) : aucune collision avec `GET accounts/:id`.
 */
@Controller('group-perimeter')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountGroupPerimeterController {
  constructor(
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get(':siren')
  @RequirePermission('analysis:run')
  async perimeter(
    @Param('siren') siren: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<GroupPerimeter | null> {
    if (!SIREN.test(siren)) throw new BadRequestException('SIREN attendu : neuf chiffres.')
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      return siren === DEMO_GROUP_PERIMETER.rootSiren ? DEMO_GROUP_PERIMETER : null
    }
    return this.ia.groupPerimeter(siren)
  }
}
