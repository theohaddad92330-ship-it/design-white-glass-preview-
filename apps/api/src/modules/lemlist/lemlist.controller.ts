import type { LemlistCampaign, LemlistContactLead, LemlistPushResult, LemlistStatus } from '@bellum/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { LemlistConnectDto, LemlistPushDto } from './dto/lemlist.dto'
import { LemlistService } from './lemlist.service'

/**
 * #4427 — Lemlist. Fermé en incarnation (`/lemlist` dans `BLOCKED_PREFIXES`).
 *
 * `status` est ouvert à tout membre ; connecter et déconnecter demandent la
 * gestion des intégrations (la clé engage tout l'espace) ; pousser un contact
 * demande l'export de données, comme verser un appel au CRM.
 */
@Controller('lemlist')
@UseGuards(JwtGuard)
export class LemlistController {
  constructor(private readonly lemlist: LemlistService) {}

  @Get('status')
  @WorkspaceRead()
  status(@CurrentUser() user: CurrentUserPayload): Promise<LemlistStatus> {
    return this.lemlist.status(user.userId)
  }

  @Post('connect')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload, @Body() dto: LemlistConnectDto): Promise<LemlistStatus> {
    return this.lemlist.connect(user.userId, dto)
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.lemlist.disconnect(user.userId)
  }

  /** #4427.2 — les campagnes existantes, pour le choix de la personne. */
  @Get('campaigns')
  @WorkspaceRead()
  campaigns(@CurrentUser() user: CurrentUserPayload): Promise<LemlistCampaign[]> {
    return this.lemlist.campaigns(user.userId)
  }

  /** #4427.2 — le geste « Ajouter à la campagne ». */
  @Post('push')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('data:export')
  push(@CurrentUser() user: CurrentUserPayload, @Body() dto: LemlistPushDto): Promise<LemlistPushResult> {
    return this.lemlist.pushContact(user.userId, dto)
  }

  /** #4427.3 — les statuts relus, sur la fiche contact. */
  @Get('contacts/:contactId/leads')
  @WorkspaceRead()
  contactLeads(
    @CurrentUser() user: CurrentUserPayload,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<LemlistContactLead[]> {
    return this.lemlist.leadsForContact(user.userId, contactId)
  }
}
