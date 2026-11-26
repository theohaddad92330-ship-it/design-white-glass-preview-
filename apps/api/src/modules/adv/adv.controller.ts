import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { createZodDto } from 'nestjs-zod'
import {
  advDossiersQuerySchema,
  updateAdvDossierSchema,
  type AdvDossier,
  type AdvDossiersPage,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DeliveryService } from '../delivery/delivery.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { advDossiersToCsv } from './adv-export'
import { AdvService, type AdvMissionSource } from './adv.service'
import { DataExit } from '../workspace/data-exit.decorator'

class AdvDossiersQueryDto extends createZodDto(advDossiersQuerySchema) {}
class UpdateAdvDossierDto extends createZodDto(updateAdvDossierSchema) {}

/**
 * Administration des ventes — ce qui empêche un dossier de démarrer ou d'être
 * reconduit.
 *
 * Aucune route n'émet de document, ne signe rien et n'enregistre aucun moyen de
 * paiement : le seul geste d'écriture porte une référence, des conditions de
 * règlement, une entité cliente et un ÉTAT de transmission. C'est l'absence de
 * champ qui le tient, pas une consigne.
 */
@Controller('adv')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AdvController {
  constructor(
    private readonly adv: AdvService,
    /**
     * ⚠️ Les renouvellements sont RÉSOLUS ICI et passés au service, jamais
     * cherchés par lui : GA-07 refuse qu'un service aille chercher le service
     * d'un autre module, et sa consigne nomme le contrôleur comme le bon
     * endroit. `renewalsToAct` reste la seule implémentation de la fenêtre
     * J-60 / J-30 — ce lot la BRANCHE, il ne la recopie pas.
     */
    private readonly delivery: DeliveryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Un seul endroit résout l'espace actif ET la liste des renouvellements. */
  private async context(userId: string): Promise<{ workspaceId: string; renewals: AdvMissionSource[] }> {
    const [{ workspaceId }, renewals] = await Promise.all([
      this.workspaceContext.resolveActiveWorkspace(userId),
      this.delivery.renewalsToAct(userId),
    ])
    return { workspaceId, renewals: renewals.missions }
  }

  /**
   * La file de travail ET son résumé.
   *
   * ⚠️ Jamais un tableau NU : la réponse porte le mois observé et le résumé à
   * côté des lignes. « Une erreur se remarque, une liste vide se croit » — sans
   * le résumé, un écran filtré à zéro ligne se lit « tout est en ordre ».
   *
   * `@WorkspaceRead` et pas `@RequirePermission` : c'est une LECTURE d'espace,
   * et `ROLE_PERMISSIONS` ne porte aucune permission de lecture. Exiger un droit
   * mutant ici fermerait la porte à `viewer`, ce que personne n'a décidé. Aucun
   * montant ne traverse cette route — ni TJM, ni marge, ni montant préparatoire —
   * donc rien à garder derrière `finance:read`.
   */
  @Get('dossiers')
  @WorkspaceRead()
  async dossiers(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AdvDossiersQueryDto,
  ): Promise<AdvDossiersPage> {
    const { workspaceId, renewals } = await this.context(user.userId)
    return this.adv.dossiers(workspaceId, renewals, query)
  }

  /**
   * L'export de la file, dans l'état exact où l'écran la montre — filtres
   * compris. Un export qui ignore le filtre courant rend un fichier que personne
   * n'a demandé, et l'écart ne se voit qu'à l'ouverture.
   */
  @Get('dossiers/export.csv')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @WorkspaceRead()
  async exportCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AdvDossiersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { workspaceId, renewals } = await this.context(user.userId)
    const { items, month } = await this.adv.dossiers(workspaceId, renewals, query)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="adv-${month}.csv"`)
    return advDossiersToCsv(items)
  }

  /**
   * Le geste de réparation — le SEUL chemin d'écriture du domaine.
   *
   * `records:write` : corriger un dossier ADV est une écriture de fiche, au même
   * titre que renseigner un bon de commande sur une mission. Ce n'est pas
   * `finance:write` — aucun montant ne s'écrit ici.
   */
  @Patch('dossiers/:missionId')
  @RequirePermission('records:write')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: UpdateAdvDossierDto,
  ): Promise<AdvDossier> {
    const { workspaceId, renewals } = await this.context(user.userId)
    return this.adv.update(workspaceId, user.userId, missionId, body, renewals)
  }
}
