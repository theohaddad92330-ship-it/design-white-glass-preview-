import { Controller, Get, Optional, Param, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DocumentsService } from './documents.service'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'

/**
 * Les livrables téléchargeables.
 *
 * Ils sortent en flux binaire plutôt qu'en JSON base64 : un fichier de 300
 * contacts encodé en base64 dans une réponse JSON pèse un tiers de plus et
 * oblige le navigateur à le reconstruire en mémoire avant de l'enregistrer.
 */
@Controller('documents')
// #2081.14 — le guard qui lit `@DataExit()` : chaque fichier servi ici fait sortir des données du compte.
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU) — revue sécurité 15/09/2026. Un export
     * est la sortie de secours la plus évidente : sans lui, un membre cloisonné
     * qui ne peut pas OUVRIR un dossier pouvait le TÉLÉCHARGER. Résolu ICI et
     * passé au service — GA-07 : l'orchestration vit dans le contrôleur.
     * `@Optional()` au constructeur, jamais pour la RÈGLE.
     */
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  private async businessUnitScopeOf(userId: string) {
    if (!this.workspaceContext) {
      throw new ServiceUnavailableException('business_unit_scope_unavailable')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  /** Les contacts d'un compte, en classeur. */
  @Get('accounts/:id/contacts.xlsx')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  async contactsWorkbook(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.contactsWorkbook(id, user.userId, await this.businessUnitScopeOf(user.userId))
    res
      .status(200)
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
      .send(file.buffer)
  }

  /** Le dossier de compte, en document Word repris dans la charte du client. */
  @Get('accounts/:id/dossier.docx')
  // #2081.14 — livrable commercial, décision Louis 19/09 : plus une sortie de données au sens de la règle d'espace.
  async accountDossier(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.accountDossier(id, user.userId, await this.businessUnitScopeOf(user.userId))
    res
      .status(200)
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
      .send(file.buffer)
  }

  /** Le même dossier en PDF natif — sans dépendre d'un compte Google connecté. */
  @Get('accounts/:id/dossier.pdf')
  // #2081.14 — livrable commercial, décision Louis 19/09 : plus une sortie de données au sens de la règle d'espace.
  async accountDossierPdf(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.accountDossierPdf(id, user.userId, await this.businessUnitScopeOf(user.userId))
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
      .send(file.buffer)
  }

  /** Le même dossier en présentation, pour le comité où on le raconte. */
  @Get('accounts/:id/deck.pptx')
  // #2081.14 — livrable commercial, décision Louis 19/09 : plus une sortie de données au sens de la règle d'espace.
  async accountDeck(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.accountDeck(id, user.userId, await this.businessUnitScopeOf(user.userId))
    res
      .status(200)
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
      .send(file.buffer)
  }
}
