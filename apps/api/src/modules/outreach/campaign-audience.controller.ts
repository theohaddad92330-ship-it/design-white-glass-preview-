import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  campaignAudienceRequestSchema,
  type CampaignAudienceEvent,
  type CampaignAudienceNeed,
  type CampaignAudienceRequest,
  type CampaignAudienceResult,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ContactsService } from '../contacts/contacts.service'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CampaignAudienceService } from './campaign-audience.service'

/**
 * Épopée #2974 (lot V39) — la PRÉVISUALISATION d'une audience de campagne.
 * `POST` parce que la requête porte une source et des filtres structurés ;
 * aucune écriture pour autant (`@WorkspaceRead`) : la route rend une liste de
 * contacts éligibles, mono-contact, et ce qui en sort avec sa raison.
 * Une clé de filtre inconnue — dont tout critère protégé — est refusée par le
 * schéma `.strict()`, jamais ignorée.
 */
@Controller('outreach/audience')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CampaignAudienceController {
  constructor(
    private readonly audience: CampaignAudienceService,
    private readonly workspaceContext: WorkspaceContextService,
    // La porte « ne me contactez plus », résolue ICI et passée en valeur au
    // service (GA-07 — même patron que `OutreachMessageController`).
    private readonly contactStops: ContactStopService,
    // Les contacts d'une vue enregistrée, résolus ICI aussi (GA-07).
    private readonly contacts: ContactsService,
  ) {}

  @Post('preview')
  @WorkspaceRead()
  async preview(
    @Body(new ZodValidationPipe(campaignAudienceRequestSchema)) body: CampaignAudienceRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CampaignAudienceResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.audience.preview(
      workspaceId,
      user.userId,
      body,
      (w, ids) => this.contactStops.stopReasonsAmong(w, ids),
      (w, filters, limit) => this.contacts.contactIdsForFilters(w, filters, limit),
    )
  }

  /** #2380.11 — les événements proposés par le sélecteur « participants d'un événement ». */
  @Get('events')
  @WorkspaceRead()
  async events(@CurrentUser() user: CurrentUserPayload): Promise<CampaignAudienceEvent[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.audience.listEvents(workspaceId)
  }

  /** #2202.15 — les besoins proposés par le sélecteur « besoin ». */
  @Get('needs')
  @WorkspaceRead()
  async needs(@CurrentUser() user: CurrentUserPayload): Promise<CampaignAudienceNeed[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.audience.listNeeds(workspaceId)
  }
}
