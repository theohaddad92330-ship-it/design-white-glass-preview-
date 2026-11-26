import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  createAccountEntitySchema,
  createSiteSchema,
  siteFit,
  updateAccountEntitySchema,
  type AccountBillingProfilesResponse,
  type AccountEntity,
  type Site,
  type SiteFit,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OfferPortfolioService } from '../esn-profile/offer-portfolio.service'
import { AccountEntitiesService } from './account-entities.service'

class CreateAccountEntityDto extends createZodDto(createAccountEntitySchema) {}
class UpdateAccountEntityDto extends createZodDto(updateAccountEntitySchema) {}
class CreateSiteDto extends createZodDto(createSiteSchema) {}
class AttachContactDto extends createZodDto(z.object({ entity_id: z.string().guid().nullable() })) {}

/**
 * Les entités et les sites d'un compte (PDF 2 §2).
 *
 * La LECTURE suit l'appartenance à l'espace : savoir quelles divisions existent
 * chez un client n'est pas une information sensible, et la cacher ferait
 * ressaisir la même division dans deux dossiers. L'ÉCRITURE demande
 * `records:write` — déclarer une division, retenir un site ou rattacher un
 * contact, c'est corriger une fiche.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountEntitiesController {
  constructor(
    private readonly entities: AccountEntitiesService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly offerPortfolio: OfferPortfolioService,
  ) {}

  /** L'espace actif de l'appelant. Résolu ICI : le contrôleur est la couche qui
   *  connaît l'utilisateur (règle §3.2). */
  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * LES DOSSIERS DE FACTURATION DE TOUT L'ESPACE (26/08/2026).
   *
   * ⚠️ DEUX SEGMENTS, ET C'EST DÉLIBÉRÉ. Une route littérale à UN segment
   * (`accounts/billing-profiles`) aurait été capturée par le `@Get(':id')` de
   * `AccountsController` — un AUTRE contrôleur monté sur le même préfixe
   * `accounts`. Nest ordonne les routes par MODULE, pas par spécificité : le
   * défaut ne se voit ni en test unitaire ni en revue, seulement en production,
   * en 500 sur un `ParseUUIDPipe` qui reçoit « billing-profiles ». Le dépôt l'a
   * déjà payé une fois. `accounts/entities/billing-profiles` ne peut être
   * capturée par aucun motif à un segment, et aucune route GET de ce contrôleur
   * n'a la forme `entities/:x`.
   *
   * `@WorkspaceRead()` et non `@RequirePermission` : c'est une LECTURE d'espace,
   * et il n'existe pas de permission de lecture (D39 — mettre `data:export` sur
   * une lecture fermerait la porte au `viewer` et au `tech_admin`).
   *
   * Aucun montant ne voyage ici — ni TJM, ni marge, ni préparatoire — donc
   * aucune rédaction financière n'a lieu d'être : « ce client n'a pas de contact
   * de facturation » est un constat d'ops, pas un chiffre. C'est la même lecture
   * que `GET /delivery/invoice-readiness`, ouverte à tout membre pour la même
   * raison.
   */
  @Get('entities/billing-profiles')
  @WorkspaceRead()
  async listBillingProfiles(@CurrentUser() user: CurrentUserPayload): Promise<AccountBillingProfilesResponse> {
    return this.entities.listBillingProfiles(await this.workspaceOf(user.userId))
  }

  @Get(':id/entities')
  async listEntities(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<{ items: AccountEntity[] }> {
    return this.entities.listEntities(await this.workspaceOf(user.userId), accountId)
  }

  @Post(':id/entities')
  @RequirePermission('records:write')
  async createEntity(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateAccountEntityDto,
  ): Promise<AccountEntity> {
    return this.entities.createEntity(await this.workspaceOf(user.userId), accountId, dto)
  }

  @Patch('entities/:entityId')
  @RequirePermission('records:write')
  async updateEntity(
    @CurrentUser() user: CurrentUserPayload,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() dto: UpdateAccountEntityDto,
  ): Promise<AccountEntity> {
    return this.entities.updateEntity(await this.workspaceOf(user.userId), entityId, dto)
  }

  @Delete('entities/:entityId')
  @RequirePermission('records:write')
  async deleteEntity(
    @CurrentUser() user: CurrentUserPayload,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ): Promise<{ deleted: true }> {
    return this.entities.deleteEntity(await this.workspaceOf(user.userId), entityId)
  }

  /** Rattacher un contact à une division. `entity_id: null` le renvoie au
   *  périmètre non déterminé — jamais nulle part.
   *
   *  ⚠️ #1473 — un contact À QUALIFIER (sans compte) n'a aucun périmètre où
   *  être renvoyé : la réponse porte alors `entity_id: null`, qui est l'état
   *  vrai et non une erreur. */
  @Patch('contacts/:contactId/entity')
  @RequirePermission('records:write')
  async attachContact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: AttachContactDto,
  ): Promise<{ entity_id: string | null }> {
    return this.entities.attachContact(await this.workspaceOf(user.userId), contactId, dto.entity_id)
  }

  @Get(':id/site-list')
  async listSites(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<{ items: (Site & { fit: SiteFit })[] }> {
    // La composition vit dans le CONTRÔLEUR : elle traverse deux modules, et
    // c'est la sortie que GA-07 nomme elle-même. Le service des entités n'a pas
    // à connaître le profil du vendeur.
    const [{ items }, portfolio] = await Promise.all([
      this.entities.listSites(await this.workspaceOf(user.userId), accountId),
      // Une politique de site illisible ne doit pas faire tomber la liste des
      // sites : sans elle, chaque site rend « rien à trancher ».
      this.offerPortfolio.read(user.userId).catch(() => null),
    ])
    return { items: items.map(site => ({ ...site, fit: siteFit(site, portfolio) })) }
  }

  @Post(':id/site-list')
  @RequirePermission('records:write')
  async createSite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateSiteDto,
  ): Promise<Site> {
    return this.entities.createSite(await this.workspaceOf(user.userId), accountId, dto)
  }

  @Delete('site-list/:siteId')
  @RequirePermission('records:write')
  async deleteSite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<{ deleted: true }> {
    return this.entities.deleteSite(await this.workspaceOf(user.userId), siteId)
  }
}
