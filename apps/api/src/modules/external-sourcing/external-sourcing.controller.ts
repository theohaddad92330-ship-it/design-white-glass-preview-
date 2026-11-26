import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  externalSourcingImportSchema,
  type ExternalSourcingImportInput,
  type ExternalSourcingImportResult,
  ExternalSourcingPartnerBrief,
  ExternalSourcingSearchResult,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { ExternalSourcingSearchQueryDto } from './dto/external-sourcing-import.dto'
import {
  ExternalSourcingPartnerBriefFeedbackDto,
  ExternalSourcingPartnerBriefPrepareDto,
} from './dto/external-sourcing-partner-brief.dto'
import { ExternalSourcingService } from './external-sourcing.service'
import { MultiSourceSearchService } from './multi-source-search.service'

/**
 * #2818 — « Chercher hors vivier », lancée depuis un BESOIN (/projects →
 * besoin). Même préfixe que `ProjectsController` (`needs/:needId/…`), module
 * SÉPARÉ (règle #7) : le retirer fait disparaître ces deux routes, rien
 * d'autre.
 */
@Controller('projects')
@RequireFeature('needs')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ExternalSourcingController {
  constructor(
    private readonly externalSourcing: ExternalSourcingService,
    private readonly multiSourceSearch: MultiSourceSearchService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Lecture seule, aucun crédit — voir le docblock de `ExternalSourcingService.search`.
   *  `@WorkspaceRead` : le résultat est borné à l'espace RÉSOLU côté serveur
   *  (`resolveActiveWorkspace`), jamais un paramètre client — même patron que
   *  `needStatusHistory` ci-dessus (GA-05, endpoint-guards.spec.ts). */
  @Get('needs/:needId/external-sourcing/search')
  @WorkspaceRead()
  async search(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Query() query: ExternalSourcingSearchQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ExternalSourcingSearchResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.externalSourcing.search(needId, workspaceId, query.maxPerSource)
    if (!result) throw new NotFoundException('Besoin introuvable')
    return result
  }

  /**
   * #1952.7 (épopée #2844, lot SRC5 28/09 soir) — la MÊME recherche, en tâche
   * de fond : un job qui interroge les sources une par une, suivi par
   * `multi-source-search:progress` (Socket.IO, salle
   * `multi-source-search:<jobId>`), jamais bloqué dans la requête. Aucun
   * crédit — même coût que {@link search}.
   */
  @Post('needs/:needId/external-sourcing/search/bulk')
  @RequirePermission('records:write')
  async searchBulk(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Query() query: ExternalSourcingSearchQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.multiSourceSearch.enqueue(workspaceId, user.userId, needId, query.maxPerSource)
  }

  @Get('needs/:needId/external-sourcing/search/bulk/:jobId')
  @WorkspaceRead()
  async searchBulkState(
    @Param('needId', ParseUUIDPipe) _needId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.multiSourceSearch.state(workspaceId, jobId)
  }

  /** Écrit sur la fiche du candidat — jamais sans le consentement explicite
   *  porté par `externalSourcingImportSchema` (littéral `true`, refusé sinon). */
  @Post('needs/:needId/external-sourcing/import')
  @RequirePermission('records:write')
  async import(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body(new ZodValidationPipe(externalSourcingImportSchema)) body: ExternalSourcingImportInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ExternalSourcingImportResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.externalSourcing.importCandidate(workspaceId, needId, body, user.userId)
  }

  /** Lecture seule, bornée à l'espace RÉSOLU côté serveur — même patron que `search`. */
  @Get('needs/:needId/external-sourcing/partner-briefs')
  @WorkspaceRead()
  async listPartnerBriefs(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ExternalSourcingPartnerBrief[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.externalSourcing.listPartnerBriefs(needId, workspaceId)
  }

  /** Le brief se PRÉPARE, il ne s'envoie jamais — voir le docblock du service. */
  @Post('needs/:needId/external-sourcing/partner-briefs')
  @RequirePermission('records:write')
  async preparePartnerBrief(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: ExternalSourcingPartnerBriefPrepareDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ExternalSourcingPartnerBrief> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.externalSourcing.preparePartnerBrief(workspaceId, needId, user.userId, body)
  }

  /** Le retour du partenaire — saisi par un humain, jamais déduit. */
  @Post('needs/:needId/external-sourcing/partner-briefs/:briefId/feedback')
  @RequirePermission('records:write')
  async recordPartnerBriefFeedback(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Param('briefId', ParseUUIDPipe) briefId: string,
    @Body() body: ExternalSourcingPartnerBriefFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ExternalSourcingPartnerBrief> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.externalSourcing.recordPartnerBriefFeedback(workspaceId, needId, briefId, body)
  }
}
